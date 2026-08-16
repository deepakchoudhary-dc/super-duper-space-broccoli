/**
 * Multi-Tier Atomic Rate Limiter
 * ------------------------------
 * Production-grade rate limiting with:
 *
 * 1. ATOMICITY — the check-and-increment happens inside a single Redis Lua
 *    script, so concurrent requests can never race past the limit (the old
 *    GET-then-INCR implementation in this codebase was racy).
 * 2. SLIDING WINDOW — uses a sorted set of timestamps, so bursts at window
 *    boundaries are smoothed (fixed-window allowed 2x traffic at edges).
 * 3. MULTI-TIER — an optional burst (per-second), hourly, and daily tier can
 *    be evaluated together; the first tier that overflows rejects the request.
 * 4. GRACEFUL DEGRADATION — when Redis is unavailable the limiter falls back
 *    to an in-process sliding window, so the gateway never hard-fails.
 *
 * The Lua script returns:
 *   { allowed, current, remaining, resetInSeconds }
 * for the most restrictive tier evaluated.
 */

const config = require('../config/env');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// In-memory fallback (single-process sliding window)
// ---------------------------------------------------------------------------
const memoryStore = new Map(); // key -> { timestamps: number[] }

const pruneMemory = (key, windowSeconds) => {
  const now = Date.now();
  const cutoff = now - windowSeconds * 1000;
  const entry = memoryStore.get(key);
  if (!entry) return null;
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
  return entry;
};

// ---------------------------------------------------------------------------
// Redis Lua scripts
// ---------------------------------------------------------------------------
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowSeconds = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local cutoff = now - (windowSeconds * 1000)

-- Remove expired timestamps
redis.call('ZREMRANGEBYSCORE', key, 0, cutoff)

-- Count current window
local count = redis.call('ZCARD', key)

local allowed = 0
if count < limit then
  redis.call('ZADD', key, now, now .. ':' .. math.random(1, 1000000000))
  redis.call('PEXPIRE', key, windowSeconds * 1000)
  count = count + 1
  allowed = 1
end

local oldest = redis.call('ZRANGE', key, 0, 0)
local resetMs
if oldest[1] then
  local oldestTs = tonumber(string.sub(oldest[1], 1, 13))
  resetMs = math.max(0, (oldestTs + windowSeconds * 1000) - now)
else
  resetMs = windowSeconds * 1000
end

return { allowed, count, resetMs }
`;

// ---------------------------------------------------------------------------
// Core evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate a single tier against Redis.
 * @param {import('redis').RedisClient} client
 * @param {string} identifier e.g. 'api_key:uuid'
 * @param {number} limit
 * @param {number} windowSeconds
 */
const evaluateRedisTier = async (client, identifier, limit, windowSeconds) => {
  const now = Date.now();
  const key = `rl:sw:${identifier}:${windowSeconds}s`;

  try {
    const result = await client.eval(SLIDING_WINDOW_LUA, {
      keys: [key],
      arguments: [String(now), String(windowSeconds), String(limit)]
    });
    // node-redis v4 returns arrays of strings/numbers
    const allowed = Number(result[0]) === 1;
    const current = Number(result[1]);
    const resetMs = Number(result[2]);
    return { allowed, current, remaining: Math.max(0, limit - current), resetInSeconds: Math.ceil(resetMs / 1000) };
  } catch (err) {
    logger.warn('Redis rate limiter eval failed, falling back to memory:', err.message);
    return evaluateMemoryTier(identifier, limit, windowSeconds);
  }
};

/**
 * Evaluate a single tier in memory (fallback when Redis is down).
 */
const evaluateMemoryTier = (identifier, limit, windowSeconds) => {
  const key = `mem:${identifier}:${windowSeconds}s`;
  const now = Date.now();
  const entry = pruneMemory(key, windowSeconds) || { timestamps: [] };

  // Prune is approximate — recount fresh
  const cutoff = now - windowSeconds * 1000;
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

  let current = entry.timestamps.length;
  let allowed = current < limit;
  if (allowed) {
    entry.timestamps.push(now);
    memoryStore.set(key, entry);
    current += 1;
  }
  const oldest = entry.timestamps.length > 0 ? entry.timestamps[0] : now;
  const resetInSeconds = Math.max(0, Math.ceil((oldest + windowSeconds * 1000 - now) / 1000));

  return {
    allowed,
    current,
    remaining: Math.max(0, limit - current),
    resetInSeconds
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check and record a request against configured tiers.
 *
 * Tiers (first-match-wins on rejection):
 * - burst:  per-second allowance
 * - hourly: per-hour allowance
 * - daily:  per-day allowance
 *
 * @param {string} identifier e.g. 'api_key:abc' or 'ip:1.2.3.4'
 * @param {object} opts override tier limits { burst, hourly, daily, default, window }
 * @returns {Promise<{allowed: boolean, current: number, remaining: number, resetInSeconds: number, tier: string|null}>}
 */
const checkRateLimit = async (identifier, opts = {}) => {
  const client = require('../config/redis').getRedisClient();
  const redisAvailable = client && client.isOpen;

  const tiers = [
    { name: 'burst', limit: opts.burst || config.rateLimit.burstLimit, window: 1 },
    { name: 'hourly', limit: opts.hourly || config.rateLimit.hourlyLimit, window: 3600 },
    { name: 'daily', limit: opts.daily || config.rateLimit.dailyLimit, window: 86400 },
    {
      name: 'default',
      limit: opts.limit || opts.default || config.rateLimit.defaultLimit,
      window: opts.window || config.rateLimit.defaultWindow
    }
  ].filter((t) => t.limit > 0);

  // Evaluate from most restrictive (smallest window) to least
  tiers.sort((a, b) => a.window - b.window);

  let result = {
    allowed: true,
    current: 0,
    remaining: Infinity,
    resetInSeconds: 0,
    tier: null
  };

  for (const tier of tiers) {
    let evaluated;
    if (redisAvailable) {
      evaluated = await evaluateRedisTier(client, identifier, tier.limit, tier.window);
    } else {
      evaluated = evaluateMemoryTier(identifier, tier.limit, tier.window);
    }

    // Track the most restrictive state for headers
    if (evaluated.remaining < result.remaining) {
      result = { ...evaluated, tier: tier.name };
    }

    if (!evaluated.allowed) {
      return {
        allowed: false,
        current: evaluated.current,
        remaining: evaluated.remaining,
        resetInSeconds: evaluated.resetInSeconds,
        tier: tier.name,
        limit: tier.limit
      };
    }
  }

  return result;
};

/**
 * Reset rate-limit state for an identifier (e.g. on key revocation).
 */
const resetRateLimit = async (identifier) => {
  const client = require('../config/redis').getRedisClient();
  if (client && client.isOpen) {
    try {
      const pattern = `rl:sw:${identifier}:*`;
      const keys = await client.keys(pattern);
      if (keys.length > 0) await client.del(keys);
    } catch (err) {
      logger.warn('Failed to reset rate limits in Redis:', err.message);
    }
  }
  // Clear memory fallback entries
  for (const key of [...memoryStore.keys()]) {
    if (key.startsWith(`mem:${identifier}:`)) {
      memoryStore.delete(key);
    }
  }
};

module.exports = { checkRateLimit, resetRateLimit };

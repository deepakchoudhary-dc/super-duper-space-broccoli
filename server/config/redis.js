const redis = require('redis');
const config = require('./env');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');

let redisClient;

const connectRedis = async () => {
  // Skip Redis connection for development if Redis is not running
  try {
    const clientOptions = {
      password: config.redis.password || undefined,
      socket: {
        connectTimeout: config.redis.connectTimeout,
        reconnectStrategy: false
      }
    };

    // Sentinel discovery mode: connect via a list of sentinels that resolve
    // the current primary. Falls back to a fixed host:port otherwise.
    if (config.redis.sentinels.length > 0 && config.redis.sentinelMaster) {
      clientOptions.sentinels = config.redis.sentinels;
      clientOptions.name = config.redis.sentinelMaster;
    } else {
      clientOptions.url = `redis://${config.redis.host}:${config.redis.port}`;
    }

    redisClient = redis.createClient(clientOptions);

    redisClient.on('error', (err) => {
      logger.warn('Redis not available, continuing without Redis');
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
      metrics.setRedisAvailable(true);
    });

    redisClient.on('disconnect', () => {
      logger.warn('Redis disconnected');
      metrics.setRedisAvailable(false);
    });

    redisClient.on('error', (err) => {
      metrics.setRedisAvailable(false);
    });

    // Try to connect with timeout
    await Promise.race([
      redisClient.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
  } catch (error) {
    logger.warn('Redis connection failed, continuing without Redis:', error.message);
    redisClient = null;
    metrics.setRedisAvailable(false);
    // Don't throw error, just continue without Redis
  }
};

/**
 * Get the Redis client instance (getter fixes CommonJS export-by-value bug).
 * @returns {object|null} The Redis client or null if not connected
 */
const getRedisClient = () => redisClient;

/**
 * Gracefully close the Redis connection and reset module state.
 * Used by integration tests (afterAll) and graceful shutdown paths so the
 * client socket never keeps the process (or Jest) alive.
 */
const disconnectRedis = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (err) {
      logger.warn('Error closing Redis connection:', err.message);
    }
    redisClient = null;
  }
};

/**
 * Check if Redis is connected and available.
 * @returns {boolean}
 */
const isRedisAvailable = () => {
  return redisClient !== null && redisClient !== undefined && redisClient.isOpen;
};

// NOTE: Rate limiting now lives in utils/rateLimiter.js (atomic Redis Lua
// sliding window + in-memory fallback). The racy GET-then-INCR fixed-window
// implementation was removed to prevent accidental use.

// Session management
const setSession = async (sessionId, data, expiry = 86400) => {
  if (!isRedisAvailable()) {
    logger.warn('Redis not available for session storage');
    return;
  }
  
  await redisClient.setEx(`session:${sessionId}`, expiry, JSON.stringify(data));
};

const getSession = async (sessionId) => {
  if (!isRedisAvailable()) {
    return null;
  }
  
  const data = await redisClient.get(`session:${sessionId}`);
  return data ? JSON.parse(data) : null;
};

const deleteSession = async (sessionId) => {
  if (!isRedisAvailable()) {
    return;
  }
  
  await redisClient.del(`session:${sessionId}`);
};

// Cache helpers
const setCache = async (key, data, expiry = 3600) => {
  if (!isRedisAvailable()) {
    return;
  }
  
  await redisClient.setEx(key, expiry, JSON.stringify(data));
};

const getCache = async (key) => {
  if (!isRedisAvailable()) {
    return null;
  }
  
  const data = await redisClient.get(key);
  return data ? JSON.parse(data) : null;
};

const deleteCache = async (key) => {
  if (!isRedisAvailable()) {
    return;
  }
  
  await redisClient.del(key);
};

// API key validation cache (now keyed by hash, not raw key)
const cacheApiKey = async (keyHash, keyData, expiry = 900) => {
  await setCache(`api_key_cache:${keyHash}`, keyData, expiry);
};

const getCachedApiKey = async (keyHash) => {
  return await getCache(`api_key_cache:${keyHash}`);
};

// ============================================================================
// TOKEN BLACKLIST — For JWT refresh token rotation & instant revocation
// ============================================================================

/**
 * Add a token (JTI or raw token hash) to the blacklist.
 * TTL should match the token's remaining lifetime.
 * 
 * @param {string} tokenId - The JWT ID (jti) or token hash
 * @param {number} ttlSeconds - Seconds until the blacklist entry expires
 */
const blacklistToken = async (tokenId, ttlSeconds = 2592000) => {
  if (!isRedisAvailable()) {
    logger.warn('Redis not available — token blacklist skipped (security risk)');
    return;
  }

  await redisClient.setEx(`token_blacklist:${tokenId}`, ttlSeconds, '1');
};

/**
 * Check if a token is blacklisted.
 * @param {string} tokenId - The JWT ID (jti) or token hash
 * @returns {boolean} true if blacklisted
 */
const isTokenBlacklisted = async (tokenId) => {
  if (!isRedisAvailable()) {
    return false; // Fail-open when Redis is down
  }

  const result = await redisClient.get(`token_blacklist:${tokenId}`);
  return result !== null;
};

/**
 * Refresh-token family store with graceful degradation.
 *
 * When Redis is unavailable the store falls back to an in-process map so that
 * stolen-token replay detection keeps working (previously it silently turned
 * off — a security regression on Redis blips). Revocation writes a REVOKED
 * sentinel instead of deleting, so every token of the family (old and new)
 * is rejected once the family has been revoked.
 */

const FAMILY_REVOKED = 'REVOKED';
const FAMILY_REVOKED_TTL_SECONDS = 24 * 60 * 60;
const memoryFamilies = new Map(); // familyId -> { value, expiresAt }

const setRefreshTokenFamily = async (familyId, currentTokenId, ttlSeconds = 2592000) => {
  if (!isRedisAvailable()) {
    memoryFamilies.set(familyId, {
      value: currentTokenId,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
    return;
  }
  await redisClient.setEx(`refresh_family:${familyId}`, ttlSeconds, currentTokenId);
};

const getRefreshTokenFamily = async (familyId) => {
  if (!isRedisAvailable()) {
    const entry = memoryFamilies.get(familyId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memoryFamilies.delete(familyId);
      return null;
    }
    return entry.value;
  }
  return await redisClient.get(`refresh_family:${familyId}`);
};

const revokeRefreshTokenFamily = async (familyId) => {
  if (!isRedisAvailable()) {
    memoryFamilies.set(familyId, {
      value: FAMILY_REVOKED,
      expiresAt: Date.now() + FAMILY_REVOKED_TTL_SECONDS * 1000
    });
    return;
  }
  await redisClient.setEx(`refresh_family:${familyId}`, FAMILY_REVOKED_TTL_SECONDS, FAMILY_REVOKED);
};

// Usage tracking
const incrementUsage = async (apiKeyId, endpoint) => {
  if (!isRedisAvailable()) {
    return;
  }
  
  const today = new Date().toISOString().split('T')[0];
  const hour = new Date().getHours();
  
  // Daily usage
  await redisClient.incr(`usage:daily:${apiKeyId}:${today}`);
  
  // Hourly usage
  await redisClient.incr(`usage:hourly:${apiKeyId}:${today}:${hour}`);
  
  // Endpoint usage
  await redisClient.incr(`usage:endpoint:${apiKeyId}:${endpoint}:${today}`);
  
  // Set expiration for usage keys (30 days)
  await redisClient.expire(`usage:daily:${apiKeyId}:${today}`, 30 * 24 * 3600);
  await redisClient.expire(`usage:hourly:${apiKeyId}:${today}:${hour}`, 30 * 24 * 3600);
  await redisClient.expire(`usage:endpoint:${apiKeyId}:${endpoint}:${today}`, 30 * 24 * 3600);
};

const getUsageStats = async (apiKeyId, days = 7) => {
  if (!isRedisAvailable()) {
    return { daily: {}, hourly: {}, endpoints: {} };
  }
  
  const stats = {
    daily: {},
    hourly: {},
    endpoints: {}
  };
  
  // Get daily usage for the last N days
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    const dailyUsage = await redisClient.get(`usage:daily:${apiKeyId}:${dateStr}`);
    stats.daily[dateStr] = parseInt(dailyUsage) || 0;
  }
  
  return stats;
};

module.exports = {
  getRedisClient,
  isRedisAvailable,
  connectRedis,
  disconnectRedis,
  setSession,
  getSession,
  deleteSession,
  setCache,
  getCache,
  deleteCache,
  cacheApiKey,
  getCachedApiKey,
  blacklistToken,
  isTokenBlacklisted,
  setRefreshTokenFamily,
  getRefreshTokenFamily,
  revokeRefreshTokenFamily,
  incrementUsage,
  getUsageStats
};

/**
 * Gateway Response Cache
 * ----------------------
 * Caches cacheable upstream GET/HEAD responses so repeated identical requests
 * are served without hitting the upstream (latency win, upstream offload).
 *
 * Design decisions:
 *  - Keyed by (keyId + method + path + query) so one consumer's cached
 *    response can never leak to another consumer.
 *  - Respects upstream `Cache-Control` (no-store/private/max-age) and never
 *    caches responses with Set-Cookie.
 *  - Redis-backed with an in-process fallback when Redis is unavailable,
 *    mirroring the rate limiter's graceful-degradation pattern.
 *  - `clearResponseCacheForKey` is invoked on key revoke/rotate/regenerate so
 *    a retired key cannot keep serving cached data.
 */

const crypto = require('crypto');
const config = require('../config/env');
const logger = require('./logger');

// In-memory fallback: cacheKey -> { body, headers, statusCode, expiresAt }
const memoryStore = new Map();

const buildCacheKey = (keyId, method, path, query) => {
  const raw = `${method}:${path}${query ? '?' + query : ''}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
  return `cache:resp:${keyId}:${hash}`;
};

const isRedisUp = () => {
  try {
    const client = require('../config/redis').getRedisClient();
    return !!(client && client.isOpen);
  } catch (err) {
    return false;
  }
};

/**
 * Decide whether a response is cacheable.
 * @param {number} statusCode
 * @param {object} headers upstream response headers (lowercased keys)
 * @param {Buffer} body
 */
const isCacheable = (statusCode, headers, body) => {
  if (!(statusCode >= 200 && statusCode < 400)) return false;
  if (headers['set-cookie']) return false;

  const cc = (headers['cache-control'] || '').toLowerCase();
  if (cc.includes('no-store') || cc.includes('no-cache') || cc.includes('private')) return false;

  if (body && body.length > config.caching.maxBodyBytes) return false;

  return true;
};

/**
 * Effective TTL for a response: honor upstream max-age, capped by config TTL.
 */
const effectiveTtlSeconds = (headers) => {
  const cc = (headers['cache-control'] || '').toLowerCase();
  const match = /max-age=(\d+)/.exec(cc);
  const upstreamTtl = match ? parseInt(match[1], 10) : config.caching.ttlSeconds;
  return Math.max(1, Math.min(upstreamTtl, config.caching.ttlSeconds));
};

const getResponseCache = async (keyId, method, path, query) => {
  if (!config.caching.enabled || (method !== 'GET' && method !== 'HEAD')) return null;

  const cacheKey = buildCacheKey(keyId, method, path, query);

  if (isRedisUp()) {
    try {
      const client = require('../config/redis').getRedisClient();
      const raw = await client.get(cacheKey);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      return {
        ...entry,
        body: Buffer.from(entry.body, 'base64'),
        fromCache: true
      };
    } catch (err) {
      logger.warn('Response cache read failed (redis), falling back to memory:', err.message);
    }
  }

  const entry = memoryStore.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(cacheKey);
    return null;
  }
  return { ...entry, fromCache: true };
};

const setResponseCache = async (keyId, method, path, query, statusCode, headers, body) => {
  if (!config.caching.enabled || (method !== 'GET' && method !== 'HEAD')) return;
  if (!isCacheable(statusCode, headers, body)) return;

  const cacheKey = buildCacheKey(keyId, method, path, query);
  const ttlSeconds = effectiveTtlSeconds(headers);
  const safeHeaders = { ...headers };
  delete safeHeaders['set-cookie'];

  const entry = {
    body: body.toString('base64'),
    headers: safeHeaders,
    statusCode,
    method,
    path,
    query,
    createdAt: Date.now()
  };

  if (isRedisUp()) {
    try {
      const client = require('../config/redis').getRedisClient();
      await client.setEx(cacheKey, ttlSeconds, JSON.stringify(entry));
      return;
    } catch (err) {
      logger.warn('Response cache write failed (redis), falling back to memory:', err.message);
    }
  }

  memoryStore.set(cacheKey, {
    body,
    headers: safeHeaders,
    statusCode,
    method,
    path,
    query,
    expiresAt: Date.now() + ttlSeconds * 1000
  });
};

/**
 * Invalidate every cached response belonging to a key (revoke/rotate/delete).
 */
const clearResponseCacheForKey = async (keyId) => {
  const prefix = `cache:resp:${keyId}:`;
  if (isRedisUp()) {
    try {
      const client = require('../config/redis').getRedisClient();
      const keys = await client.keys(`${prefix}*`);
      if (keys.length > 0) await client.del(keys);
    } catch (err) {
      logger.warn('Response cache invalidation failed (redis):', err.message);
    }
  }
  for (const key of [...memoryStore.keys()]) {
    if (key.startsWith(prefix)) {
      memoryStore.delete(key);
    }
  }
};

module.exports = {
  getResponseCache,
  setResponseCache,
  clearResponseCacheForKey,
  isCacheable,
  effectiveTtlSeconds,
  buildCacheKey
};

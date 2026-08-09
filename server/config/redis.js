const redis = require('redis');
const logger = require('../utils/logger');

let redisClient;

const connectRedis = async () => {
  // Skip Redis connection for development if Redis is not running
  try {
    redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: false
      }
    });

    redisClient.on('error', (err) => {
      logger.warn('Redis not available, continuing without Redis');
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('disconnect', () => {
      logger.warn('Redis disconnected');
    });

    // Try to connect with timeout
    await Promise.race([
      redisClient.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
  } catch (error) {
    logger.warn('Redis connection failed, continuing without Redis:', error.message);
    redisClient = null;
    // Don't throw error, just continue without Redis
  }
};

/**
 * Get the Redis client instance (getter fixes CommonJS export-by-value bug).
 * @returns {object|null} The Redis client or null if not connected
 */
const getRedisClient = () => redisClient;

/**
 * Check if Redis is connected and available.
 * @returns {boolean}
 */
const isRedisAvailable = () => {
  return redisClient !== null && redisClient !== undefined && redisClient.isOpen;
};

// Rate limiting helpers
const rateLimitKey = (identifier, window = 3600) => {
  const windowStart = Math.floor(Date.now() / 1000 / window) * window;
  return `rate_limit:${identifier}:${windowStart}`;
};

const checkRateLimit = async (identifier, limit = 1000, window = 3600) => {
  if (!isRedisAvailable()) {
    // Fail-open when Redis is down (configurable)
    return { allowed: true, current: 0, limit, resetTime: 0 };
  }

  const key = rateLimitKey(identifier, window);
  const current = await redisClient.get(key);
  
  if (current && parseInt(current) >= limit) {
    return {
      allowed: false,
      current: parseInt(current),
      limit,
      resetTime: Math.floor(Date.now() / 1000 / window) * window + window
    };
  }

  const newCount = await redisClient.incr(key);
  await redisClient.expire(key, window);

  return {
    allowed: true,
    current: newCount,
    limit,
    resetTime: Math.floor(Date.now() / 1000 / window) * window + window
  };
};

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
 * Store a refresh token family for rotation tracking.
 * When a refresh token is used, the family ID links parent→child tokens.
 * If an old child is reused, the entire family is revoked.
 * 
 * @param {string} familyId - UUID identifying the token family
 * @param {string} currentTokenId - The currently valid token's JTI
 * @param {number} ttlSeconds - TTL matching refresh token expiry
 */
const setRefreshTokenFamily = async (familyId, currentTokenId, ttlSeconds = 2592000) => {
  if (!isRedisAvailable()) return;
  await redisClient.setEx(`refresh_family:${familyId}`, ttlSeconds, currentTokenId);
};

/**
 * Get the currently valid token ID for a refresh token family.
 * @param {string} familyId 
 * @returns {string|null} The current valid JTI, or null
 */
const getRefreshTokenFamily = async (familyId) => {
  if (!isRedisAvailable()) return null;
  return await redisClient.get(`refresh_family:${familyId}`);
};

/**
 * Revoke an entire refresh token family (stolen token detection).
 * @param {string} familyId 
 */
const revokeRefreshTokenFamily = async (familyId) => {
  if (!isRedisAvailable()) return;
  await redisClient.del(`refresh_family:${familyId}`);
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
  checkRateLimit,
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

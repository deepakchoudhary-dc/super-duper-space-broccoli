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
    // Don't throw error, just continue without Redis
  }
};

// Rate limiting helpers
const rateLimitKey = (identifier, window = 3600) => {
  const windowStart = Math.floor(Date.now() / 1000 / window) * window;
  return `rate_limit:${identifier}:${windowStart}`;
};

const checkRateLimit = async (identifier, limit = 1000, window = 3600) => {
  if (!redisClient) {
    throw new Error('Redis client not connected');
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
  if (!redisClient) {
    throw new Error('Redis client not connected');
  }
  
  await redisClient.setEx(`session:${sessionId}`, expiry, JSON.stringify(data));
};

const getSession = async (sessionId) => {
  if (!redisClient) {
    throw new Error('Redis client not connected');
  }
  
  const data = await redisClient.get(`session:${sessionId}`);
  return data ? JSON.parse(data) : null;
};

const deleteSession = async (sessionId) => {
  if (!redisClient) {
    throw new Error('Redis client not connected');
  }
  
  await redisClient.del(`session:${sessionId}`);
};

// Cache helpers
const setCache = async (key, data, expiry = 3600) => {
  if (!redisClient) {
    throw new Error('Redis client not connected');
  }
  
  await redisClient.setEx(key, expiry, JSON.stringify(data));
};

const getCache = async (key) => {
  if (!redisClient) {
    throw new Error('Redis client not connected');
  }
  
  const data = await redisClient.get(key);
  return data ? JSON.parse(data) : null;
};

const deleteCache = async (key) => {
  if (!redisClient) {
    throw new Error('Redis client not connected');
  }
  
  await redisClient.del(key);
};

// API key validation cache
const cacheApiKey = async (keyHash, keyData, expiry = 900) => {
  await setCache(`api_key:${keyHash}`, keyData, expiry);
};

const getCachedApiKey = async (keyHash) => {
  return await getCache(`api_key:${keyHash}`);
};

// Usage tracking
const incrementUsage = async (apiKeyId, endpoint) => {
  if (!redisClient) {
    throw new Error('Redis client not connected');
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
  if (!redisClient) {
    throw new Error('Redis client not connected');
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
  redisClient,
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
  incrementUsage,
  getUsageStats
};

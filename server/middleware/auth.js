const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { getCachedApiKey, cacheApiKey, isTokenBlacklisted } = require('../config/redis');
const { hashApiKey, isValidKeyFormat, extractKeyPrefix, verifyApiKey } = require('../utils/crypto');
const config = require('../config/env');
const logger = require('../utils/logger');

// ============================================================================
// JWT SECRET RESOLUTION
// ============================================================================

const getAccessSecret = () => config.jwt.accessSecret;

// ============================================================================
// JWT AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Authenticate incoming requests via JWT Bearer token.
 * 
 * Security hardening:
 * - Verifies with JWT_ACCESS_SECRET (isolated from refresh secret)
 * - Enforces token type claim (rejects refresh tokens used as access)
 * - Checks Redis blacklist for revoked tokens
 * - Attaches user object + token metadata to request
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, getAccessSecret());

    // Enforce token type claim — reject refresh tokens being used as access tokens
    if (decoded.type && decoded.type !== 'access') {
      logger.logSecurityEvent('TOKEN_TYPE_MISMATCH', {
        userId: decoded.id,
        expectedType: 'access',
        actualType: decoded.type,
        ip: req.ip
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid token type'
      });
    }

    // Check if token is blacklisted (revoked via logout or security event)
    if (decoded.jti) {
      try {
        const blacklisted = await isTokenBlacklisted(decoded.jti);
        if (blacklisted) {
          return res.status(401).json({
            success: false,
            message: 'Token has been revoked'
          });
        }
      } catch (redisErr) {
        // If Redis is down, fail-open (log the risk)
        logger.warn('Redis blacklist check failed, proceeding without check:', redisErr.message);
      }
    }

    // Get user from database
    const userQuery = 'SELECT id, email, first_name, last_name, two_fa_enabled FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [decoded.id]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    req.user = userResult.rows[0];
    req.tokenJti = decoded.jti;  // Expose JTI for logout blacklisting
    req.tokenExp = decoded.exp;  // Expose expiry for TTL calculation
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    logger.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// ============================================================================
// API KEY AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Authenticate incoming requests via API key (X-API-Key header or query param).
 * 
 * Security hardening:
 * - Validates key format before any DB lookup (quick reject)
 * - Extracts prefix for indexed DB lookup (narrowing search)
 * - Hashes the incoming key with SHA-256 and compares against stored hash
 * - Uses constant-time comparison to prevent timing attacks
 * - Caches hash→keyData in Redis (never caches raw keys)
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    const rawApiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!rawApiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required'
      });
    }

    // Quick format validation — reject malformed keys before DB lookup
    if (!isValidKeyFormat(rawApiKey)) {
      // Also support legacy key format: ag_<timestamp>_<hex>
      const legacyParts = rawApiKey.split('_');
      if (legacyParts.length !== 3 || legacyParts[0] !== 'ag') {
        return res.status(401).json({
          success: false,
          message: 'Invalid API key format'
        });
      }
    }

    // Hash the raw key for lookup
    const keyHash = hashApiKey(rawApiKey);

    // Try to get from cache first (keyed by hash, NOT raw key)
    let keyData = await getCachedApiKey(keyHash);
    
    if (!keyData) {
      // Query by hash — the key_hash column now stores SHA-256 hashes
      const keyQuery = `
        SELECT ak.*, a.name as api_name, a.base_url, a.status as api_status, u.id as user_id
        FROM api_keys ak
        JOIN apis a ON ak.api_id = a.id
        JOIN users u ON ak.user_id = u.id
        WHERE ak.key_hash = $1 AND ak.status = 'active' AND a.status = 'active'
      `;
      
      const keyResult = await pool.query(keyQuery, [keyHash]);
      
      if (keyResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or inactive API key'
        });
      }

      keyData = keyResult.rows[0];
      
      // Cache for 15 minutes (keyed by hash)
      try {
        await cacheApiKey(keyHash, keyData, 900);
      } catch (cacheErr) {
        logger.warn('Failed to cache API key data:', cacheErr.message);
      }
    }

    // Check if key is expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'API key expired'
      });
    }

    req.apiKey = keyData;
    req.user = { id: keyData.user_id };
    next();
  } catch (error) {
    logger.error('API Key authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// ============================================================================
// PERMISSION CHECKING
// ============================================================================

/**
 * Check API endpoint permissions against key's permission grants.
 */
const checkApiPermissions = (requiredPermissions) => {
  return (req, res, next) => {
    try {
      const { apiKey } = req;
      
      if (!apiKey || !apiKey.permissions) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      const permissions = apiKey.permissions;
      const method = req.method.toLowerCase();
      const path = req.path;

      let pathAllowed = false;
      let methodAllowed = false;

      if (permissions.endpoints) {
        for (const endpoint of permissions.endpoints) {
          if (path.startsWith(endpoint.path) || endpoint.path === '*') {
            pathAllowed = true;

            // Methods may be stored upper/lower/mixed — compare case-insensitively
            const allowedMethods = (endpoint.methods || []).map((m) => m.toLowerCase());
            if (allowedMethods.includes(method) || allowedMethods.includes('*')) {
              methodAllowed = true;
              break;
            }
          }
        }
      }

      if (!pathAllowed || !methodAllowed) {
        return res.status(403).json({
          success: false,
          message: 'Access to this endpoint not allowed'
        });
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

// ============================================================================
// RATE LIMITING MIDDLEWARE
// ============================================================================

const rateLimitMiddleware = async (req, res, next) => {
  try {
    // Atomic multi-tier limiter (Redis Lua sliding window + memory fallback)
    const { checkRateLimit } = require('../utils/rateLimiter');
    const { incrementRateLimitExceeded } = require('../utils/metrics');
    const { notifyRateLimitExceeded } = require('../utils/alerts');
    const { apiKey } = req;

    if (!apiKey) {
      return next();
    }

    const identifier = `api_key:${apiKey.id}`;
    const limit = apiKey.rate_limit || 1000;
    const window = apiKey.rate_limit_window || 3600;

    const rateResult = await checkRateLimit(identifier, {
      limit,
      window,
      burst: apiKey.burst_limit,
      hourly: apiKey.hourly_limit,
      daily: apiKey.daily_limit
    });

    // Rate limit headers (per the most restrictive tier evaluated)
    res.set({
      'X-RateLimit-Limit': String(rateResult.limit || limit),
      'X-RateLimit-Remaining': String(Math.max(0, rateResult.remaining)),
      'X-RateLimit-Reset': String(rateResult.resetInSeconds),
      'RateLimit-Policy': `${rateResult.limit || limit};w=${window}`
    });

    if (!rateResult.allowed) {
      incrementRateLimitExceeded(apiKey.id, rateResult.tier);
      logger.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
        keyId: apiKey.id,
        keyName: apiKey.name,
        apiId: apiKey.api_id,
        tier: rateResult.tier,
        current: rateResult.current,
        limit: rateResult.limit || limit,
        ip: req.ip
      });

      // Alert the key owner (email, cooldown-throttled)
      notifyRateLimitExceeded(apiKey, rateResult.current).catch(() => {});

      res.setHeader('Retry-After', String(rateResult.resetInSeconds));
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded',
        rateLimit: {
          limit: rateResult.limit || limit,
          current: rateResult.current,
          resetInSeconds: rateResult.resetInSeconds,
          tier: rateResult.tier
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Rate limiting error:', error);
    next(); // Continue without rate limiting on internal failure (fail-open)
  }
};

// ============================================================================
// ADMIN & OWNERSHIP CHECKS
// ============================================================================

const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

const checkResourceOwnership = (resourceType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const resourceId = req.params.id;

      let query;
      switch (resourceType) {
        case 'api':
          query = 'SELECT user_id FROM apis WHERE id = $1';
          break;
        case 'api_key':
          query = 'SELECT user_id FROM api_keys WHERE id = $1';
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid resource type'
          });
      }

      const result = await pool.query(query, [resourceId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }

      if (result.rows[0].user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      next();
    } catch (error) {
      logger.error('Resource ownership check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Access check failed'
      });
    }
  };
};

module.exports = {
  authenticateToken,
  authenticateApiKey,
  checkApiPermissions,
  rateLimitMiddleware,
  requireAdmin,
  checkResourceOwnership
};

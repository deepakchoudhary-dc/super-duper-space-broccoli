const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { getCachedApiKey } = require('../config/redis');
const logger = require('../utils/logger');

// JWT Authentication middleware
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
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
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
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

    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// API Key authentication middleware
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required'
      });
    }

    // Extract key prefix and check format
    const keyParts = apiKey.split('_');
    if (keyParts.length !== 3 || keyParts[0] !== 'ag') {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key format'
      });
    }

    // Try to get from cache first
    let keyData = await getCachedApiKey(apiKey);
    
    if (!keyData) {
      // Get from database
      const keyQuery = `
        SELECT ak.*, a.name as api_name, a.base_url, a.status as api_status, u.id as user_id
        FROM api_keys ak
        JOIN apis a ON ak.api_id = a.id
        JOIN users u ON ak.user_id = u.id
        WHERE ak.key_hash = $1 AND ak.status = 'active' AND a.status = 'active'
      `;
      
      const keyResult = await pool.query(keyQuery, [apiKey]);
      
      if (keyResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or inactive API key'
        });
      }

      keyData = keyResult.rows[0];
      
      // Cache for 15 minutes
      await require('../config/redis').cacheApiKey(apiKey, keyData, 900);
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

// Check API permissions
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

      // Check if the path is allowed
      let pathAllowed = false;
      let methodAllowed = false;

      if (permissions.endpoints) {
        for (const endpoint of permissions.endpoints) {
          // Simple path matching (can be enhanced with regex)
          if (path.startsWith(endpoint.path) || endpoint.path === '*') {
            pathAllowed = true;
            
            // Check method permissions
            if (endpoint.methods.includes(method) || endpoint.methods.includes('*')) {
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

// Rate limiting middleware
const rateLimitMiddleware = async (req, res, next) => {
  try {
    const { checkRateLimit } = require('../config/redis');
    const { apiKey } = req;
    
    if (!apiKey) {
      return next();
    }

    const identifier = `api_key:${apiKey.id}`;
    const limit = apiKey.rate_limit || 1000;
    const window = apiKey.rate_limit_window || 3600;

    const rateResult = await checkRateLimit(identifier, limit, window);

    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': limit,
      'X-RateLimit-Remaining': Math.max(0, limit - rateResult.current),
      'X-RateLimit-Reset': rateResult.resetTime
    });

    if (!rateResult.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded',
        rateLimit: {
          limit,
          current: rateResult.current,
          resetTime: rateResult.resetTime
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Rate limiting error:', error);
    next(); // Continue without rate limiting if Redis fails
  }
};

// Admin check middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

// Resource ownership check
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

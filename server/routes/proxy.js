const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');

const { pool } = require('../config/database');
const { 
  authenticateApiKey, 
  rateLimitMiddleware, 
  checkApiPermissions 
} = require('../middleware/auth');
const { incrementUsage } = require('../config/redis');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware to log API usage
const logApiUsage = async (req, res, next) => {
  const startTime = Date.now();
  
  // Store original res.end to intercept response
  const originalEnd = res.end;
  let responseBody = '';
  
  res.end = function(chunk, encoding) {
    if (chunk) {
      responseBody += chunk.toString();
    }
    
    // Log the API usage
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    // Log to database
    const logUsage = async () => {
      try {
        if (req.apiKey) {
          const usageQuery = `
            INSERT INTO api_usage_logs (
              api_id, api_key_id, user_id, method, endpoint, 
              status_code, response_time, request_size, response_size,
              ip_address, user_agent, error_message
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `;
          
          const requestSize = req.get('content-length') || 0;
          const responseSize = Buffer.byteLength(responseBody);
          const errorMessage = res.statusCode >= 400 ? responseBody : null;
          
          await pool.query(usageQuery, [
            req.apiKey.api_id,
            req.apiKey.id,
            req.user.id,
            req.method,
            req.path,
            res.statusCode,
            responseTime,
            parseInt(requestSize),
            responseSize,
            req.ip,
            req.get('User-Agent'),
            errorMessage
          ]);
          
          // Update Redis usage stats
          await incrementUsage(req.apiKey.id, req.path);
          
          // Update last_used timestamp
          await pool.query(
            'UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = $1',
            [req.apiKey.id]
          );
        }
        
        // Log to file
        logger.logApiUsage({
          apiId: req.apiKey?.api_id,
          keyId: req.apiKey?.id,
          userId: req.user?.id,
          method: req.method,
          endpoint: req.path,
          statusCode: res.statusCode,
          responseTime,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        
      } catch (error) {
        logger.error('Failed to log API usage:', error);
      }
    };
    
    logUsage();
    
    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

// Middleware to validate API endpoint permissions
const validateEndpointPermissions = (req, res, next) => {
  try {
    const { apiKey } = req;
    
    if (!apiKey || !apiKey.permissions) {
      return res.status(403).json({
        success: false,
        message: 'No permissions defined for this API key'
      });
    }
    
    const permissions = apiKey.permissions;
    const method = req.method.toLowerCase();
    const path = req.path;
    
    // Check if the endpoint is allowed
    let allowed = false;
    
    if (permissions.endpoints) {
      for (const endpoint of permissions.endpoints) {
        // Simple path matching (can be enhanced with regex or glob patterns)
        const endpointPath = endpoint.path.replace(/\*/g, '.*');
        const pathRegex = new RegExp(`^${endpointPath}$`);
        
        if (pathRegex.test(path) || endpoint.path === '*') {
          // Check method permissions
          if (endpoint.methods.includes(method) || endpoint.methods.includes('*')) {
            allowed = true;
            break;
          }
        }
      }
    }
    
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: `Access denied: ${method.toUpperCase()} ${path} not allowed for this API key`,
        permissions: permissions.endpoints
      });
    }
    
    next();
  } catch (error) {
    logger.error('Permission validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Permission validation failed'
    });
  }
};

// Proxy endpoint: /proxy/:userId/:apiId/*
router.use('/:userId/:apiId/*', 
  authenticateApiKey,
  rateLimitMiddleware,
  validateEndpointPermissions,
  logApiUsage,
  (req, res, next) => {
    const { userId, apiId } = req.params;
    const targetPath = req.params[0] || '';
    
    // Validate that the API key belongs to the correct API
    if (req.apiKey.api_id !== apiId) {
      return res.status(403).json({
        success: false,
        message: 'API key does not belong to the specified API'
      });
    }
    
    // Validate that the API belongs to the correct user
    if (req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'API key does not belong to the specified user'
      });
    }
    
    // Create proxy middleware
    const proxyMiddleware = createProxyMiddleware({
      target: req.apiKey.base_url,
      changeOrigin: true,
      pathRewrite: {
        [`^/proxy/${userId}/${apiId}/`]: '/'
      },
      onProxyReq: (proxyReq, req, res) => {
        // Add custom headers if needed
        proxyReq.setHeader('X-API-Guardian-Key', req.apiKey.id);
        proxyReq.setHeader('X-API-Guardian-User', req.user.id);
        
        // Add original IP
        proxyReq.setHeader('X-Forwarded-For', req.ip);
        proxyReq.setHeader('X-Real-IP', req.ip);
        
        logger.debug('Proxying request', {
          originalUrl: req.originalUrl,
          targetUrl: `${req.apiKey.base_url}/${targetPath}`,
          method: req.method,
          headers: req.headers
        });
      },
      onProxyRes: (proxyRes, req, res) => {
        // Add CORS headers
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-API-Key';
        
        // Add API Guardian headers
        proxyRes.headers['X-API-Guardian-Key-ID'] = req.apiKey.id;
        proxyRes.headers['X-API-Guardian-Rate-Limit'] = req.apiKey.rate_limit;
        proxyRes.headers['X-API-Guardian-Rate-Window'] = req.apiKey.rate_limit_window;
        
        logger.debug('Proxy response', {
          statusCode: proxyRes.statusCode,
          headers: proxyRes.headers
        });
      },
      onError: (err, req, res) => {
        logger.error('Proxy error:', {
          error: err.message,
          url: req.url,
          target: req.apiKey?.base_url
        });
        
        res.status(502).json({
          success: false,
          message: 'Bad Gateway - Unable to reach target API',
          error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }
    });
    
    proxyMiddleware(req, res, next);
  }
);

// Health check endpoint for proxy
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Gateway is healthy',
    timestamp: new Date().toISOString()
  });
});

// Get proxy statistics
router.get('/stats', authenticateApiKey, async (req, res) => {
  try {
    const { apiKey } = req;
    const { days = 7 } = req.query;
    
    // Get usage statistics for this API key
    const statsQuery = `
      SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as successful_requests,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_requests,
        AVG(response_time) as avg_response_time,
        MIN(created_at) as first_request,
        MAX(created_at) as last_request
      FROM api_usage_logs 
      WHERE api_key_id = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${parseInt(days)} days'
    `;
    
    const statsResult = await pool.query(statsQuery, [apiKey.id]);
    const stats = statsResult.rows[0];
    
    // Get hourly usage for the last 24 hours
    const hourlyQuery = `
      SELECT 
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as requests
      FROM api_usage_logs 
      WHERE api_key_id = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY hour DESC
    `;
    
    const hourlyResult = await pool.query(hourlyQuery, [apiKey.id]);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalRequests: parseInt(stats.total_requests),
          successfulRequests: parseInt(stats.successful_requests),
          errorRequests: parseInt(stats.error_requests),
          avgResponseTime: parseFloat(stats.avg_response_time) || 0,
          firstRequest: stats.first_request,
          lastRequest: stats.last_request
        },
        hourlyUsage: hourlyResult.rows.map(row => ({
          hour: row.hour,
          requests: parseInt(row.requests)
        })),
        keyInfo: {
          id: apiKey.id,
          name: apiKey.name,
          rateLimit: apiKey.rate_limit,
          rateLimitWindow: apiKey.rate_limit_window,
          status: apiKey.status
        }
      }
    });
    
  } catch (error) {
    logger.error('Get proxy stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve proxy statistics'
    });
  }
});

// Test endpoint for API key validation
router.get('/test', authenticateApiKey, (req, res) => {
  res.json({
    success: true,
    message: 'API key is valid and working',
    data: {
      keyId: req.apiKey.id,
      keyName: req.apiKey.name,
      apiName: req.apiKey.api_name,
      permissions: req.apiKey.permissions,
      rateLimit: {
        limit: req.apiKey.rate_limit,
        window: req.apiKey.rate_limit_window
      },
      timestamp: new Date().toISOString()
    }
  });
});

// Handle preflight requests for CORS
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(200);
});

module.exports = router;

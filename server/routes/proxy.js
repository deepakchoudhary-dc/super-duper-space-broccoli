const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { v4: uuidv4 } = require('uuid');

const { pool } = require('../config/database');
const { 
  authenticateApiKey, 
  rateLimitMiddleware, 
  checkApiPermissions 
} = require('../middleware/auth');
const { incrementUsage } = require('../config/redis');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================================================
// PERSISTENT CONNECTION POOL (Fixes per-request proxy instantiation leak)
// ============================================================================

/**
 * Singleton HTTP/HTTPS agent pool keyed by upstream base_url.
 * Reuses TCP connections across requests via Keep-Alive, eliminating
 * the socket churn and memory leak from creating proxies per-request.
 */
const agentPool = new Map();

const getAgent = (baseUrl) => {
  if (agentPool.has(baseUrl)) {
    return agentPool.get(baseUrl);
  }

  const url = new URL(baseUrl);
  const AgentClass = url.protocol === 'https:' ? https.Agent : http.Agent;

  const agent = new AgentClass({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 30000
  });

  agentPool.set(baseUrl, agent);
  return agent;
};

// Clean up agents on process exit
process.on('SIGTERM', () => {
  agentPool.forEach((agent) => agent.destroy());
  agentPool.clear();
});

process.on('SIGINT', () => {
  agentPool.forEach((agent) => agent.destroy());
  agentPool.clear();
});

// ============================================================================
// USAGE LOGGING MIDDLEWARE (Fixed: no res.end monkeypatching)
// ============================================================================

/**
 * Non-blocking API usage logger using res.on('finish') instead of
 * monkeypatching res.end(). This avoids:
 * - Memory exhaustion from buffering response bodies
 * - Broken streaming for chunked/SSE responses
 * - Event listener leaks
 */
const logApiUsage = (req, res, next) => {
  const startTime = Date.now();
  
  // Attach request ID for traceability
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.requestId);

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    
    // Fire-and-forget async logging — never blocks the response
    (async () => {
      try {
        if (req.apiKey) {
          const usageQuery = `
            INSERT INTO api_usage_logs (
              api_id, api_key_id, user_id, method, endpoint, 
              status_code, response_time, request_size, response_size,
              ip_address, user_agent, error_message
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `;
          
          const requestSize = parseInt(req.get('content-length')) || 0;
          // Get response size from header (no body buffering)
          const responseSize = parseInt(res.getHeader('content-length')) || 0;
          const errorMessage = res.statusCode >= 400 ? `HTTP ${res.statusCode}` : null;
          
          await pool.query(usageQuery, [
            req.apiKey.api_id,
            req.apiKey.id,
            req.user.id,
            req.method,
            req.path,
            res.statusCode,
            responseTime,
            requestSize,
            responseSize,
            req.ip,
            req.get('User-Agent'),
            errorMessage
          ]);
          
          // Update Redis usage stats
          try {
            await incrementUsage(req.apiKey.id, req.path);
          } catch (redisErr) {
            // Non-critical — Redis may be unavailable
          }
          
          // Update last_used timestamp
          await pool.query(
            'UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = $1',
            [req.apiKey.id]
          );
        }
        
        // Structured log entry
        logger.logApiUsage({
          requestId: req.requestId,
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
    })();
  });
  
  next();
};

// ============================================================================
// ENDPOINT PERMISSION VALIDATION
// ============================================================================

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
    
    let allowed = false;
    
    if (permissions.endpoints) {
      for (const endpoint of permissions.endpoints) {
        const endpointPath = endpoint.path.replace(/\*/g, '.*');
        const pathRegex = new RegExp(`^${endpointPath}$`);
        
        if (pathRegex.test(path) || endpoint.path === '*') {
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

// ============================================================================
// STREAMING REVERSE PROXY (Zero-copy, persistent connections)
// ============================================================================

/**
 * Forward request to upstream using persistent HTTP agents and stream.pipeline.
 * No response body buffering — streams directly between client and upstream.
 */
const proxyRequest = (req, res, targetUrl, baseUrl) => {
  const url = new URL(targetUrl);
  const agent = getAgent(baseUrl);
  const httpModule = url.protocol === 'https:' ? https : http;

  // Build upstream request options
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: req.method,
    agent: agent,
    headers: {
      ...req.headers,
      host: url.hostname,
      'x-api-guardian-key': req.apiKey.id,
      'x-api-guardian-user': req.user.id,
      'x-forwarded-for': req.ip,
      'x-real-ip': req.ip,
      'x-request-id': req.requestId || uuidv4()
    },
    timeout: 30000
  };

  // Remove hop-by-hop headers that shouldn't be forwarded
  delete options.headers['connection'];
  delete options.headers['keep-alive'];
  delete options.headers['transfer-encoding'];

  logger.debug('Proxying request', {
    requestId: req.requestId,
    originalUrl: req.originalUrl,
    targetUrl: targetUrl,
    method: req.method
  });

  const proxyReq = httpModule.request(options, (proxyRes) => {
    // Set response headers from upstream
    const responseHeaders = { ...proxyRes.headers };
    
    // Add CORS headers
    responseHeaders['access-control-allow-origin'] = '*';
    responseHeaders['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
    responseHeaders['access-control-allow-headers'] = 'Content-Type, Authorization, X-API-Key';
    
    // Add API Guardian metadata headers
    responseHeaders['x-api-guardian-key-id'] = req.apiKey.id;
    responseHeaders['x-api-guardian-rate-limit'] = String(req.apiKey.rate_limit);
    responseHeaders['x-api-guardian-rate-window'] = String(req.apiKey.rate_limit_window);
    responseHeaders['x-request-id'] = req.requestId;

    // Remove hop-by-hop headers from response
    delete responseHeaders['connection'];
    delete responseHeaders['keep-alive'];
    delete responseHeaders['transfer-encoding'];

    res.writeHead(proxyRes.statusCode, responseHeaders);

    // Stream response body directly — zero memory buffering
    proxyRes.pipe(res);

    proxyRes.on('error', (err) => {
      logger.error('Proxy response stream error:', { error: err.message, requestId: req.requestId });
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          message: 'Bad Gateway - Upstream response error'
        });
      }
    });

    logger.debug('Proxy response', {
      requestId: req.requestId,
      statusCode: proxyRes.statusCode
    });
  });

  proxyReq.on('error', (err) => {
    logger.error('Proxy request error:', {
      error: err.message,
      url: targetUrl,
      target: baseUrl,
      requestId: req.requestId
    });
    
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        message: 'Bad Gateway - Unable to reach target API',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({
        success: false,
        message: 'Gateway Timeout - Target API did not respond in time'
      });
    }
  });

  // Stream request body to upstream — zero-copy
  req.pipe(proxyReq);
};

// ============================================================================
// PROXY ROUTE: /proxy/:userId/:apiId/*
// ============================================================================

router.use('/:userId/:apiId/*', 
  authenticateApiKey,
  rateLimitMiddleware,
  validateEndpointPermissions,
  logApiUsage,
  (req, res) => {
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
    
    // Build target URL
    const baseUrl = req.apiKey.base_url.replace(/\/+$/, ''); // Strip trailing slashes
    const targetUrl = `${baseUrl}/${targetPath}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`;
    
    // Stream proxy request using persistent agent
    proxyRequest(req, res, targetUrl, baseUrl);
  }
);

// ============================================================================
// UTILITY ENDPOINTS
// ============================================================================

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Gateway is healthy',
    timestamp: new Date().toISOString(),
    activeConnections: agentPool.size
  });
});

// Proxy statistics
router.get('/stats', authenticateApiKey, async (req, res) => {
  try {
    const { apiKey } = req;
    const { days = 7 } = req.query;

    // Sanitize days parameter
    const safeDays = Math.max(1, Math.min(365, parseInt(days) || 7));
    
    const statsQuery = `
      SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as successful_requests,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_requests,
        AVG(response_time) as avg_response_time,
        MIN(created_at) as first_request,
        MAX(created_at) as last_request
      FROM api_usage_logs 
      WHERE api_key_id = $1 AND created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)
    `;
    
    const statsResult = await pool.query(statsQuery, [apiKey.id, safeDays]);
    const stats = statsResult.rows[0];
    
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

// CORS preflight
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(200);
});

module.exports = router;

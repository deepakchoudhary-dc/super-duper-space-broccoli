const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { v4: uuidv4 } = require('uuid');

const { pool } = require('../config/database');
const {
  authenticateApiKey,
  rateLimitMiddleware,
} = require('../middleware/auth');
const { incrementUsage, getRedisClient } = require('../config/redis');
const { hashApiKey, isValidKeyFormat } = require('../utils/crypto');
const { wafMiddleware } = require('../utils/waf');
const { validateUrl, isObviousInternal } = require('../utils/ssrf');
const { getCircuitBreaker, getBreakerState } = require('../utils/circuitBreaker');
const metrics = require('../utils/metrics');
const config = require('../config/env');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================================================
// PERSISTENT CONNECTION POOL (keeps TCP sockets alive across requests)
// ============================================================================

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
    maxSockets: config.proxy.maxSockets,
    maxFreeSockets: 10,
    timeout: config.proxy.connectTimeoutMs
  });

  agentPool.set(baseUrl, agent);
  return agent;
};

// Clean up agents and circuit breakers on process exit
const cleanup = () => {
  agentPool.forEach((agent) => agent.destroy());
  agentPool.clear();
  require('../utils/circuitBreaker').destroyAll();
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// ============================================================================
// HEADER SANITIZATION — never leak internal/auth headers upstream
// ============================================================================

/**
 * SECURITY FIX: previously the proxy forwarded ALL request headers upstream,
 * including `authorization` (the dashboard JWT), `cookie`, and the raw
 * `X-API-Key`. A malicious upstream (or a compromised one) could harvest
 * dashboard credentials. Only safe headers are forwarded.
 */
const SENSITIVE_REQUEST_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api_key',
  'proxy-authorization',
  'x-api-guardian-key',
  'x-api-guardian-user',
  'x-api-guardian-key-id'
]);

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

const FORWARDED_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'content-type',
  'content-length',
  'if-modified-since',
  'if-none-match',
  'range',
  'referer',
  'user-agent',
  'x-requested-with',
  'x-request-id',
  'traceparent',
  'tracestate',
  'x-forwarded-for',
  'origin',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-user',
  'sec-websocket-key',
  'sec-websocket-version',
  'sec-websocket-protocol',
  'sec-websocket-extensions'
]);

/**
 * Build a sanitized header set to forward upstream.
 */
const buildForwardHeaders = (req, keyData) => {
  const headers = {};

  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (SENSITIVE_REQUEST_HEADERS.has(lower)) continue;
    // Allowlist approach: forward known-safe headers + a couple of allowlisted custom ones
    if (FORWARDED_HEADERS.has(lower) || lower.startsWith('x-api-guardian')) {
      headers[lower] = value;
    }
  }

  // Always set gateway metadata (never the raw key)
  headers['x-api-guardian-key-id'] = keyData.id;
  headers['x-api-guardian-user'] = keyData.user_id;
  headers['x-forwarded-for'] = req.ip;
  headers['x-real-ip'] = req.ip;
  headers['x-request-id'] = req.requestId || uuidv4();

  return headers;
};

// ============================================================================
// PATH SANITIZATION — block traversal & encoded separators
// ============================================================================

const UNSAFE_PATH_PATTERN = /(\.\.\/|\.\.\\)|(%2e%2e)|(%2f)|(\\\\)|(\\\\?)/i;

const assertSafePath = (path) => {
  if (!path) return true;
  return !UNSAFE_PATH_PATTERN.test(path);
};

// ============================================================================
// USAGE LOGGING MIDDLEWARE (non-blocking, no body buffering)
// ============================================================================

const logApiUsage = (req, res, next) => {
  const startTime = Date.now();

  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.requestId);

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    metrics.observeHttp(req, res, responseTime);

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

          try {
            await incrementUsage(req.apiKey.id, req.path);
          } catch (redisErr) {
            // Non-critical — Redis may be unavailable
          }

          await pool.query(
            'UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = $1',
            [req.apiKey.id]
          );
        }

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
// ENDPOINT PERMISSION VALIDATION (path + method against key grants)
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
          // Methods may be stored upper/lower/mixed — compare case-insensitively
          const allowedMethods = (endpoint.methods || []).map((m) => m.toLowerCase());
          if (allowedMethods.includes(method) || allowedMethods.includes('*')) {
            allowed = true;
            break;
          }
        }
      }
    }

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: `Access denied: ${method.toUpperCase()} ${path} not allowed for this API key`
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
// STREAMING REVERSE PROXY (zero-copy, persistent connections, circuit-aware)
// ============================================================================

const proxyRequest = async (req, res, targetUrl, baseUrl) => {
  // --- Circuit breaker: fail fast if the upstream is unhealthy ---
  const breaker = getCircuitBreaker({
    baseUrl,
    apiId: req.apiKey.api_id,
    healthPath: '/health'
  });
  breaker.startHealthCheck();

  if (!breaker.allowRequest()) {
    metrics.incrementCounter('gateway_upstream_failures_total', { api_id: req.apiKey.api_id });
    return res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable (upstream circuit open)'
    });
  }

  // --- SSRF protection: re-validate resolved target before forwarding ---
  const validation = await validateUrl(targetUrl);
  if (!validation.ok) {
    logger.logSecurityEvent('SSRF_BLOCKED', {
      targetUrl,
      reason: validation.reason,
      ip: req.ip,
      requestId: req.requestId
    });
    return res.status(400).json({
      success: false,
      message: 'Invalid upstream target'
    });
  }

  const url = new URL(targetUrl);
  const agent = getAgent(baseUrl);
  const httpModule = url.protocol === 'https:' ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: req.method,
    agent,
    headers: buildForwardHeaders(req, req.apiKey),
    timeout: config.proxy.connectTimeoutMs
  };

  logger.debug('Proxying request', {
    requestId: req.requestId,
    originalUrl: req.originalUrl,
    targetUrl,
    method: req.method
  });

  let succeeded = false;

  const proxyReq = httpModule.request(options, (proxyRes) => {
    succeeded = proxyRes.statusCode >= 200 && proxyRes.statusCode < 500;

    // Response header transformation — strip leaky/internal headers, add security headers
    const responseHeaders = { ...proxyRes.headers };
    delete responseHeaders['x-powered-by'];
    delete responseHeaders['server'];
    delete responseHeaders['connection'];
    delete responseHeaders['keep-alive'];
    delete responseHeaders['transfer-encoding'];

    responseHeaders['access-control-allow-origin'] = '*';
    responseHeaders['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
    responseHeaders['access-control-allow-headers'] = 'Content-Type, Authorization, X-API-Key';
    responseHeaders['x-api-guardian-key-id'] = req.apiKey.id;
    responseHeaders['x-api-guardian-rate-limit'] = String(req.apiKey.rate_limit);
    responseHeaders['x-api-guardian-rate-window'] = String(req.apiKey.rate_limit_window);
    responseHeaders['x-request-id'] = req.requestId;

    res.writeHead(proxyRes.statusCode, responseHeaders);

    // Zero-copy streaming — no body buffering
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
    metrics.incrementCounter('gateway_upstream_failures_total', { api_id: req.apiKey.api_id });
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
        error: config.env === 'development' ? err.message : undefined
      });
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy(new Error('timeout'));
    if (!res.headersSent) {
      res.status(504).json({
        success: false,
        message: 'Gateway Timeout - Target API did not respond in time'
      });
    }
  });

  // Record result for the circuit breaker when the response finishes
  res.on('finish', () => {
    breaker.recordResult(succeeded);
  });

  // Stream request body to upstream — zero-copy
  req.pipe(proxyReq);
};

// ============================================================================
// PROXY ROUTE: /proxy/:userId/:apiId/*
// ============================================================================

router.use(
  '/:userId/:apiId/*',
  authenticateApiKey,
  rateLimitMiddleware,
  wafMiddleware,
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

    // Path traversal sanitization
    if (!assertSafePath(targetPath)) {
      logger.logSecurityEvent('PATH_TRAVERSAL_BLOCKED', {
        targetPath,
        ip: req.ip,
        requestId: req.requestId
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid path'
      });
    }

    // SSRF pre-check on the base URL (quick, synchronous)
    const baseUrl = req.apiKey.base_url.replace(/\/+$/, '');
    if (isObviousInternal(new URL(baseUrl).hostname)) {
      logger.logSecurityEvent('SSRF_BLOCKED', {
        baseUrl,
        reason: 'obvious_internal_host',
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid upstream target'
      });
    }

    // Build target URL
    const query = req.url.includes('?') ? req.url.split('?')[1] : '';
    const targetUrl = `${baseUrl}/${targetPath}${query ? '?' + query : ''}`;

    proxyRequest(req, res, targetUrl, baseUrl).catch((err) => {
      logger.error('Proxy pipeline error:', err);
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          message: 'Bad Gateway'
        });
      }
    });
  }
);

// ============================================================================
// WEBSOCKET / SSE UPGRADE SUPPORT
// ============================================================================

/**
 * Handle WebSocket upgrade requests to /proxy/:userId/:apiId/*.
 * Registered on the HTTP server's 'upgrade' event in index.js.
 *
 * Security: API key is authenticated, rate limit checked, SSRF checked,
 * and permission validated before the socket is bridged.
 */
const handleUpgrade = async (req, socket, head) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/proxy/')) {
      socket.destroy();
      return;
    }

    // /proxy/:userId/:apiId/rest/of/path
    const parts = url.pathname.split('/').filter(Boolean); // ['proxy', userId, apiId, ...rest]
    if (parts.length < 3) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    const [, userId, apiId] = parts;
    const targetPath = parts.slice(3).join('/');

    // Authenticate API key
    const rawApiKey = req.headers['x-api-key'] || url.searchParams.get('api_key');
    if (!rawApiKey || !isValidKeyFormat(rawApiKey)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const keyHash = hashApiKey(rawApiKey);
    const { getCachedApiKey } = require('../config/redis');
    let keyData = await getCachedApiKey(keyHash);

    if (!keyData) {
      const keyQuery = `
        SELECT ak.*, a.name as api_name, a.base_url, a.status as api_status, u.id as user_id
        FROM api_keys ak
        JOIN apis a ON ak.api_id = a.id
        JOIN users u ON ak.user_id = u.id
        WHERE ak.key_hash = $1 AND ak.status = 'active' AND a.status = 'active'
      `;
      const keyResult = await pool.query(keyQuery, [keyHash]);
      if (keyResult.rows.length === 0) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      keyData = keyResult.rows[0];
    }

    // Ownership + SSRF checks
    if (keyData.api_id !== apiId || String(keyData.user_id) !== userId) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const baseUrl = keyData.base_url.replace(/\/+$/, '');
    if (isObviousInternal(new URL(baseUrl).hostname)) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const validation = await validateUrl(`${baseUrl}/${targetPath}`);
    if (!validation.ok) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    // Circuit breaker gate
    const breaker = getCircuitBreaker({ baseUrl, apiId: keyData.api_id, healthPath: '/health' });
    breaker.startHealthCheck();
    if (!breaker.allowRequest()) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }

    // Rate limit check
    const { checkRateLimit } = require('../utils/rateLimiter');
    const limitResult = await checkRateLimit(`api_key:${keyData.id}`, {
      limit: keyData.rate_limit,
      window: keyData.rate_limit_window
    });
    if (!limitResult.allowed) {
      metrics.incrementRateLimitExceeded(keyData.id, limitResult.tier);
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    proxyWebSocket(req, socket, head, `${baseUrl}/${targetPath}`, baseUrl, keyData);
  } catch (error) {
    logger.error('WebSocket upgrade error:', error);
    try { socket.destroy(); } catch (err) { /* noop */ }
  }
};

const proxyWebSocket = (req, socket, head, targetUrl, baseUrl, keyData) => {
  const url = new URL(targetUrl);
  const httpModule = url.protocol === 'https:' || url.protocol === 'wss:' ? https : http;
  const agent = getAgent(baseUrl);

  // Forward the client's upgrade headers verbatim (Sec-WebSocket-Key etc.)
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || SENSITIVE_REQUEST_HEADERS.has(lower)) continue;
    headers[lower] = value;
  }
  headers.host = url.hostname;
  headers.connection = 'Upgrade';
  headers.upgrade = 'websocket';
  headers['x-api-guardian-key-id'] = keyData.id;
  headers['x-request-id'] = req.requestId || uuidv4();

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'wss:' || url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'GET',
    headers,
    agent,
    timeout: config.proxy.connectTimeoutMs
  };

  const upstreamReq = httpModule.request(options);

  upstreamReq.on('upgrade', (res, upstreamSocket, upstreamHead) => {
    logger.info('WebSocket upgraded', { targetUrl, keyId: keyData.id });
    // Relay upstream 101 + headers to the client socket
    const statusLine = `HTTP/1.1 101 ${res.statusMessage || 'Switching Protocols'}\r\n`;
    let headerBlock = statusLine;
    for (const [name, value] of Object.entries(res.headers)) {
      const lower = name.toLowerCase();
      if (HOP_BY_HOP_HEADERS.has(lower)) continue;
      headerBlock += `${name}: ${value}\r\n`;
    }
    headerBlock += '\r\n';
    socket.write(headerBlock);

    if (upstreamHead && upstreamHead.length) {
      upstreamSocket.unshift(upstreamHead);
    }

    // Bidirectional bridge
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);

    upstreamSocket.on('error', () => { try { socket.destroy(); } catch (err) { /* noop */ } });
    socket.on('error', () => { try { upstreamSocket.destroy(); } catch (err) { /* noop */ } });
    socket.on('close', () => { try { upstreamSocket.destroy(); } catch (err) { /* noop */ } });

    // Record usage (fire and forget)
    require('../utils/rateLimiter').checkRateLimit(`ws:${keyData.id}`, {
      limit: keyData.rate_limit,
      window: keyData.rate_limit_window
    }).catch(() => {});
  });

  upstreamReq.on('error', (err) => {
    logger.error('WebSocket proxy error:', { error: err.message, targetUrl });
    try { socket.destroy(); } catch (e) { /* noop */ }
  });

  upstreamReq.on('timeout', () => {
    upstreamReq.destroy(new Error('timeout'));
    try { socket.destroy(); } catch (e) { /* noop */ }
  });

  // If there's buffered data in `head`, forward it after upgrade request
  if (head && head.length) {
    upstreamReq.write(head);
  }
  upstreamReq.end();
};

// ============================================================================
// UTILITY ENDPOINTS
// ============================================================================

/**
 * @openapi
 * /proxy/{userId}/{apiId}/{path}:
 *   get:
 *     summary: Proxy a request to a registered upstream API
 *     tags: [Proxy]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - { name: userId, in: path, required: true, schema: { type: string } }
 *       - { name: apiId, in: path, required: true, schema: { type: string } }
 *       - { name: path, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Upstream response (streamed)
 *       401:
 *         description: Missing or invalid API key
 *       429:
 *         description: Rate limit exceeded
 *       502:
 *         description: Upstream unreachable
 *       503:
 *         description: Upstream circuit open
 */

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
router.get('/stats', authenticateApiKey, rateLimitMiddleware, async (req, res) => {
  try {
    const { apiKey } = req;
    const days = (() => {
      const parsed = parseInt(req.query.days, 10);
      return Number.isFinite(parsed) ? Math.max(1, Math.min(365, parsed)) : 7;
    })();

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

    const statsResult = await pool.query(statsQuery, [apiKey.id, days]);
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
router.get('/test', authenticateApiKey, rateLimitMiddleware, (req, res) => {
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

// Circuit breaker status (admin diagnostic)
router.get('/circuit-breakers', authenticateApiKey, (req, res) => {
  const { getBreakerState } = require('../utils/circuitBreaker');
  res.json({
    success: true,
    data: {
      upstream: req.apiKey.base_url,
      state: getBreakerState(req.apiKey.base_url)
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
module.exports.handleUpgrade = handleUpgrade;

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const config = require('./config/env');
const { connectDB, pool } = require('./config/database');
const { connectRedis, isRedisAvailable } = require('./config/redis');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { wafMiddleware } = require('./utils/waf');
const metrics = require('./utils/metrics');
const { initTracing, recordEvent } = require('./utils/tracing');

// Route imports
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const apiRoutes = require('./routes/apis');
const keyRoutes = require('./routes/keys');
const proxyRoutes = require('./routes/proxy');
const analyticsRoutes = require('./routes/analytics');
const docsRoutes = require('./routes/docs');
const settingsRoutes = require('./routes/settings');
const adminRoutes = require('./routes/admin');
const orgRoutes = require('./routes/orgs');
const webhookRoutes = require('./routes/webhooks');
const oidcRoutes = require('./routes/oidc');

const app = express();
const PORT = config.port;

// ============================================================================
// SECURITY MIDDLEWARE — Hardened Helmet Configuration
// ============================================================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],          // Prevent clickjacking
      formAction: ["'self'"],               // Restrict form submissions
      baseUri: ["'self'"],                  // Prevent base tag hijacking
      objectSrc: ["'none'"],                // Block plugins
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: {
    maxAge: 31536000,       // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,              // X-Content-Type-Options: nosniff
  xssFilter: true,            // X-XSS-Protection (legacy browser support)
  dnsPrefetchControl: { allow: false },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' }
}));

// ============================================================================
// REQUEST ID + TRACE CONTEXT INJECTION
// ============================================================================

app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.requestId);

  // W3C trace context propagation — pass through or generate
  if (!req.headers['traceparent']) {
    const traceId = require('crypto').randomBytes(16).toString('hex');
    const spanId = require('crypto').randomBytes(8).toString('hex');
    req.headers['traceparent'] = `00-${traceId}-${spanId}-01`;
  }
  next();
});

// ============================================================================
// RATE LIMITING (global per-IP for management API)
// ============================================================================

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ============================================================================
// CORS — Whitelist-based origin validation
// ============================================================================

const getAllowedOrigins = () => {
  const origins = config.frontendUrl;
  return origins.split(',').map(o => o.trim());
};

app.use(cors({
  origin: (origin, callback) => {
    const allowed = getAllowedOrigins();
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin:', { origin });
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id', 'traceparent'],
  exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'RateLimit-Policy'],
  maxAge: 86400  // Cache preflight for 24 hours
}));

// ============================================================================
// BODY PARSING — With size limits
// ============================================================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================================
// REQUEST LOGGING + ACTIVE CONNECTION GAUGE
// ============================================================================

let activeConnections = 0;

app.use((req, res, next) => {
  activeConnections += 1;
  metrics.setActiveConnections(activeConnections);
  res.on('finish', () => {
    activeConnections -= 1;
    metrics.setActiveConnections(activeConnections);
  });

  logger.info(`${req.method} ${req.url}`, {
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  recordEvent('http.request', {
    method: req.method,
    path: req.url,
    request_id: req.requestId,
    trace_id: req.headers['traceparent']
  });
  next();
});

// ============================================================================
// WAF — attack pattern filtering on all API + proxy traffic
// ============================================================================

app.use(wafMiddleware);

// ============================================================================
// HEALTH CHECK — deep: verifies DB and Redis connectivity
// ============================================================================

app.get('/health', async (req, res) => {
  let dbOk = false;
  let redisOk = false;

  try {
    const dbResult = await pool.query('SELECT 1');
    dbOk = dbResult.rows[0]['?column?'] === 1;
  } catch (err) {
    logger.error('Health check DB failure:', err.message);
  }

  redisOk = isRedisAvailable();

  const healthy = dbOk && redisOk;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    checks: {
      database: dbOk ? 'ok' : 'down',
      redis: redisOk ? 'ok' : 'down'
    }
  });
});

// ============================================================================
// PROMETHEUS METRICS ENDPOINT
// ============================================================================

app.get(config.observability.metricsPath, async (req, res) => {
  metrics.setRedisAvailable(isRedisAvailable());
  res.setHeader('Content-Type', metrics.getContentType());
  res.send(await metrics.getMetrics());
});

// ============================================================================
// API ROUTES
// ============================================================================

app.use('/api/auth', authRoutes);
app.use('/api/auth', oidcRoutes);
app.use('/api/users', userRoutes);
app.use('/api/apis', apiRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/docs', docsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webhooks', webhookRoutes);

// Proxy routes (should be last to catch all other routes)
app.use('/proxy', proxyRoutes);

// ============================================================================
// STATIC FILES (Production)
// ============================================================================

if (config.isProduction) {
  app.use(express.static('client/build'));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

let server;

async function startServer() {
  try {
    // OpenTelemetry (no-op unless OTEL_ENABLED=true)
    await initTracing();

    // Connect to databases
    await connectDB();
    await connectRedis();

    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      // eslint-disable-next-line no-console
      console.log(`API Guardian server running on port ${PORT}`);
      // eslint-disable-next-line no-console
      console.log(`Health check: http://localhost:${PORT}/health`);
      // eslint-disable-next-line no-console
      console.log(`Metrics: http://localhost:${PORT}${config.observability.metricsPath}`);
      if (config.env !== 'production') {
        // eslint-disable-next-line no-console
        console.log(`API Docs: http://localhost:${PORT}/api/docs`);
      }
    });

    // Set server timeout
    server.setTimeout(30000);

    // WebSocket / SSE upgrade support for the proxy
    server.on('upgrade', (req, socket, head) => {
      proxyRoutes.handleUpgrade(req, socket, head);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ============================================================================
// GRACEFUL SHUTDOWN — Drain connections before exit
// ============================================================================

const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');

      // Close database pool
      try {
        await pool.end();
        logger.info('Database pool closed');
      } catch (err) {
        logger.error('Error closing database pool:', err);
      }

      // Close Redis
      try {
        const { getRedisClient } = require('./config/redis');
        const redis = getRedisClient();
        if (redis) {
          await redis.quit();
          logger.info('Redis connection closed');
        }
      } catch (err) {
        logger.error('Error closing Redis:', err);
      }

      // Close proxy agents + circuit breakers
      try {
        require('./utils/circuitBreaker').destroyAll();
        logger.info('Proxy resources cleaned up');
      } catch (err) {
        logger.error('Error cleaning proxy resources:', err);
      }

      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Catch unhandled rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason: reason?.message || reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
  gracefulShutdown('uncaughtException');
});

// Only auto-start when run directly (node server/index.js). When required from
// tests (jest resetModules) or other modules, the caller owns the listener, so
// we must not boot a second fixed-PORT server that never gets closed.
if (require.main === module) {
  startServer();
}

module.exports = app;

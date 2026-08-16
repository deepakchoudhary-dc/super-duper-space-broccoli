/**
 * Environment Configuration — centralized, validated, fail-fast.
 *
 * Why this exists:
 * - Prevents production boot with missing/weak secrets (fail fast instead of
 *   silently running with 'CHANGE-ME' fallbacks).
 * - Single source of truth for typed config so route/middleware code stops
 *   scattering `process.env.X || default` everywhere.
 * - Development remains forgiving (sensible defaults) so `npm run dev` "just works".
 */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const int = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const requiredSecrets = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
const warnSecrets = ['SMTP_PASSWORD', 'ENCRYPTION_KEY'];

// ---------------------------------------------------------------------------
// Fail-fast validation
// ---------------------------------------------------------------------------
if (isProduction) {
  const missing = requiredSecrets.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[FATAL] Missing required environment variable(s) in production: ${missing.join(', ')}`
    );
    process.exit(1);
  }

  for (const secret of [...requiredSecrets, ...warnSecrets]) {
    const value = process.env[secret];
    if (value && value.length < 32 && /CHANGE-ME|your-|placeholder|secret-key/i.test(value)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[WARN] ${secret} looks like a placeholder value. Generate a strong secret before deploying.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Typed configuration object
// ---------------------------------------------------------------------------
const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction,
  isTest,
  port: int(process.env.PORT, 5000),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  apiGuardianDomain: process.env.API_GUARDIAN_DOMAIN || `http://localhost:${int(process.env.PORT, 5000)}`,

  // Database
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: int(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME || 'api_guardian',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    poolMax: int(process.env.DB_POOL_MAX, 20),
    poolIdleTimeout: int(process.env.DB_POOL_IDLE_TIMEOUT, 30000),
    poolConnectionTimeout: int(process.env.DB_POOL_CONNECTION_TIMEOUT, 2000)
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: int(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    connectTimeout: int(process.env.REDIS_CONNECT_TIMEOUT, 2000)
  },

  // JWT
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'dev-refresh-secret-change-me',
    accessExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },

  // Security
  security: {
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, 12),
    maxLoginAttempts: int(process.env.MAX_LOGIN_ATTEMPTS, 5),
    lockoutTimeMs: int(process.env.LOCKOUT_TIME, 15 * 60 * 1000),
    twoFaWindow: int(process.env.TWO_FA_WINDOW, 1),
    twoFaIssuer: process.env.TWO_FA_ISSUER || 'API Guardian',
    skipEmailVerification: process.env.SKIP_EMAIL_VERIFICATION === 'true',
    // WAF toggle (enable/disable attack-pattern filtering)
    wafEnabled: process.env.WAF_ENABLED !== 'false',
    // SSRF protection: block requests to private/link-local ranges by default
    ssrfProtection: process.env.SSRF_PROTECTION !== 'false'
  },

  // Rate limiting defaults
  rateLimit: {
    defaultLimit: int(process.env.DEFAULT_RATE_LIMIT, 1000),
    defaultWindow: int(process.env.RATE_LIMIT_WINDOW, 3600),
    // Multi-tier quota defaults (0 = disabled)
    burstLimit: int(process.env.BURST_RATE_LIMIT, 0),        // req per second (0 = off)
    hourlyLimit: int(process.env.HOURLY_RATE_LIMIT, 0),      // req per hour (0 = off)
    dailyLimit: int(process.env.DAILY_RATE_LIMIT, 0)         // req per day (0 = off)
  },

  // Proxy / gateway
  proxy: {
    connectTimeoutMs: int(process.env.PROXY_CONNECT_TIMEOUT, 30000),
    maxSockets: int(process.env.PROXY_MAX_SOCKETS, 50),
    // SSRF: hosts that are always allowed even if they resolve to private ranges
    ssrfAllowPrivate: (process.env.SSRF_ALLOW_PRIVATE || '').split(',').map((s) => s.trim()).filter(Boolean),
    // Upstream health checking
    healthCheckIntervalMs: int(process.env.UPSTREAM_HEALTH_CHECK_INTERVAL, 30000),
    healthCheckTimeoutMs: int(process.env.UPSTREAM_HEALTH_CHECK_TIMEOUT, 3000),
    circuitBreakerThreshold: int(process.env.CIRCUIT_BREAKER_THRESHOLD, 5),   // consecutive failures to trip
    circuitBreakerCooldownMs: int(process.env.CIRCUIT_BREAKER_COOLDOWN, 30000) // recovery window
  },

  // Observability
  observability: {
    metricsEnabled: process.env.METRICS_ENABLED !== 'false',
    metricsPath: process.env.METRICS_PATH || '/metrics',
    traceEnabled: process.env.TRACE_ENABLED !== 'false'
  },

  // Alerting
  alerts: {
    rateLimitEmail: process.env.RATE_LIMIT_ALERT_EMAIL !== 'false',
    rateLimitAlertCooldownMs: int(process.env.RATE_LIMIT_ALERT_COOLDOWN, 15 * 60 * 1000)
  },

  // Email
  email: {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: int(process.env.SMTP_PORT, 587),
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    fromEmail: process.env.FROM_EMAIL || 'noreply@api-guardian.com',
    fromName: process.env.FROM_NAME || 'API Guardian'
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info'
};

module.exports = config;

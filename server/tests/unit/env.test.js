/**
 * Unit tests for server/config/env.js — config parsing and defaults.
 */
describe('env config', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('uses documented defaults when env vars are absent', () => {
    const config = require('../../config/env');
    expect(config.port).toBe(5000);
    expect(config.db.host).toBe('localhost');
    expect(config.db.port).toBe(5432);
    expect(config.redis.port).toBe(6379);
    expect(config.jwt.accessExpiresIn).toBe('7d');
    expect(config.jwt.refreshExpiresIn).toBe('30d');
    expect(config.security.bcryptRounds).toBe(12);
    expect(config.rateLimit.defaultLimit).toBe(1000);
    expect(config.rateLimit.defaultWindow).toBe(3600);
    expect(config.proxy.maxSockets).toBe(50);
  });

  test('parses numeric env vars as integers', () => {
    process.env.PORT = '8080';
    process.env.DB_POOL_MAX = '5';
    process.env.BCRYPT_ROUNDS = '10';
    process.env.CIRCUIT_BREAKER_THRESHOLD = '7';
    const config = require('../../config/env');
    expect(config.port).toBe(8080);
    expect(config.db.poolMax).toBe(5);
    expect(config.security.bcryptRounds).toBe(10);
    expect(config.proxy.circuitBreakerThreshold).toBe(7);
  });

  test('falls back to defaults on malformed numbers', () => {
    process.env.PORT = 'abc';
    process.env.MAX_LOGIN_ATTEMPTS = 'not-a-number';
    const config = require('../../config/env');
    expect(config.port).toBe(5000);
    expect(config.security.maxLoginAttempts).toBe(5);
  });

  test('parses boolean flags', () => {
    process.env.SKIP_EMAIL_VERIFICATION = 'true';
    process.env.WAF_ENABLED = 'false';
    process.env.SSRF_PROTECTION = 'false';
    process.env.METRICS_ENABLED = 'false';
    const config = require('../../config/env');
    expect(config.security.skipEmailVerification).toBe(true);
    expect(config.security.wafEnabled).toBe(false);
    expect(config.security.ssrfProtection).toBe(false);
    expect(config.observability.metricsEnabled).toBe(false);
  });
});

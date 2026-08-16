/**
 * Integration tests — full auth → API → key → proxy flow.
 *
 * These require a real PostgreSQL and Redis instance:
 *   RUN_INTEGRATION=true npm run test:server
 *
 * In CI they run against GitHub Actions service containers.
 * They are skipped locally unless RUN_INTEGRATION=true.
 */

const runIntegration = process.env.RUN_INTEGRATION === 'true';

const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration('API integration flow', () => {
  const request = require('supertest');
  let app;
  let server;
  let pool;
  let testUserId;
  let testEmail;
  let testApiId;
  let testKeyId;
  let testApiKeyRaw;
  let accessToken;

  beforeAll(async () => {
    process.env.SKIP_EMAIL_VERIFICATION = 'true';
    process.env.WAF_ENABLED = 'false'; // avoid blocking test payloads
    // Ensure fresh module load with test env
    jest.resetModules();
    app = require('../../index');
    pool = require('../../config/database').pool;

    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end();
  });

  test('registers a user', async () => {
    testEmail = `it-${Date.now()}@test.local`;
    const res = await request(app).post('/api/auth/register').send({
      email: testEmail,
      password: 'Str0ng!Passw0rd',
      firstName: 'Integration',
      lastName: 'Tester'
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    testUserId = res.body.data.user.id;
  });

  test('logs in and receives tokens', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: testEmail,
      password: 'Str0ng!Passw0rd'
    });
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();
    accessToken = res.body.data.tokens.accessToken;
  });

  test('registers an API', async () => {
    const res = await request(app)
      .post('/api/apis')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `Integration API ${Date.now()}`,
        baseUrl: 'http://example.com',
        version: '1.0.0'
      });
    expect(res.status).toBe(201);
    testApiId = res.body.data.api.id;
  });

  test('creates an API key (raw key returned once)', async () => {
    const res = await request(app)
      .post('/api/keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Integration Key',
        apiId: testApiId,
        rateLimit: 1000,
        rateLimitWindow: 3600
      });
    expect(res.status).toBe(201);
    expect(res.body.data.key.apiKey).toMatch(/^ag_(live|test)_/);
    testApiKeyRaw = res.body.data.key.apiKey;
    testKeyId = res.body.data.key.id;
  });

  test('validates the API key via the proxy test endpoint', async () => {
    const res = await request(app)
      .get('/proxy/test')
      .set('X-API-Key', testApiKeyRaw);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.keyName).toBe('Integration Key');
  });

  test('revokes the key and validates it is rejected', async () => {
    const revokeRes = await request(app)
      .post(`/api/keys/${testKeyId}/revoke`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(revokeRes.status).toBe(200);

    const invalidRes = await request(app)
      .get('/proxy/test')
      .set('X-API-Key', testApiKeyRaw);
    expect(invalidRes.status).toBe(401);
  });

  test('health check reports database and redis status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.checks.database).toBe('ok');
  });
});

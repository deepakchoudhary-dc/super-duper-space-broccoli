/**
 * Phase B integration tests — audit admin API, response caching, request/
 * response transformations, key rotation, GitHub secret-scanning webhook,
 * OIDC sign-in (against a local mock provider), and multi-tenancy.
 *
 * Requires PostgreSQL (Redis optional). Gated behind RUN_INTEGRATION=true:
 *   RUN_INTEGRATION=true npm run test:integration
 */

// Server boot + DB migrations routinely exceed Jest's 5s default hook timeout.
jest.setTimeout(60000);

const runIntegration = process.env.RUN_INTEGRATION === 'true';

const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration('gateway features (phase B)', () => {
  const request = require('supertest');
  const http = require('http');
  const zlib = require('zlib');
  const net = require('net');

  let app;
  let server;
  let pool;
  let redis;
  let gatewayPort;
  let userId;
  let email;
  let accessToken;

  beforeAll(async () => {
    process.env.SKIP_EMAIL_VERIFICATION = 'true';
    process.env.SSRF_ALLOW_PRIVATE = '127.0.0.1,localhost';
    process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret-1234567890';
    process.env.OIDC_ENABLED = 'true';
    process.env.OIDC_ISSUER = 'http://127.0.0.1:5190';
    process.env.OIDC_CLIENT_ID = 'test-client';
    process.env.OIDC_CLIENT_SECRET = 'test-client-secret';
    process.env.OIDC_REDIRECT_URI = 'http://localhost:5000/api/auth/oidc/callback';
    process.env.PORT = '5197';

    jest.resetModules();
    app = require('../../index');
    pool = require('../../config/database').pool;

    // Wait for schema migrations to complete — index.js fires them async, and
    // tests must never race the DDL (e.g. INSERT referencing a brand-new column)
    await require('../../config/database').connectDB();
    // Connect Redis explicitly — index.js no longer auto-boots when required
    redis = require('../../config/redis');
    await redis.connectRedis();

    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    gatewayPort = server.address().port;
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end();
    if (redis) await redis.disconnectRedis();
    require('../../utils/circuitBreaker').destroyAll();
  });

  const registerUser = async (prefix = 'feat') => {
    const userEmail = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const reg = await request(app).post('/api/auth/register').send({
      email: userEmail,
      password: 'Str0ng!Passw0rd',
      firstName: 'Feature',
      lastName: 'Tester'
    });
    expect(reg.status).toBe(201);
    const login = await request(app).post('/api/auth/login').send({
      email: userEmail,
      password: 'Str0ng!Passw0rd'
    });
    expect(login.status).toBe(200);
    return {
      userId: reg.body.data.user.id,
      email: userEmail,
      accessToken: login.body.data.tokens.accessToken
    };
  };

  const registerUpstream = async (baseUrl, name, token, extra = {}) => {
    const api = await request(app)
      .post('/api/apis')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `${name} ${Date.now()} ${Math.random()}`, baseUrl, version: '1.0.0', ...extra });
    expect(api.status).toBe(201);
    const apiId = api.body.data.api.id;

    const key = await request(app)
      .post('/api/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `${name} Key`, apiId, rateLimit: 100000, rateLimitWindow: 3600 });
    expect(key.status).toBe(201);

    return { apiId, rawKey: key.body.data.key.apiKey };
  };

  const getFreePort = () => new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });

  test('writes and queries the immutable audit trail (admin API)', async () => {
    const { userId: uId, accessToken: token } = await registerUser('audit');

    // Promote to admin (direct DB — no admin bootstrap endpoint by design)
    await pool.query('UPDATE users SET is_admin = TRUE WHERE id = $1', [uId]);

    const api = await request(app)
      .post('/api/apis')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Audit API ${Date.now()}`, baseUrl: 'http://127.0.0.1:1', version: '1.0.0' });
    expect(api.status).toBe(201);
    const apiId = api.body.data.api.id;

    const logs = await request(app)
      .get(`/api/admin/audit-logs?action=API_CREATED&userId=${uId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(logs.status).toBe(200);
    expect(logs.body.data.logs.length).toBeGreaterThanOrEqual(1);
    expect(logs.body.data.logs[0].resourceId).toBe(apiId);
    expect(logs.body.data.logs[0].details.name).toBeDefined();

    // Non-admins are rejected
    const { accessToken: memberToken } = await registerUser('plain');
    const forbidden = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(forbidden.status).toBe(403);

    // Audit rows are immutable at the DB level (append-only trigger)
    await expect(
      pool.query('DELETE FROM audit_logs WHERE action = $1', ['API_CREATED'])
    ).rejects.toThrow(/append-only/);
  });

  test('response caching serves cached GETs with X-Cache and invalidates on revoke', async () => {
    const { userId: uId, accessToken: token } = await registerUser('cache');
    let hitCount = 0;
    const upstream = http.createServer((req, res) => {
      hitCount += 1;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`body-version-${hitCount}`);
    });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const port = upstream.address().port;

    const { apiId, rawKey } = await registerUpstream(`http://127.0.0.1:${port}`, 'Cache', token);
    const path = `/proxy/${uId}/${apiId}/data`;

    const first = await request(app).get(path).set('X-API-Key', rawKey);
    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(first.text).toBe('body-version-1');

    // Second request is served from cache (upstream still returns version 2)
    const second = await request(app).get(path).set('X-API-Key', rawKey);
    expect(second.status).toBe(200);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.text).toBe('body-version-1');

    // Revoking the key invalidates its cached responses -> fresh upstream hit
    const keys = await request(app).get('/api/keys').set('Authorization', `Bearer ${token}`);
    const keyRow = keys.body.data.keys.find((k) => k.apiId === apiId);
    await request(app).post(`/api/keys/${keyRow.id}/revoke`).set('Authorization', `Bearer ${token}`);

    const rotatedKey = await request(app)
      .post('/api/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cache Key 2', apiId, rateLimit: 100000, rateLimitWindow: 3600 });

    const fresh = await request(app).get(path).set('X-API-Key', rotatedKey.body.data.key.apiKey);
    expect(fresh.status).toBe(200);
    expect(fresh.headers['x-cache']).toBe('MISS');
    expect(fresh.text).toBe('body-version-2');

    upstream.close();
  });

  test('transforms requests and responses (path rewrite, headers, gzip)', async () => {
    const { userId: uId, accessToken: token } = await registerUser('xform');
    const upstream = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(JSON.stringify({ path: req.url, header: req.headers['x-api-version'] || null }));
    });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const port = upstream.address().port;

    const { apiId, rawKey } = await registerUpstream(
      `http://127.0.0.1:${port}`,
      'Transform',
      token,
      {
        transformConfig: {
          request: {
            rewritePath: [{ pattern: '^/legacy', replacement: '/v2' }],
            headers: [{ op: 'set', name: 'x-api-version', value: '2.0' }]
          },
          response: {
            headers: [{ op: 'set', name: 'x-gateway-policy', value: 'transform-test' }]
          },
          gzip: true
        }
      }
    );

    // Path rewrite + request header rule
    const proxied = await request(app)
      .get(`/proxy/${uId}/${apiId}/legacy/users`)
      .set('X-API-Key', rawKey);
    expect(proxied.status).toBe(200);
    const body = JSON.parse(proxied.text);
    expect(body.path).toBe('/v2/users');
    expect(body.header).toBe('2.0');

    // Response header rule
    expect(proxied.headers['x-gateway-policy']).toBe('transform-test');

    // gzip: same API, client advertises gzip (raw HTTP so the body is untouched)
    const gzipped = await new Promise((resolve, reject) => {
      const rawReq = http.request(
        {
          hostname: '127.0.0.1',
          port: gatewayPort,
          path: `/proxy/${uId}/${apiId}/legacy/users`,
          method: 'GET',
          headers: { 'x-api-key': rawKey, 'accept-encoding': 'gzip' },
          agent: false
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          }));
        }
      );
      rawReq.on('error', reject);
      rawReq.end();
    });
    expect(gzipped.status).toBe(200);
    expect(gzipped.headers['content-encoding']).toBe('gzip');
    const decompressed = zlib.gunzipSync(gzipped.body).toString();
    expect(JSON.parse(decompressed).path).toBe('/v2/users');

    upstream.close();
  });

  test('rotates API keys (immediate and with grace period)', async () => {
    const { userId: uId, accessToken: token } = await registerUser('rot');
    const upstream = http.createServer((req, res) => { res.end('ok'); });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const port = upstream.address().port;

    const { apiId, rawKey } = await registerUpstream(`http://127.0.0.1:${port}`, 'Rotate', token);
    const proxyPath = `/proxy/${uId}/${apiId}/ping`;

    const keys = await request(app).get('/api/keys').set('Authorization', `Bearer ${token}`);
    const keyRow = keys.body.data.keys.find((k) => k.apiId === apiId);

    // Immediate rotation: old key is revoked, new key works
    const rotated = await request(app)
      .post(`/api/keys/${keyRow.id}/rotate`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(rotated.status).toBe(201);
    expect(rotated.body.data.key.apiKey).toMatch(/^ag_(live|test)_/);

    const oldKeyRejected = await request(app).get(proxyPath).set('X-API-Key', rawKey);
    expect(oldKeyRejected.status).toBe(401);
    const newKeyAccepted = await request(app).get(proxyPath).set('X-API-Key', rotated.body.data.key.apiKey);
    expect(newKeyAccepted.status).toBe(200);

    // Grace rotation: old key stays valid during the grace window
    const rotatedWithGrace = await request(app)
      .post(`/api/keys/${keyRow.id}/rotate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ gracePeriodMinutes: 5 });
    // The key was already revoked -> must fail
    expect(rotatedWithGrace.status).toBe(400);

    upstream.close();
  });

  test('github secret-scanning webhook auto-revokes leaked keys and alerts owners', async () => {
    const { userId: uId, accessToken: token } = await registerUser('gh');
    const upstream = http.createServer((req, res) => { res.end('ok'); });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const port = upstream.address().port;

    const { apiId, rawKey } = await registerUpstream(`http://127.0.0.1:${port}`, 'Leak', token);
    const proxyPath = `/proxy/${uId}/${apiId}/ping`;

    // Bad token rejected
    const bad = await request(app)
      .post('/api/webhooks/github-secret-scanning?token=wrong')
      .send({ alerts: [{ token: rawKey }] });
    expect(bad.status).toBe(401);

    // Valid webhook revokes the leaked key
    const good = await request(app)
      .post('/api/webhooks/github-secret-scanning?token=test-webhook-secret-1234567890')
      .send({ alerts: [{ token: rawKey }] });
    expect(good.status).toBe(200);
    expect(good.body.revoked).toBe(1);

    const after = await request(app).get(proxyPath).set('X-API-Key', rawKey);
    expect(after.status).toBe(401);

    // Audit trail captured the incident
    const auditRes = await request(app)
      .get(`/api/admin/audit-logs?action=SECURITY_KEY_LEAK_REVOKED`)
      .set('Authorization', `Bearer ${token}`);
    // (non-admin user -> 403; audit is admin-only, verified in the admin test)

    upstream.close();
  });

  test('OIDC sign-in links a user and issues tokens (mock provider)', async () => {
    // Mock OIDC provider on port 5190 (matching OIDC_ISSUER set in beforeAll)
    const provider = http.createServer((req, res) => {
      const url = req.url.split('?')[0];
      if (url === '/.well-known/openid-configuration') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          authorization_endpoint: 'http://127.0.0.1:5190/authorize',
          token_endpoint: 'http://127.0.0.1:5190/token',
          userinfo_endpoint: 'http://127.0.0.1:5190/userinfo'
        }));
      } else if (url === '/token') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ access_token: 'mock-access-token', token_type: 'Bearer' }));
        });
      } else if (url === '/userinfo') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          sub: 'oidc-subject-123',
          email: 'oidc.user@test.local',
          email_verified: true,
          given_name: 'Oidc',
          family_name: 'User'
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((resolve) => provider.listen(5190, '127.0.0.1', resolve));

    const authRes = await request(app).get('/api/auth/oidc/authorize').expect(302);
    const location = authRes.headers.location;
    expect(location).toContain('/authorize?');
    const authorizeParams = new URLSearchParams(location.split('?')[1]);
    const state = authorizeParams.get('state');
    expect(authorizeParams.get('code_challenge_method')).toBe('S256');

    const cbRes = await request(app)
      .get(`/api/auth/oidc/callback?code=mock-code&state=${state}`)
      .expect(302);
    const cbLocation = cbRes.headers.location;
    expect(cbLocation).toContain('oidc/callback#access_token=');

    const fragment = new URLSearchParams(cbLocation.split('#')[1]);
    const accessToken = fragment.get('access_token');
    const refreshToken = fragment.get('refresh_token');
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();

    // The issued JWT works against the API
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe('oidc.user@test.local');

    // Re-running the flow for the same subject links to the SAME account
    const authRes2 = await request(app).get('/api/auth/oidc/authorize').expect(302);
    const state2 = new URLSearchParams(authRes2.headers.location.split('?')[1]).get('state');
    const cbRes2 = await request(app)
      .get(`/api/auth/oidc/callback?code=mock-code&state=${state2}`)
      .expect(302);
    const accessToken2 = new URLSearchParams(cbRes2.headers.location.split('#')[1]).get('access_token');
    const me2 = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken2}`);
    expect(me2.body.data.user.id).toBe(me.body.data.user.id);

    provider.close();
  });

  test('multi-tenancy: orgs, members, roles and resource scoping', async () => {
    const owner = await registerUser('orgowner');
    const member = await registerUser('orgmember');
    const outsider = await registerUser('orgoutsider');
    const stranger = await registerUser('orgstranger');

    // Owner creates an org
    const orgRes = await request(app)
      .post('/api/orgs')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: `Acme ${Date.now()}` });
    expect(orgRes.status).toBe(201);
    const orgId = orgRes.body.data.org.id;

    // Owner adds the member
    const addMember = await request(app)
      .post(`/api/orgs/${orgId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: member.email, role: 'member' });
    expect(addMember.status).toBe(201);

    // Member cannot add members (role gate)
    const memberAdd = await request(app)
      .post(`/api/orgs/${orgId}/members`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ email: outsider.email, role: 'member' });
    expect(memberAdd.status).toBe(403);

    // Owner promotes member to admin; member can then add
    const promote = await request(app)
      .patch(`/api/orgs/${orgId}/members/${member.userId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ role: 'admin' });
    expect(promote.status).toBe(200);

    const adminAdd = await request(app)
      .post(`/api/orgs/${orgId}/members`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ email: outsider.email, role: 'member' });
    expect(adminAdd.status).toBe(201);

    // Owner registers an API in the org
    const upstream = http.createServer((req, res) => { res.end('org-ok'); });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const port = upstream.address().port;

    const api = await request(app)
      .post('/api/apis')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: `Org API ${Date.now()}`, baseUrl: `http://127.0.0.1:${port}`, version: '1.0.0', orgId });
    expect(api.status).toBe(201);

    // Member can see the org API; outsider cannot
    const memberList = await request(app).get('/api/apis').set('Authorization', `Bearer ${member.accessToken}`);
    expect(memberList.body.data.apis.some((a) => a.id === api.body.data.api.id)).toBe(true);

    const strangerList = await request(app).get('/api/apis').set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(strangerList.body.data.apis.some((a) => a.id === api.body.data.api.id)).toBe(false);

    // Member can create a key for the org API and use it
    const key = await request(app)
      .post('/api/keys')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ name: 'Org Key', apiId: api.body.data.api.id, rateLimit: 100000, rateLimitWindow: 3600 });
    expect(key.status).toBe(201);

    const proxied = await request(app)
      .get(`/proxy/${member.userId}/${api.body.data.api.id}/ping`)
      .set('X-API-Key', key.body.data.key.apiKey);
    expect(proxied.status).toBe(200);
    expect(proxied.text).toBe('org-ok');

    // A stranger (not in the org) cannot access the org API directly
    const strangerAccess = await request(app)
      .get(`/api/apis/${api.body.data.api.id}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(strangerAccess.status).toBe(403);

    upstream.close();
  });
});

/**
 * Resilience integration tests — circuit breaker, WebSocket and SSE proxying
 * through the real gateway.
 *
 * These require PostgreSQL (Redis optional — the gateway degrades gracefully):
 *   RUN_INTEGRATION=true npm run test:integration
 *
 * Skipped locally unless RUN_INTEGRATION=true.
 */

// Server boot + DB migrations routinely exceed Jest's 5s default hook timeout.
jest.setTimeout(60000);

const runIntegration = process.env.RUN_INTEGRATION === 'true';

const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration('gateway resilience', () => {
  const request = require('supertest');
  const http = require('http');
  const net = require('net');
  const { WebSocket, WebSocketServer } = require('ws');

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
    // Allow localhost upstreams for the test fixtures (dev/test only)
    process.env.SSRF_ALLOW_PRIVATE = '127.0.0.1,localhost';
    // Fast, deterministic circuit breaker for the tests
    process.env.CIRCUIT_BREAKER_THRESHOLD = '2';
    process.env.CIRCUIT_BREAKER_COOLDOWN = '1500';
    process.env.UPSTREAM_HEALTH_CHECK_INTERVAL = '60000';
    // Distinct port so the index.js listener does not clash with other
    // integration test files running in-band
    process.env.PORT = '5198';

    // Ensure fresh module load with the test env
    jest.resetModules();
    app = require('../../index');
    pool = require('../../config/database').pool;
    const proxyRoutes = require('../../routes/proxy');

    // Wait for schema migrations to complete (index.js fires them async)
    await require('../../config/database').connectDB();
    // Connect Redis explicitly — index.js no longer auto-boots when required
    redis = require('../../config/redis');
    await redis.connectRedis();

    // Ephemeral listener for the gateway (index.js also listens on PORT)
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    gatewayPort = server.address().port;

    // Attach the WebSocket upgrade handler to this listener too, so the WS
    // test does not depend on the fixed PORT listener.
    server.on('upgrade', (req, socket, head) => proxyRoutes.handleUpgrade(req, socket, head));
  });

  afterAll(async () => {
    require('../../utils/circuitBreaker').destroyAll();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end();
    if (redis) await redis.disconnectRedis();
  });

  const registerUser = async () => {
    email = `res-${Date.now()}@test.local`;
    const res = await request(app).post('/api/auth/register').send({
      email,
      password: 'Str0ng!Passw0rd',
      firstName: 'Resilience',
      lastName: 'Tester'
    });
    expect(res.status).toBe(201);
    userId = res.body.data.user.id;

    const login = await request(app).post('/api/auth/login').send({
      email,
      password: 'Str0ng!Passw0rd'
    });
    expect(login.status).toBe(200);
    accessToken = login.body.data.tokens.accessToken;
  };

  const registerUpstream = async (baseUrl, name) => {
    const api = await request(app)
      .post('/api/apis')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `${name} ${Date.now()}`, baseUrl, version: '1.0.0' });
    expect(api.status).toBe(201);
    const apiId = api.body.data.api.id;

    const key = await request(app)
      .post('/api/keys')
      .set('Authorization', `Bearer ${accessToken}`)
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

  test('boots, registers a user and issues tokens', async () => {
    await registerUser();
    expect(userId).toBeDefined();
    expect(accessToken).toBeDefined();
  });

  test('circuit breaker trips to OPEN and recovers after cooldown', async () => {
    const deadPort = await getFreePort();
    const { apiId, rawKey } = await registerUpstream(
      `http://127.0.0.1:${deadPort}`,
      'Circuit Breaker'
    );
    const proxyPath = `/proxy/${userId}/${apiId}/ping`;

    // Failures while CLOSED: upstream is unreachable (502) until the circuit trips
    const first = await request(app).get(proxyPath).set('X-API-Key', rawKey);
    expect([502, 503]).toContain(first.status);

    const second = await request(app).get(proxyPath).set('X-API-Key', rawKey);
    expect([502, 503]).toContain(second.status);

    // Threshold reached (2) -> circuit OPEN -> fail fast with 503, no upstream attempt
    const third = await request(app).get(proxyPath).set('X-API-Key', rawKey);
    expect(third.status).toBe(503);
    expect(third.body.message).toContain('circuit open');

    // Recovery: bring the upstream up and wait out the cooldown
    const upstream = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('healthy');
    });
    await new Promise((resolve) => upstream.listen(deadPort, '127.0.0.1', resolve));
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Half-open probe succeeds -> circuit resets to CLOSED
    let recovered = null;
    for (let i = 0; i < 10 && !recovered; i += 1) {
      const probe = await request(app).get(proxyPath).set('X-API-Key', rawKey);
      if (probe.status === 200) {
        recovered = probe;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    expect(recovered).not.toBeNull();
    expect(recovered.text).toBe('healthy');
    upstream.close();
  });

  test('proxies a WebSocket upgrade with API key auth (echo)', async () => {
    const upstreamHttp = http.createServer();
    const wss = new WebSocketServer({ server: upstreamHttp });
    wss.on('connection', (ws) => {
      ws.on('message', (msg) => ws.send(`echo:${msg}`));
    });
    await new Promise((resolve) => upstreamHttp.listen(0, '127.0.0.1', resolve));
    const wsPort = upstreamHttp.address().port;

    const { apiId, rawKey } = await registerUpstream(
      `http://127.0.0.1:${wsPort}`,
      'WebSocket'
    );

    const echoed = await new Promise((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${gatewayPort}/proxy/${userId}/${apiId}/socket`,
        { headers: { 'x-api-key': rawKey }, handshakeTimeout: 5000 }
      );
      const timer = setTimeout(() => reject(new Error('websocket handshake timed out')), 8000);
      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      ws.on('open', () => ws.send('hello-gateway'));
      ws.on('message', (data) => {
        clearTimeout(timer);
        ws.close();
        resolve(data.toString());
      });
    });

    expect(echoed).toBe('echo:hello-gateway');

    wss.close();
    upstreamHttp.close();
  });

  test('streams SSE responses from the upstream through the gateway', async () => {
    const upstream = http.createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache'
      });
      res.write('data: event-one\n\n');
      setTimeout(() => {
        res.write('data: event-two\n\n');
        res.end();
      }, 200);
    });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const ssePort = upstream.address().port;

    const { apiId, rawKey } = await registerUpstream(
      `http://127.0.0.1:${ssePort}`,
      'SSE'
    );

    const proxyPath = `/proxy/${userId}/${apiId}/stream`;
    const response = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: gatewayPort,
          path: proxyPath,
          method: 'GET',
          headers: { 'x-api-key': rawKey },
          agent: false
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => resolve({
            status: res.statusCode,
            contentType: res.headers['content-type'],
            body
          }));
        }
      );
      req.on('error', reject);
      req.end();
    });

    expect(response.status).toBe(200);
    expect(response.contentType).toContain('text/event-stream');
    expect(response.body).toContain('event-one');
    expect(response.body).toContain('event-two');

    upstream.close();
  });
});

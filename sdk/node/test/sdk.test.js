/**
 * SDK tests — node:test against a local mock gateway.
 *   node --test test/
 */
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { ApiGuardian, RateLimitError, UpstreamError } = require('../src/index.js');

/** Boot a mock gateway that records requests and responds per handler. */
function bootGateway(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/** Close the server even with dangling sockets (timed-out requests). */
function closeServer(server) {
  return new Promise((resolve) => {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    server.close(() => resolve());
  });
}

const makeClient = (server) =>
  new ApiGuardian({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: 'ag_test_key',
    userId: 'user-1',
    apiId: 'api-1',
    retries: 2,
    backoffMs: 5
  });

test('get sends X-API-Key and unwraps the gateway envelope', async () => {
  const server = await bootGateway((req, res) => {
    assert.strictEqual(req.headers['x-api-key'], 'ag_test_key');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: { hello: 'world' } }));
  });
  try {
    const data = await makeClient(server).get('/users/1');
    assert.deepStrictEqual(data, { hello: 'world' });
  } finally {
    await closeServer(server);
  }
});

test('post JSON-encodes the body and returns the envelope data', async () => {
  const server = await bootGateway((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      assert.strictEqual(JSON.parse(body).name, 'Ada');
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { id: 7 } }));
    });
  });
  try {
    const data = await makeClient(server).post('/users', { name: 'Ada' });
    assert.deepStrictEqual(data, { id: 7 });
  } finally {
    await closeServer(server);
  }
});

test('429 retries after Retry-After then succeeds', async () => {
  let calls = 0;
  const server = await bootGateway((req, res) => {
    calls += 1;
    if (calls === 1) {
      res.writeHead(429, { 'Retry-After': '0' });
      res.end(JSON.stringify({ success: false, message: 'slow down' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  try {
    const data = await makeClient(server).get('/x');
    assert.deepStrictEqual(data, { ok: true });
    assert.strictEqual(calls, 2);
  } finally {
    await closeServer(server);
  }
});

test('persistent 429 throws RateLimitError with retryAfterSeconds', async () => {
  const server = await bootGateway((req, res) => {
    res.writeHead(429, { 'Retry-After': '60' });
    res.end(JSON.stringify({ success: false, message: 'slow down' }));
  });
  try {
    await assert.rejects(
      makeClient(server).get('/x'),
      (err) => err instanceof RateLimitError && err.retryAfterSeconds === 60
    );
  } finally {
    await closeServer(server);
  }
});

test('5xx retries then throws UpstreamError', async () => {
  let calls = 0;
  const server = await bootGateway((req, res) => {
    calls += 1;
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'bad gateway' }));
  });
  try {
    const client = makeClient(server); // retries: 2 -> 3 total attempts
    await assert.rejects(client.get('/x'), (err) => err.status === 502);
    assert.strictEqual(calls, 3);
  } finally {
    await closeServer(server);
  }
});

test('timeout throws UpstreamError', async () => {
  const server = await bootGateway((req, res) => {
    // Never respond — the client aborts
  });
  try {
    const client = new ApiGuardian({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      apiKey: 'ag_test_key',
      userId: 'user-1',
      apiId: 'api-1',
      timeoutMs: 50,
      retries: 0
    });
    await assert.rejects(client.get('/slow'), (err) => err instanceof UpstreamError);
  } finally {
    await closeServer(server);
  }
});

/**
 * CLI tests — spawn bin/guardian.js against a local mock gateway.
 *   node --test test/
 */
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { execFile } = require('node:child_process');

const BIN = require('path').join(__dirname, '..', 'bin', 'guardian.js');

function runCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [BIN, ...args], { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`exit ${err.code}: ${stderr || stdout}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function bootGateway() {
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push({ method: req.method, url: req.url });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: {
        apis: [{ id: 'api-1', name: 'Payments API', status: 'active', baseUrl: 'https://pay.example.com' }],
        keys: [{ id: 'key-1', name: 'Prod Key', status: 'active', apiName: 'Payments API' }],
        orgs: [{ id: 'org-1', name: 'Acme', role: 'owner', memberCount: 3 }],
        logs: [{ id: 'log-1', action: 'API_CREATED', resourceType: 'api', resourceId: 'api-1', ip: '127.0.0.1', createdAt: new Date().toISOString() }],
        key: { id: 'key-new', apiKey: 'ag_test_new_secret' },
        api: { id: 'api-2' },
        org: { id: 'org-2' },
        tokens: { accessToken: 'tok-123', refreshToken: 'ref-123' }
      }
    }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, calls }));
  });
}

const closeServer = (server) =>
  new Promise((resolve) => {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    server.close(() => resolve());
  });

test('apis list prints the registered API', async () => {
  const { server } = await bootGateway();
  try {
    const out = await runCli(['apis', 'list'], { GUARDIAN_BASE_URL: `http://127.0.0.1:${server.address().port}`, GUARDIAN_TOKEN: 'tok-123' });
    assert.match(out, /Payments API/);
    assert.match(out, /api-1/);
  } finally {
    await closeServer(server);
  }
});

test('keys list prints keys', async () => {
  const { server } = await bootGateway();
  try {
    const out = await runCli(['keys', 'list'], { GUARDIAN_BASE_URL: `http://127.0.0.1:${server.address().port}`, GUARDIAN_TOKEN: 'tok-123' });
    assert.match(out, /Prod Key/);
  } finally {
    await closeServer(server);
  }
});

test('orgs list prints orgs with roles', async () => {
  const { server } = await bootGateway();
  try {
    const out = await runCli(['orgs', 'list'], { GUARDIAN_BASE_URL: `http://127.0.0.1:${server.address().port}`, GUARDIAN_TOKEN: 'tok-123' });
    assert.match(out, /Acme/);
    assert.match(out, /owner/);
  } finally {
    await closeServer(server);
  }
});

test('keys create prints the new key once', async () => {
  const { server } = await bootGateway();
  try {
    const out = await runCli(
      ['keys', 'create', '--api-id', 'api-1', '--name', 'CLI Key'],
      { GUARDIAN_BASE_URL: `http://127.0.0.1:${server.address().port}`, GUARDIAN_TOKEN: 'tok-123' }
    );
    assert.match(out, /ag_test_new_secret/);
  } finally {
    await closeServer(server);
  }
});

test('audit prints entries with action', async () => {
  const { server } = await bootGateway();
  try {
    const out = await runCli(
      ['audit', '--action', 'API_CREATED'],
      { GUARDIAN_BASE_URL: `http://127.0.0.1:${server.address().port}`, GUARDIAN_TOKEN: 'tok-123' }
    );
    assert.match(out, /API_CREATED/);
  } finally {
    await closeServer(server);
  }
});

test('unknown command fails with a clear error', async () => {
  const { server } = await bootGateway();
  try {
    await assert.rejects(
      runCli(['nope'], { GUARDIAN_BASE_URL: `http://127.0.0.1:${server.address().port}` }),
      /Unknown command 'nope'/
    );
  } finally {
    await closeServer(server);
  }
});

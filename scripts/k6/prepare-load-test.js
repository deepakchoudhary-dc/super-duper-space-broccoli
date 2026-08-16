/**
 * CI load-test bootstrap — provisions everything the k6 suites need and
 * prints exportable env vars, then exits (the echo upstream runs separately
 * via scripts/k6/echo-upstream.js).
 *
 *   node scripts/k6/echo-upstream.js &
 *   node scripts/k6/prepare-load-test.js > /tmp/gateway-env.env
 *
 * Creates, through the real management API:
 *   - a fresh user
 *   - a registered upstream pointing at the echo server (ECHO_PORT, default 5199)
 *   - a high-limit API key
 *
 * Prints `export KEY=value` lines to stdout.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', 'server', '.env') });

const GATEWAY = process.env.BASE_URL || 'http://localhost:5000';
const ECHO_PORT = process.env.ECHO_PORT || '5199';

const post = (path, body, token) =>
  fetch(`${GATEWAY}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const json = await r.json();
    if (!r.ok) throw new Error(`${path} -> ${r.status}: ${JSON.stringify(json)}`);
    return json;
  });

async function main() {
  // 1. Register a user
  const email = `loadtest-${Date.now()}@test.local`;
  const reg = await post('/api/auth/register', {
    email,
    password: 'Str0ng!Passw0rd',
    firstName: 'Load',
    lastName: 'Test',
  });
  const login = await post('/api/auth/login', { email, password: 'Str0ng!Passw0rd' });
  const accessToken = login.data.tokens.accessToken;
  const userId = reg.data.user.id;

  // 2. Register the upstream pointing at the echo server
  const api = await post(
    '/api/apis',
    { name: `k6 Load API ${Date.now()}`, baseUrl: `http://127.0.0.1:${ECHO_PORT}`, version: '1.0.0' },
    accessToken
  );
  const apiId = api.data.api.id;

  // 3. A generous API key for the load test (rate-limit test uses its own low-limit key).
  //    Budget: 100M requests per hour — the load suite fires ~1k req/s, which
  //    would exhaust a small budget mid-run and turn every later request into
  //    a 429 (failing the http_req_failed gate on the gateway, not on k6).
  const key = await post(
    '/api/keys',
    { name: 'k6 Load Key', apiId, rateLimit: 100000000, rateLimitWindow: 3600 },
    accessToken
  );
  const rawKey = key.data.key.apiKey;

  // 4. Sanity probe through the real proxy path
  const probe = await fetch(`${GATEWAY}/proxy/${userId}/${apiId}/ping`, {
    headers: { 'X-API-Key': rawKey },
  });
  if (probe.status >= 500) {
    throw new Error(`Bootstrap probe failed with ${probe.status}`);
  }

  console.log(`export API_KEY=${rawKey}`);
  console.log(`export USER_ID=${userId}`);
  console.log(`export API_ID=${apiId}`);
  console.log(`export ACCESS_TOKEN=${accessToken}`);
  console.log(`export ECHO_PORT=${ECHO_PORT}`);
  console.log('# gateway bootstrap complete');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

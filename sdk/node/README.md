# @api-guardian/sdk

Official Node.js client for the API Guardian gateway. Call your protected
upstreams through the proxy with API-key auth, automatic retries and
rate-limit awareness — no HTTP plumbing required.

## Install

```bash
npm install @api-guardian/sdk
```

## Quick start

```js
const { ApiGuardian } = require('@api-guardian/sdk');

const client = new ApiGuardian({
  baseUrl: 'https://gw.example.com', // gateway origin
  apiKey:  'ag_live_...',            // dashboard -> API Keys
  userId:  '...',                    // owner user id
  apiId:   '...',                    // registered API id
});

const user = await client.get('/users/42');
await client.post('/users', { name: 'Ada', role: 'admin' });
await client.delete(`/users/42`);
```

Every call goes through the gateway: `GET /proxy/{userId}/{apiId}/...` with
your API key attached, WAF + SSRF + rate-limit protection applied, and the
gateway's `{ success, data }` envelope unwrapped for you.

## Behavior

- **Auth** — `X-API-Key` header is attached automatically.
- **Retries** — 429 and 5xx responses are retried with exponential backoff
  (default 3 attempts). `Retry-After` is honored, capped at 10s per attempt.
- **Timeouts** — configurable per client and per request (default 30s).
- **Tracing** — pass a `traceparent` in request options to continue a W3C
  trace into the upstream call.

## Errors

```js
const { RateLimitError, UpstreamError } = require('@api-guardian/sdk');

try {
  await client.get('/users');
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`rate limited, retry in ${err.retryAfterSeconds}s`);
  } else if (err instanceof UpstreamError) {
    console.log('upstream unreachable or timed out');
  }
}
```

## Options

| Option      | Default  | Description                                    |
|-------------|----------|------------------------------------------------|
| `baseUrl`   | required | Gateway origin                                 |
| `apiKey`    | required | API key                                        |
| `userId`    | required | Owner user id                                  |
| `apiId`     | required | Registered API id                              |
| `retries`   | `3`      | Max retries on 429/5xx                         |
| `backoffMs` | `250`    | Base exponential backoff                       |
| `timeoutMs` | `30000`  | Request timeout                                |

## Tests

```bash
node --test test/
```

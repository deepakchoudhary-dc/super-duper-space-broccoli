# API Guardian — God-Level Hardening: Deep Analysis & Implementation Report

---

## 1. Research Methodology

**Codebase audit:** full line-by-line review of all 20+ server files, database schema, proxy engine, auth pipeline, and the React client (routing, auth context, API layer).

**Web research:** 35 deep web searches across:
- Gateway architecture (Kong/OpenResty, APISIX/etcd, Envoy/xDS, Tyk/Go+Redis, Traefik providers, Gravitee policy studio, KrakenD stateless)
- Key management platforms (Unkey SHA-256 hashing, Zuplo, Moesif, APIhero)
- Rate limiting (fixed vs sliding vs token bucket vs leaky bucket; Redis Lua atomicity; IETF RateLimit headers)
- Security (OWASP API Top 10, JWT refresh rotation, SSRF prevention, request smuggling/hop-by-hop headers, GitHub secret scanning partner program, mTLS)
- Observability (OpenTelemetry, Prometheus, request correlation IDs)
- Resilience (circuit breakers, active/passive health checks)
- Scale (HTTP keep-alive agents, pg pooling, k6 load testing, CI/CD with service containers)

**Primary sources read:** Unkey security documentation, IETF rate-limit header draft, Kong/APISIX/Tyk/Gravitee docs.

**20+ GitHub repositories analyzed:** Kong/kong, apache/apisix, envoyproxy/envoy, traefik/traefik, TykTechnologies/tyk, gravitee-io/gravitee-api-management, KrakenD/krakend, ExpressGateway/express-gateway, unkeyed/unkey, Moesif, zuplo, upstash/ratelimit, animir/node-rate-limiter-flexible, express-rate-limit, chimurai/http-proxy-middleware, open-telemetry/opentelemetry-js, prometheus/client_js, apihero-project, Kong/konnect-portal, lob/rate-limiter.

---

## 2. Shortcomings Found (verified in code)

### Critical security
| # | Finding | Location |
|---|---------|----------|
| 1 | **SQL injection / NaN crash**: `INTERVAL '${parseInt(days)} days'` interpolated directly into SQL — `parseInt('abc')` = NaN crashes queries; negative/unbounded windows allowed | `analytics.js` ×8, `apis.js` ×3, `users.js` ×3 |
| 2 | **Dashboard JWT leaked upstream**: proxy forwarded `authorization`, `cookie`, and raw `X-API-Key` headers to upstream services | `proxy.js` |
| 3 | **No SSRF protection**: users could register upstreams pointing at cloud metadata (`169.254.169.254`) or internal ranges | `apis.js` create/update |
| 4 | **Fake production data**: `/users/stats`, `/recent-activity`, `/alerts` returned hardcoded mocks | `users.js` |
| 5 | **Broken Swagger docs**: `./routes/*.js` resolved from `cwd` (0 files found) and no JSDoc annotations existed | `docs.js` |
| 6 | **Email-change dead-end**: changing email reset `is_email_verified` but never sent a verification email | `users.js` |
| 7 | **Inconsistent password policy**: register min 6 chars vs reset requiring 8 + complexity | `auth.js` |
| 8 | **Permission method case bug**: stored `['GET']` compared against lowercase `'get'` → default keys always 403 | `proxy.js`, `middleware/auth.js` |
| 9 | **Incomplete schema migrations**: existing DBs missing newer `apis` columns (`is_public`, `auth_required`, …) → runtime crashes on upgrade | `config/database.js` |
| 10 | **Racy rate limiting**: GET-then-INCR fixed-window, non-atomic, burst-prone, no multi-tier | `config/redis.js` |

### Reliability & observability
- No circuit breaker / upstream health checks (gateway keeps hammering dead upstreams)
- No WebSocket/SSE proxying
- No Prometheus `/metrics`
- No WAF (SQLi/XSS/path traversal detection)
- No alerting (rate-limit-exceeded email template existed but was never invoked)
- No pagination clamping (resource exhaustion via `LIMIT 999999999`)
- No trace-context propagation, no deep health check (DB/Redis status)
- Zero automated tests (`jest server/tests` ran nothing)
- Docker ran as root with a broken healthcheck (curl not in alpine)

---

## 3. Implemented (God-Level Upgrades)

### Security hardening
- **Parameterized `MAKE_INTERVAL`** in all 14 injection sites; day values clamped to [1,365].
- **`server/config/env.js`**: centralized typed config; production fails fast on missing/placeholder secrets.
- **Proxy header sanitization**: allowlist forwarding — Authorization/Cookie/raw API key never leave the gateway.
- **SSRF protection** (`utils/ssrf.js`): scheme allowlist, private/link-local/metadata range rejection (IPv4+IPv6), DNS-rebinding-resistant re-validation per request, IP-literal fast path; enforced at API registration and every proxy forward.
- **Path traversal sanitization** on proxy paths.
- **WAF** (`utils/waf.js`): SQLi / XSS / path traversal / command / NoSQL / sensitive-data regex pipeline on all API + proxy traffic; blocked payloads audit-logged as security events.
- **Consistent password policy** (8+ with upper/lower/digit/special) on register + reset.
- **Email-change verification flow** now issues + sends a fresh verification token.
- **Rate limits added** to `/api/auth/refresh`, `/verify-email`, `/proxy/test`, `/proxy/stats`.
- **Pagination clamped** to ≤100 per page.
- **Complete idempotent migrations** for legacy tables (users, apis, api_keys).
- **Non-root Docker** (node user), working HEALTHCHECK, production-only deps.

### Gateway engine
- **Atomic multi-tier rate limiter** (`utils/rateLimiter.js`): Redis Lua sliding window (sorted-set timestamps, single atomic eval) with optional burst/hourly/daily quota tiers per key; in-memory fallback when Redis is down; `RateLimit-Policy` + `X-RateLimit-*` headers per IETF draft; `Retry-After` on 429.
- **Circuit breaker + active health checks** (`utils/circuitBreaker.js`): per-upstream closed/open/half-open state machine, passive failure counting, `/health` probing, 503 fail-fast.
- **WebSocket/SSE proxying**: `server.on('upgrade')` handler authenticates the API key, enforces rate limits, SSRF-checks the target, and bridges sockets bidirectionally.
- **Request/response transformation**: strips `x-powered-by`/`server`, injects gateway metadata headers, security headers on proxied responses.
- **Alerting engine** (`utils/alerts.js`): rate-limit-exceeded emails (cooldown-throttled), security-event notifications honoring user settings.

### Observability & ops
- **Prometheus `/metrics`** (`utils/metrics.js`): request counters, latency histograms, rate-limit rejections by tier, WAF blocks by category, upstream failures, circuit-breaker state, Redis availability, active connections, Node process metrics.
- **Deep `/health`** with DB + Redis status (503 when degraded).
- **W3C traceparent propagation** + `X-Request-Id` on every response.
- **Real analytics**: `/users/stats`, `/recent-activity`, `/alerts` now query live data (error rates, expiring keys, rate-limit pressure).
- **Fixed Swagger**: absolute path resolution + OpenAPI annotations for auth/apis/keys/proxy endpoints (7 documented paths, was 0).
- **GitHub Actions CI**: unit tests, integration tests against real Postgres/Redis service containers, client tests + production build.

### Tests
- **46 unit tests** (all passing): crypto (key gen/hash/verify/format), WAF patterns, rate limiter tiers + burst, SSRF (private IPs, schemes, DNS), circuit breaker state machine, env config.
- **Client smoke test** (App renders login).
- **Integration suite** (`server/tests/integration/api.test.js`): register → login → API → key → proxy validate → revoke → health, gated behind `RUN_INTEGRATION=true` for CI.

---

## 4. Verification Results (live E2E against Postgres)

| Check | Result |
|---|---|
| Register (strong pwd) / weak-pwd rejection | ✅ / ✅ |
| Login + token issuance | ✅ |
| API registration with public upstream | ✅ |
| SSRF rejection (`169.254.169.254`, `10.0.0.5`) | ✅ |
| API key creation (`ag_test_…`, raw shown once, never stored) | ✅ |
| Key list never exposes raw key; shows burst/hourly/daily limits | ✅ |
| Proxy auth + streaming to upstream (1.1.1.1 → Cloudflare 301 relayed) | ✅ |
| Default-permission key now passes (case-insensitive methods) | ✅ |
| Burst limit 3/sec → 4th request 429 + `Retry-After` | ✅ |
| WAF blocks SQLi payload with 400 + security event | ✅ |
| `/metrics` exposes gateway counters | ✅ |
| `/health` reports database: ok, redis: down (degraded, not dead) | ✅ |
| Swagger documents 7 paths | ✅ |
| Unit tests 46/46, client test 1/1, production build | ✅ |

---

## 5. Future Work (not implemented — out of scope for this pass)

- OAuth2/OIDC + JWKS external IdP support and mTLS client-cert auth
- Multi-tenancy (organizations/workspaces/RBAC)
- Stripe metered billing / API monetization
- GitHub secret-scanning partner webhook (auto-revoke leaked keys)
- AI/LLM gateway (semantic caching, token budgets, provider failover)
- Kubernetes ingress/CRD, Terraform provider
- SDKs (TypeScript/Python/Go) and `guardian-cli`
- k6 load-test benchmarks; Redis cluster/High-Availability; PgBouncer for pool scaling

# API Guardian — High-Security API Access & Governance Hub

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-blue.svg)](https://www.postgresql.org/)
[![Security: Zero--Trust](https://img.shields.io/badge/Security-Zero--Trust%20Hashing-success.svg)](#security-architecture)

**API Guardian** is a production-ready, centralized API Gateway and Security Hub designed to secure, monitor, and manage consumer access across modern web architectures. Built with a zero-trust cryptographic model, API Guardian ensures your backend microservices are resilient against unauthorized access, credential stuffing, replay attacks, and abusive traffic patterns.

---

## Core Features

- **Zero-Trust API Key Cryptography**: Plaintext API keys are **never stored** in the database. Keys are cryptographically hashed using SHA-256 with timing-safe verification, guaranteeing zero exposure even in the event of database exfiltration.
- **JWT Token Type Isolation & Rotation Families**:
  - Separate cryptographic secrets for Access (`JWT_ACCESS_SECRET`) and Refresh (`JWT_REFRESH_SECRET`) tokens.
  - Refresh token family rotation with automated stolen token replay detection and instant family revocation.
  - Instant Redis token blacklisting on logout.
- **High-Performance Streaming Proxy**:
  - Keep-Alive HTTP/HTTPS connection pooling (`Map<baseUrl, Agent>`).
  - Zero-copy streaming pipeline (`req.pipe(proxyReq)` / `proxyRes.pipe(res)`) eliminating memory buffering bottlenecks.
  - **WebSocket / SSE upgrade proxying** with full API-key auth, rate limiting, and SSRF checks.
  - **Header sanitization**: dashboard JWTs, cookies, and raw API keys are never forwarded upstream.
  - **SSRF protection**: upstream targets are validated against private/link-local/metadata ranges at registration and per-request.
- **Multi-Tier Atomic Rate Limiting**:
  - Redis Lua sliding-window with **burst (per-second), hourly, and daily quota tiers** per key — atomic, race-free.
  - In-memory fallback when Redis is unavailable (graceful degradation).
  - `RateLimit-Policy` / `X-RateLimit-*` headers per the IETF draft.
- **Upstream Resilience (Circuit Breaker + Health Checks)**:
  - Per-upstream three-state circuit breaker (closed/open/half-open) with passive failure counting.
  - Active `/health` probing with automatic unhealthy-node ejection.
  - 503 fail-fast when an upstream circuit is open.
- **WAF (Web Application Firewall)**:
  - SQL injection, XSS, path traversal, command injection, and NoSQL injection detection on all API + proxy traffic.
  - Blocked payloads are audit-logged as security events.
- **Prometheus Metrics Endpoint** (`/metrics`):
  - Request counters, latency histograms, rate-limit rejections, WAF blocks, upstream failures, circuit states, Redis availability.
- **Real-Time Analytics & Monitoring**:
  - Interactive dashboards with latency graphs, throughput metrics (RPS), status code distributions, and error tracking.
  - Per-API and per-key usage telemetry.
  - **Real alert data** — elevated error rates, expiring keys, and rate-limit pressure (no more mock endpoints).
- **Defensive Hardening**:
  - Strict Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), XSS protection, and frame-ancestors blocking via Helmet.
  - Granular rate limiting per IP, per user, and per API key.
  - Account lockout protection against brute-force attacks.
  - **Fail-fast env validation** — production refuses to boot with missing/placeholder secrets.
  - **Consistent password policy** (8+ chars with complexity) enforced at registration and reset.
  - Email-change flow now issues a fresh verification token.
  - Pagination clamped to prevent resource exhaustion.
- **Alerting Engine**: rate-limit-exceeded and security events trigger cooldown-throttled email notifications to key owners.
- **Immutable Audit Trail** (append-only, DB-enforced): every security event (WAF blocks, rate-limit hits, SSRF blocks, circuit opens, leaked-key revocations) and every sensitive mutation lands in `audit_logs`, queryable by admins via `GET /api/admin/audit-logs` with retention-based purging.
- **Response Caching**: Redis-backed GET/HEAD cache per API key with upstream `Cache-Control` awareness, `X-Cache: HIT/MISS` headers, bounded body size, and instant invalidation when a key is revoked/rotated. Graceful in-memory fallback without Redis.
- **Request/Response Transformation Engine**: per-API path rewrites, request/response header rules, query-parameter stripping, CORS policy, and upstream response gzip — configured via `PATCH /api/apis/:id/transform`.
- **API Key Rotation**: `POST /api/keys/:id/rotate` issues a replacement key with the same limits/permissions and retires the old one — immediately or after a zero-downtime grace period.
- **Leaked-Key Auto-Revocation**: a GitHub secret-scanning webhook (`POST /api/webhooks/github-secret-scanning`) verifies a shared token, hashes reported tokens, revokes matches instantly, purges caches, and alerts the owner.
- **OAuth2 / OIDC Single Sign-On**: PKCE (S256) authorization-code flow against any OIDC provider (Google, GitHub, Azure, Okta, Keycloak...), user auto-linking by subject/email, and issuance of the same isolated JWT pair.
- **mTLS Upstream Auth**: per-API client certificates presented to upstreams (`mtls_config` on the API record).
- **Multi-Tenancy (Organizations)**: organizations with owner/admin/member roles, membership management, and org-scoped APIs and keys.
- **Full OpenTelemetry (opt-in)**: set `OTEL_ENABLED=true` to register the OTel Node SDK and export W3C traces over OTLP/HTTP to any collector (Jaeger, Tempo, SigNoz). Proxy requests, cache hits/misses, WAF blocks and rate-limit rejections are recorded as spans/events; the SDK is never loaded when disabled (zero overhead).
- **Load Testing & CI Performance Gate**: k6 suites for smoke, sustained load (p95 < 500ms gate), cache HIT ratio and rate-limit behavior, wired into GitHub Actions as a `perf-gate` job with hard thresholds.
- **Operations Tooling**: PgBouncer connection-pooler config, Redis HA via Sentinel (3 nodes + 3 sentinels with auto-failover and client discovery), and PostgreSQL backup/restore scripts with retention and optional S3 offload.
- **Starter SDK & CLI**: a dependency-free Node SDK (`@api-guardian/sdk`) with retries/backoff, rate-limit awareness and typed errors, plus a zero-dependency CLI (`guardian apis|keys|orgs|audit|proxy`).
- **Self-Healing Database & Graceful Fallbacks**:
  - Automatic idempotent database schema migrations on startup (including legacy-table column backfills).
  - Graceful Redis fail-open fallback ensuring uptime even if the cache layer is down.

---

## Architecture Overview

```text
                                 ┌─────────────────────────┐
                                 │   Frontend Dashboard    │
                                 │   (React + MUI v5)      │
                                 │   http://localhost:3000 │
                                 └────────────┬────────────┘
                                              │ (REST / JWT)
                                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                             API GUARDIAN SERVER                          │
│                           http://localhost:5000                          │
│                                                                          │
│   ┌───────────────────┐    ┌────────────────────┐    ┌───────────────┐   │
│   │   Auth & RBAC     │    │  Key Management    │    │  Proxy Engine │   │
│   │  - JWT Isolation  │    │  - SHA-256 Hashing │    │  - Pooling    │   │
│   │  - Family Rotation│    │  - Scopes/IP Rules │    │  - Streaming  │   │
│   └─────────┬─────────┘    └──────────┬─────────┘    └───────┬───────┘   │
└─────────────┼─────────────────────────┼──────────────────────┼───────────┘
              │                         │                      │
              ▼                         ▼                      ▼
      ┌───────────────┐         ┌───────────────┐      ┌────────────────┐
      │  PostgreSQL   │         │ Redis (Cache) │      │ Downstream API │
      │  (Persistent) │         │ (Tokens/Rate) │      │ Microservices  │
      └───────────────┘         └───────────────┘      └────────────────┘
```

---

## Project Structure

```text
super-duper-space-broccoli/
├── client/                     # React Single Page Application (SPA)
│   ├── public/                 # Static assets & HTML template
│   ├── src/
│   │   ├── components/         # Layouts, Navigation & reusable UI components
│   │   ├── contexts/           # AuthContext & State management
│   │   ├── pages/              # Dashboard, APIs, APIKeys, Analytics, Profile, Settings
│   │   └── services/           # Axios HTTP API client & interceptors
│   └── package.json
├── server/                     # Express API Gateway & Auth Server
│   ├── config/                 # PostgreSQL pool & Redis client configurations
│   ├── database/               # Database SQL schema & init scripts
│   ├── middleware/             # Auth, Rate Limiting, RBAC & Error Handlers
│   ├── routes/                 # Auth, APIs, Keys, Analytics, Proxy, Settings routes
│   ├── utils/                  # Cryptographic utilities, logger, email, tracing
│   ├── index.js                # Server entry point & graceful shutdown
│   └── package.json
├── client/                     # React SPA (dashboard, orgs, admin audit UI)
├── scripts/
│   ├── k6/                     # Load-test suites + CI perf-gate bootstrap
│   └── ops/                    # PgBouncer, Redis HA (sentinel), backup/restore
├── sdk/node/                   # Official Node.js SDK (@api-guardian/sdk)
├── cli/                        # Zero-dependency CLI (@api-guardian/cli)
├── docker-compose.yml          # Multi-container orchestration (DB, Redis, Server, Client)
├── .gitignore                  # Strict anti-leak protection rules
├── package.json                # Root automation scripts
└── README.md
```

---

## Quick Start Guide

### Prerequisites
- **Node.js**: `v18.0.0+` (LTS recommended)
- **npm**: `v9.0.0+`
- **PostgreSQL**: `v14+` running on port `5432`
- **Redis** *(optional)*: running on port `6379` (Server falls back gracefully if absent)

---

### Step 1: Install Dependencies
Run the installation script from the project root:

```bash
# Install root, server, and client dependencies
npm run install:all
```

---

### Step 2: Configure Environment Variables

1. Copy the example configuration to create your local `server/.env`:
   ```bash
   cp server/.env.example server/.env
   ```

2. Verify or update the database credentials in `server/.env`:
   ```env
   PORT=5000
   NODE_ENV=development
   FRONTEND_URL=http://localhost:3000

   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=api_guardian
   DB_USER=postgres
   DB_PASSWORD=postgres

   # JWT Isolated Secrets (Change in Production)
   JWT_ACCESS_SECRET=your-access-secret-minimum-32-characters
   JWT_REFRESH_SECRET=your-refresh-secret-minimum-32-characters
   JWT_EXPIRES_IN=7d
   JWT_REFRESH_EXPIRES_IN=30d

   # Skip email verification during local development
   SKIP_EMAIL_VERIFICATION=true
   ```

3. Ensure `client/.env` exists:
   ```env
   REACT_APP_API_URL=http://localhost:5000
   ```

---

### Step 3: Run the Application

Start both backend and frontend concurrently:

```bash
npm run dev
```

- **Frontend UI**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:5000](http://localhost:5000)
- **Interactive API Docs (Swagger)**: [http://localhost:5000/api/docs](http://localhost:5000/api/docs)
- **Health Check**: [http://localhost:5000/health](http://localhost:5000/health)

---

## Docker Deployment

To launch the complete isolated production-like environment with PostgreSQL, Redis, Node.js API Gateway, and React client:

```bash
# Build and run all services
docker-compose up --build

# Run in background
docker-compose up -d

# Stop all services
docker-compose down
```

---

## Anti-Leak & Security Guidelines

To ensure secrets, credentials, and sensitive assets are never leaked:

1. **Strict `.gitignore` Enforcement**:
   - Never remove `.env` or credential exclusions from `.gitignore`.
   - Never commit `.pem`, `.key`, `serviceAccountKey.json`, or `.pfx` certificate files.
2. **API Keys Stored as Hashes**:
   - Plaintext API keys (`ag_live_...`) are shown **once** upon creation and never stored.
   - Always copy your secret key immediately upon creation.
3. **Separate JWT Secrets**:
   - Always use distinct cryptographic secrets for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
4. **Pre-Commit Secret Scanning** *(Recommended)*:
   - Install `gitleaks` or `git-secrets` locally to automatically prevent accidental secret commits:
     ```bash
     # Example: Run gitleaks check
     gitleaks detect --source . --verbose
     ```

---

## Available NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts server (`nodemon`) and client (`react-scripts`) concurrently |
| `npm run server:dev` | Starts backend API server with hot-reload |
| `npm run client:dev` | Starts React frontend development server |
| `npm run install:all`| Installs all dependencies across root, server, and client |
| `npm run build` | Builds optimized React production bundle in `client/build` |
| `npm test` | Runs both backend Jest tests and client test suite |
| `npm run test:server` | Runs backend unit tests (46+ tests: crypto, WAF, rate limiter, SSRF, circuit breaker, config) |
| `npm run test:integration` | Runs full-stack integration tests (requires Postgres + Redis; `RUN_INTEGRATION=true`) |
| `npm run test:sdk` | Runs the Node SDK test suite (`node --test`) |
| `npm run test:cli` | Runs the CLI test suite (`node --test`) |
| `npm run load:test` | Runs the k6 load test (`scripts/k6/load.js`) |
| `npm run backup:db` | Runs the PostgreSQL backup script (`scripts/ops/backup.sh`) |
| `npm run docker:up` | Starts all Docker containers via `docker-compose` |
| `npm run docker:down`| Tears down all Docker containers and networks |

## Observability

- **Prometheus**: scrape `GET /metrics` (default). Metrics include `http_requests_total{method,path,status}`, `http_request_duration_seconds`, `gateway_rate_limit_exceeded_total{key_id,tier}`, `gateway_waf_blocked_total{category}`, `gateway_upstream_failures_total`, `gateway_circuit_breaker_state{api_id}`, `gateway_redis_available`, and Node.js process metrics.
- **Deep health check**: `GET /health` reports `database` and `redis` connectivity (returns 503 when degraded).
- **Tracing**: W3C `traceparent` is propagated to upstreams when present, and every response carries `X-Request-Id`.
- **OpenTelemetry (opt-in)**: with `OTEL_ENABLED=true` the gateway registers the OTel Node SDK and exports spans over OTLP/HTTP (`OTEL_EXPORTER_OTLP_ENDPOINT`, default `http://localhost:4318`) to Jaeger/Tempo/SigNoz. Proxy requests carry `proxy.request` spans with cache hit/miss events; WAF blocks and rate-limit rejections emit `waf.block` / `rate_limit.exceeded` events. Disabled by default — the SDK is never loaded, so there is zero runtime cost until you opt in.

## Security Model

| Control | Implementation |
| :--- | :--- |
| API keys at rest | SHA-256 hash, timing-safe compare (`crypto.timingSafeEqual`); raw key shown once |
| JWT | Isolated access/refresh secrets, `type` claim enforcement, family rotation + replay detection |
| SSRF | Scheme allowlist, private/link-local/metadata range rejection, per-request re-validation |
| Proxy header hygiene | Authorization/cookie/raw key stripped before forwarding upstream |
| WAF | SQLi / XSS / path traversal / command / NoSQL injection regex pipeline |
| Rate limiting | Atomic Redis Lua sliding window, multi-tier (burst/hour/daily), memory fallback |
| Upstream resilience | Circuit breaker + active health checks |
| Container | Non-root `node` user, HEALTHCHECK, production deps only |
| CI/CD | GitHub Actions: unit + integration tests against real Postgres/Redis, client build |
| Audit trail | Append-only `audit_logs` with DB-enforced immutability triggers; admin query API + retention purge |
| Response caching | Redis + memory fallback, per-key GET/HEAD cache, `Cache-Control` aware, invalidated on revoke |
| Transformations | Per-API path rewrites, header rules, query stripping, CORS, gzip |
| Key rotation | Replacement key issued with identical config; old key retired instantly or after grace period |
| Leak detection | GitHub secret-scanning webhook (shared-secret verified) auto-revokes leaked keys |
| SSO | OIDC authorization-code + PKCE with user linking; JWT pair reuse |
| mTLS | Per-API client certificate authentication toward upstreams |
| Multi-tenancy | Organizations with owner/admin/member roles; org-scoped APIs and keys |
| Tracing | W3C traceparent propagation + opt-in full OpenTelemetry (OTLP spans/events) |
| Load testing | k6 suites with hard latency/error thresholds in CI (`perf-gate` job) |
| Ops | PgBouncer pooler config, Redis Sentinel HA with client discovery, PG backup/restore |
| SDK/CLI | Retrying Node SDK with rate-limit backoff; zero-dep CLI for APIs, keys, orgs, audit |

---

## License
This project is licensed under the **MIT License**.

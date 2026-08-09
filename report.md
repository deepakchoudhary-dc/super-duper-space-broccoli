# API Guardian & API Gateway Platform: Comprehensive Technical Audit, Wear & Tear Analysis, and State-of-the-Art Implementation Roadmap

---

## Executive Summary

**API Guardian** (`super-duper-space-broccoli`) is an open-source API Gateway, API Key Management, and Developer Access Security Hub built with **Node.js, Express, PostgreSQL, Redis, React 18, and Material-UI (MUI v5)**. Its intended purpose is to serve as a centralized control plane and reverse proxy gateway allowing developers and engineering teams to register APIs, generate cryptographically scoped API keys, enforce granular endpoint-level permissions, throttle traffic with customizable rate limits, proxy upstream requests, and track real-time analytics and audit logs.

This report provides:
1. **A Complete "Wear and Tear" Codebase Audit**: A rigorous line-by-line inspection of architecture, security vulnerabilities, cryptographic flaws, concurrency/performance bottlenecks, and frontend runtime exceptions.
2. **Current Project Status & Existing Feature Inventory**: An exhaustive breakdown of all implemented components across backend services, middleware, database schemas, and frontend user interfaces.
3. **Deep Comparative Benchmark**: A structured analysis comparing API Guardian against industry-standard open-source giants (**Unkey, Apache APISIX, Kong Gateway, Tyk, Zuplo, and Gravitee.io**).
4. **Master "To-Be-Implemented Features" Roadmap**: A comprehensive, production-grade architectural specification detailing every feature, protocol, security control, observability mechanism, and developer tool required to transform API Guardian into an enterprise-grade API Gateway.

---

## Part 1: Project Current Status & Architecture

### 1.1 Architecture Overview

API Guardian is structured as a monolithic decoupled repository containing a backend API server, a reverse proxy engine, a PostgreSQL database, an optional Redis cache, and a React single-page application (SPA):

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CLIENT TIER                               │
│  React 18 SPA + Material-UI (MUI v5) + React Router v6 + Chart.js     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST (JWT Auth)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        API GUARDIAN BACKEND                            │
│  Express.js Server (Port 5000)                                         │
│  ├── /api/auth       : JWT Auth, Password Reset, Speakeasy TOTP 2FA    │
│  ├── /api/users      : Profile, Activity Logs, Dashboard Metrics       │
│  ├── /api/apis       : API Registry CRUD & Health Monitoring           │
│  ├── /api/keys       : Key Generation, Permissions & Lifecycle         │
│  ├── /api/analytics  : Time-Series Aggregations & Error Breakdown      │
│  ├── /api/docs       : Swagger UI / OpenAPI 3.0 Documentation          │
│  └── /proxy          : Reverse Proxy Gateway (http-proxy-middleware)   │
└──────────────────┬───────────────────────────────┬─────────────────────┘
                   │                               │
                   ▼                               ▼
┌─────────────────────────────────────┐  ┌───────────────────────────────┐
│          POSTGRESQL (v15)           │  │          REDIS (v7)           │
│  - users & audit_logs               │  │  - Sliding Window Counters    │
│  - apis & api_keys                  │  │  - API Key Cache (15m TTL)    │
│  - api_usage_logs                   │  │  - Session Storage            │
│  - verification & reset tokens      │  │                               │
└─────────────────────────────────────┘  └───────────────────────────────┘
```

---

## Part 2: Complete "Wear and Tear" Technical Audit

A rigorous code audit of the entire repository revealed several critical security vulnerabilities, broken SQL queries, performance bottlenecks, and frontend runtime exceptions.

### 2.1 Critical Security Vulnerabilities & Cryptographic Flaws

#### 1. Plaintext API Key Storage in Database (Severe Risk)
- **File**: `server/routes/keys.js` (Line 312) vs `README.md` (Line 143)
- **Finding**: While documentation and README claim *"Plaintext API keys are never stored in the database. Instead, only SHA-256 hashes are stored"*, the implementation actually stores the raw, plaintext API key string directly into `key_hash` (`VALUES ($1, $2, $3...)` where `$3 = apiKey`).
- **Impact**: Any database breach or unauthorized SQL read exposes all API keys in cleartext, enabling immediate identity spoofing and unauthorized upstream access.
- **Remediation**: Use SHA-256 / HMAC-SHA256 hashing to store only hashes in the database. Upon request arrival, hash the incoming header key and match against `key_hash` using constant-time comparison (`crypto.timingSafeEqual`).

#### 2. Dual-Purpose JWT Token Collision (Token Forgery Risk)
- **File**: `server/routes/auth.js` (Lines 52–62) & `server/middleware/auth.js` (Lines 7–35)
- **Finding**: `generateTokens` signs both `accessToken` (7d expiry) and `refreshToken` (30d expiry) using the exact same secret (`process.env.JWT_SECRET`) without embedding a token type claim (`token_type: 'access' | 'refresh'`).
- **Impact**: A client can pass a long-lived `refreshToken` to any authenticated endpoint (`Authorization: Bearer <refreshToken>`), and `authenticateToken` middleware will accept it as a valid access token for 30 days.
- **Remediation**: Use separate cryptographic secrets (`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`) or enforce explicit token claims (`{ type: 'access' }`) verified inside `authenticateToken`.

#### 3. Commented-Out Email Verification & Inactive Account Lockdown
- **File**: `server/routes/auth.js` (Lines 111–138, Lines 209–215)
- **Finding**: In `router.post('/register')`, `is_email_verified` is hardcoded to `TRUE` with comments stating *"TEMPORARILY SET EMAIL AS VERIFIED FOR TESTING"*, and email verification token generation and sending are commented out. In `router.post('/login')`, verification checks are disabled.
- **Impact**: Anyone can register with disposable, fake, or unowned email addresses without verification.
- **Remediation**: Re-enable verification token generation, store token hashes, and enforce email confirmation before granting full API key creation permissions.

#### 4. Refresh Token Invalidation & Rotation Absence
- **File**: `server/routes/auth.js` (Lines 800–857)
- **Finding**: The `/api/auth/refresh` endpoint accepts a valid refresh token and issues a new pair without blacklisting, rotating, or storing active refresh tokens in Redis/PostgreSQL.
- **Impact**: A compromised refresh token remains valid for 30 days even after the legitimate user logs out or requests password resets.

---

### 2.2 Broken Database Queries & SQL Syntax Errors (Runtime Crashes)

#### 1. Invalid PostgreSQL SQL Syntax in Key Update, Revoke, and Regenerate
- **File**: `server/routes/keys.js` (Lines 451–460, 540–550, 605–615)
- **Finding**: The `UPDATE` statements combine `WHERE` before `RETURNING` followed by `FROM` and another `WHERE`:
  ```sql
  UPDATE api_keys 
  SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
  WHERE id = $1 AND user_id = $2
  RETURNING ak.*, a.name as api_name
  FROM api_keys ak
  JOIN apis a ON ak.api_id = a.id
  WHERE ak.id = $1 AND ak.user_id = $2
  ```
- **Impact**: PostgreSQL throws a syntax error (`syntax error at or near "FROM"`) immediately whenever a user attempts to update, revoke, or regenerate an API key.
- **Remediation**: Correct the SQL query to standard PostgreSQL grammar:
  ```sql
  UPDATE api_keys ak
  SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
  FROM apis a
  WHERE ak.api_id = a.id AND ak.id = $1 AND ak.user_id = $2
  RETURNING ak.*, a.name AS api_name;
  ```

#### 2. Potential SQL Parse Crash on `NaN` in Time-Range Intervals
- **File**: `server/routes/proxy.js` (Line 263), `server/routes/analytics.js` (Lines 26, 41, 115)
- **Finding**: Dynamic string interpolation `INTERVAL '${parseInt(days)} days'` fails when `days` is non-numeric (`parseInt('abc')` evaluates to `NaN`), resulting in `INTERVAL 'NaN days'` which crashes with a 500 error.
- **Remediation**: Use parameterized query placeholders `$2` with `MAKE_INTERVAL(days => $2)` or sanitize input with default fallbacks: `const safeDays = Math.max(1, parseInt(days) || 30);`.

---

### 2.3 Performance & Gateway Throughput Bottlenecks

#### 1. Per-Request `createProxyMiddleware` Instantiation (Memory Leak)
- **File**: `server/routes/proxy.js` (Lines 180–235)
- **Finding**: `createProxyMiddleware` is instantiated dynamically inside the route handler callback on **every single incoming HTTP request**.
- **Impact**: Creating a new proxy instance per request creates internal HTTP agents, event listeners, and socket pools on every hit, causing severe memory leaks, event listener warnings, and connection exhaustion under concurrent load.
- **Remediation**: Create a singleton persistent proxy router or pool proxy instances keyed by upstream `base_url`.

#### 2. Broken Streaming & Large Payload Handling via Monkeypatched `res.end`
- **File**: `server/routes/proxy.js` (Lines 20–33)
- **Finding**: Usage logging intercepts only `res.end(chunk)`. If an upstream API streams data via multiple `res.write()` calls (e.g. chunked transfers, file downloads, LLM streaming tokens), all intermediate chunks are skipped. Furthermore, concatenating large binary chunks into a string (`responseBody += chunk.toString()`) triggers memory exhaustion.
- **Remediation**: Use non-blocking response streaming with standard response event listeners (`res.on('finish', ...)`), calculate sizes via byte counters, and avoid buffering response bodies in RAM.

#### 3. CommonJS Export Reference Timing in `redis.js`
- **File**: `server/config/redis.js` (Lines 4, 6, 186)
- **Finding**: `let redisClient;` is exported at module load time (`module.exports = { redisClient, ... }`). In CommonJS, destructured imports `const { redisClient } = require('./config/redis')` retain `undefined` even after `connectRedis()` assigns a client instance.
- **Remediation**: Export a getter function `getRedisClient()` or assign properties directly to the exported object.

---

### 2.4 Frontend Runtime Exceptions & Dead Navigation Routes

#### 1. Broken Navigation Routes Triggering 404 Pages
- `client/src/pages/dashboard/Dashboard.js` (Line 259): `navigate('/apis/new')` -> Route in `App.js` is `/apis/create`.
- `client/src/pages/APIKeys/CreateAPIKey.js` (Lines 554, 568): `navigate('/api-keys')` -> Route in `App.js` is `/keys`.
- `client/src/pages/Documentation/Documentation.js` (Line 378): `navigate('/documentation/apis')` -> Route does not exist in `App.js`.

#### 2. Key Creation Field Name Mismatch (`key.apiKey` vs `key.key`)
- **File**: `client/src/pages/APIKeys/CreateAPIKey.js` (Lines 208, 522)
- **Finding**: Server response returns `{ data: { key: { apiKey: "ag_..." } } }`, but the frontend references `createdKey.key`.
- **Impact**: `createdKey.key` is `undefined`, causing `'•'.repeat(createdKey.key.length)` to throw `TypeError: Cannot read properties of undefined (reading 'length')`, crashing the React render tree.

#### 3. Unimplemented Backend Settings Endpoints
- **File**: `client/src/pages/Settings/Settings.js` (Lines 105, 126, 138)
- **Finding**: The Settings page makes requests to `/settings`, `/settings/reset`, and `/settings/delete-account`, none of which exist on the backend Express router. All settings operations fail with 404.

#### 4. Swagger API Documentation Path Resolution
- **File**: `server/routes/docs.js` (Line 128)
- **Finding**: `apis: ['./routes/*.js']` resolves relative to `process.cwd()`. Running `npm run dev` from the repository root looks for `./routes/*.js` instead of `./server/routes/*.js`, resulting in 0 detected endpoints in Swagger UI.

---

## Part 3: Features Currently Provided

API Guardian currently provides the following functional capabilities:

| Module | Implemented Features |
| :--- | :--- |
| **Authentication & Identity** | User registration and login with bcrypt password hashing (12 rounds). Time-based One-Time Password (TOTP) Two-Factor Authentication via Speakeasy and QR code generation. JWT token generation (Access & Refresh). Password reset workflow with time-limited UUID tokens. |
| **API Registry Catalog** | Register backend services with name, version, description, category (REST, GraphQL), base URL, rate limits, and public/private status toggles. Full CRUD operations with user-level ownership isolation. |
| **API Key Management** | Key generation with prefixed format (`ag_<timestamp>_<hex>`). Configurable expiration dates. Granular permission definitions (wildcard path matching and HTTP method arrays). Key rotation, status toggles (active/inactive/revoked), and deletion. |
| **Reverse Proxy Gateway** | Target path forwarding using `http-proxy-middleware`. API key extraction via `X-API-Key` header or query parameter. Injected upstream headers (`X-API-Guardian-Key`, `X-Forwarded-For`, `X-Real-IP`). CORS preflight support. |
| **Rate Limiting** | Sliding window rate limiting backed by Redis. Per-key rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`). HTTP 429 response handling. Express-rate-limit protection on public auth endpoints. |
| **Usage Analytics** | Detailed usage logging into PostgreSQL (`api_usage_logs`). Latency tracking, status code distribution (2xx, 4xx, 5xx), error summaries, top endpoints by request count, and minute-by-minute real-time metrics. |
| **Developer Documentation** | Integrated Swagger / OpenAPI 3.0 UI specification. Live documentation rendering for registered endpoints. |
| **Security Audit Trail** | Security event logging into `audit_logs` table (user logins, key creations, updates, revocations, and profile edits). Winston daily rotating file logging for general app logs, errors, and proxy requests. |
| **Email Notifications** | Automated email dispatch via Nodemailer for account verification, password resets, new key creation alerts, and rate limit threshold exceedance. |

---

## Part 4: Comparative Benchmark with Top Open-Source Giants

To understand where API Guardian stands relative to the state of the art, we benchmarked it against leading open-source API Gateway & Key Management repositories:

```
┌────────────────────────┬────────────────────────────────────────────────────────────────────────────┐
│ Gateway / Platform     │ Primary Architecture & Core Strengths                                     │
├────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
│ Unkey (unkeyed/unkey)  │ Sub-ms edge verification, SHA-256 hashed keys, root keys, leaked key scan │
│ Apache APISIX          │ Nginx + LuaJIT + etcd dynamic configuration, hot reloading, 80+ plugins    │
│ Kong Gateway           │ Nginx/OpenResty, massive plugin ecosystem, enterprise OAuth2/mTLS, OTel    │
│ Tyk Gateway            │ Go-based, batteries-included Developer Portal, GraphQL Federation, Quotas  │
│ Zuplo                  │ GitOps code-as-configuration, OpenAPI zero-lag portal, AI/LLM Proxying    │
│ Gravitee.io            │ Multi-protocol (REST/gRPC/Kafka), visual Policy Studio, Alert Engine      │
└────────────────────────┴────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Feature Matrix Comparison

| Feature Capability | API Guardian (Current) | Unkey | Apache APISIX | Kong Gateway | Tyk Gateway | Zuplo | Gravitee |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Secure Key Hashing (SHA-256)** | ❌ Plaintext in DB | ✅ Yes | ✅ Plugin | ✅ Plugin | ✅ Yes | ✅ Yes | ✅ Yes |
| **Sub-millisecond Edge Verification** | ❌ Centralized DB | ✅ Global Edge | ✅ Local Cache | ✅ Local Cache | ✅ Redis/Memory| ✅ Edge (300+)| ✅ Local Cache |
| **Leaked Key Detection (GitHub)** | ❌ None | ✅ Yes | ❌ External | ❌ External | ❌ External | ❌ External | ❌ External |
| **Dynamic Hot-Reload Routing** | ❌ Server restarts | ✅ Dynamic | ✅ etcd sync | ✅ DB/DecK sync| ✅ Dynamic | ✅ GitOps | ✅ Cockpit Sync |
| **AI / LLM Proxying & Token Budgets**| ❌ None | ❌ None | ✅ AI Gateway | ✅ AI Gateway | ❌ None | ✅ Built-in | ✅ AI Plugins |
| **Semantic Response Caching** | ❌ Basic Redis TTL | ❌ None | ✅ Vector Cache | ✅ Plugin | ❌ None | ✅ Yes | ❌ None |
| **Multi-Tier Quotas (Monthly/Daily)**| ❌ Per-window only | ✅ Refill/Quota | ✅ Plugin | ✅ Quotas | ✅ Quotas | ✅ Stripe/Quota| ✅ Plans/Quotas |
| **OpenTelemetry (OTel) Distributed** | ❌ Custom Winston | ✅ OTel Logs | ✅ Native OTel | ✅ Native OTel | ✅ Native OTel | ✅ Native OTel | ✅ Native OTel |
| **Self-Service Developer Portal** | ⚠️ Basic Swagger | ✅ Client Portal | ⚠️ APISIX Hub | ✅ Dev Portal | ✅ Built-in | ✅ Auto-OpenAPI| ✅ Dev Portal |
| **mTLS / Client Certificate Auth** | ❌ None | ❌ None | ✅ Native mTLS | ✅ Enterprise | ✅ Native mTLS | ✅ Native mTLS | ✅ Native mTLS |
| **Request / Response Transformation**| ❌ None | ❌ None | ✅ Lua/Wasm | ✅ Lua/JS | ✅ JS/Go/Python| ✅ TypeScript | ✅ Visual Studio|
| **Multi-Tenancy & Teams / RBAC** | ❌ Single User | ✅ Workspaces | ✅ Consumer Groups| ✅ Workspaces | ✅ Orgs & Teams| ✅ Orgs & Teams| ✅ Environments|
| **Integrated API Monetization** | ❌ None | ❌ None | ❌ External | ❌ Enterprise | ❌ External | ✅ Stripe Edge | ✅ Plans/Billing|

---

## Part 5: Master "To-Be-Implemented Features" Roadmap

The following blueprint defines the complete, production-grade roadmap to elevate API Guardian into a world-class, enterprise-ready API Gateway and Key Management ecosystem.

---

### Pillar 1: Core Cryptographic & Security Hardening (Zero-Trust Gateway)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        ZERO-TRUST AUTHENTICATION PIPELINE                              │
│                                                                                        │
│  [ Incoming Request ]                                                                  │
│           │                                                                            │
│           ▼                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. IP & CIDR Whitelist / Geo-IP / ASN Threat Filter Check                        │  │
│  └───────────────────────────────────┬──────────────────────────────────────────────┘  │
│                                      ▼                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. Extract Key Prefix -> Lookup Cached Salt & SHA-256 Hash in Redis Memory       │  │
│  └───────────────────────────────────┬──────────────────────────────────────────────┘  │
│                                      ▼                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 3. Constant-Time Hash Comparison (`crypto.timingSafeEqual`)                     │  │
│  └───────────────────────────────────┬──────────────────────────────────────────────┘  │
│                                      ▼                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 4. RBAC & ABAC Evaluation (Method, Path Regex, Header Claims, Env Constraints)    │  │
│  └───────────────────────────────────┬──────────────────────────────────────────────┘  │
│                                      ▼                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 5. Atomic Multi-Tier Sliding Window Rate Limit & Quota Decrement (Redis Lua)    │  │
│  └───────────────────────────────────┬──────────────────────────────────────────────┘  │
│                                      ▼                                                 │
│                           [ Forward to Upstream ]                                      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 1. Cryptographic Key Hashing & Constant-Time Verification
- **SHA-256 / Argon2id Storage**: Never store plaintext API keys. Keys follow format: `ag_<env>_<keyId16>_<secret32>`. The database stores `key_prefix = ag_<env>_<keyId16>` as lookup index and `key_hash = SHA256(secret32 + salt)`.
- **Timing Attack Resistance**: Implement `crypto.timingSafeEqual()` for constant-time hash verification to prevent side-channel timing attacks.
- **Root Keys vs Consumer Keys**: Provide Root Management Keys for programmatic API administration with scoped administrative roles (`keys:write`, `apis:read`, `analytics:export`).

#### 2. Public Repository Secret Scanning & Auto-Revocation
- **GitHub Secret Scanning Partner Program Integration**: Implement a public webhook endpoint that validates incoming payload signatures from GitHub/GitLab secret scanning bots.
- **Instant Auto-Revocation & Security Alert**: When a leaked key is detected in a public repository, automatically revoke the key, purge Redis cache, generate an audit log, and send an emergency security alert email and SMS to the developer.

#### 3. Enterprise Identity, OAuth2 / OIDC & mTLS
- **OAuth2.0 / OpenID Connect (OIDC)**: Support JWTBearer tokens signed by external IdPs (Auth0, Okta, Keycloak, Firebase, AWS Cognito) with JWKS public key rotation caching.
- **Mutual TLS (mTLS)**: Support client certificate verification at the gateway level for zero-trust B2B microservice communication.
- **Hierarchical Role-Based (RBAC) & Attribute-Based Access Control (ABAC)**: Support fine-grained policy rules evaluated per request (e.g. `req.ip in allowed_cidrs && req.headers['x-tenant-id'] == key.metadata.tenant_id && req.method in allowed_methods`).

#### 4. WAF & Attack Mitigation Engine
- **Payload Inspection**: SQL injection (SQLi), Cross-Site Scripting (XSS), and Path Traversal detection via regex filter pipelines.
- **IP Reputation & Geo-Fencing**: MaxMind GeoIP2 integration to block or allow traffic based on ISO Country Codes, ASNs, or known malicious Tor/VPN exit node lists.
- **Token Blacklisting & Instant Session Revocation**: Redis Bloom Filter or set-based token revocation list allowing sub-millisecond global token revocation.

---

### Pillar 2: High-Performance Gateway & Traffic Engineering

```
                               ┌─────────────────────────────┐
                               │  Upstream Service Node 1    │
                               │  (Healthy - Weight 70%)     │
                               └──────────────▲──────────────┘
                                              │ Round Robin /
┌─────────────────────┐   Proxy Pipeline      │ Least Connections
│   Incoming Request  │ ───────────────────► ─┼─────────────────────────
└─────────────────────┘   [Zero-Copy Stream]  │ Active Health Check
                                              │
                               ┌──────────────▼──────────────┐
                               │  Upstream Service Node 2    │
                               │  (Healthy - Weight 30%)     │
                               └─────────────────────────────┘
```

#### 1. Zero-Copy Persistent Streaming Reverse Proxy
- **Persistent HTTP Agent Connection Pooling**: Replace per-request proxy instantiation with persistent `http.Agent` / `https.Agent` connection pools utilizing HTTP Keep-Alive, TCP socket reuse, and configurable max sockets.
- **Zero-Copy Streaming**: Stream request and response bodies directly between client and upstream using Node.js pipelines (`stream.pipeline`), ensuring zero memory buffering for file uploads, video streaming, and real-time data feeds.
- **WebSocket, SSE & gRPC Support**: Enable full duplex WebSocket proxying (`Upgrade: websocket`), Server-Sent Events (SSE) streaming, and HTTP/2 gRPC traffic forwarding.

#### 2. Upstream Load Balancing & Health Checking
- **Load Balancing Algorithms**: Round Robin, Weighted Round Robin, Least Connections, and IP Hash.
- **Active & Passive Health Checking**:
  - *Active*: Periodic background HTTP `/health` probes to remove unhealthy upstream instances automatically.
  - *Passive*: Circuit breaker ejection when an upstream node returns consecutive 5xx errors or timeouts.

#### 3. Circuit Breaker & Fallback System
- **Three-State Circuit Breaker**: Closed (Normal), Open (Immediate failover / cached response), Half-Open (Canary test requests).
- **Graceful Fallbacks**: Configurable static JSON fallbacks, cached stale response fallback (RFC 5861 `stale-if-error`), or secondary upstream failover.

#### 4. Multi-Tier Distributed Rate Limiting & Quotas
- **Atomic Sliding Window via Redis Lua Scripts**: Eliminate race conditions by executing rate limit checks and increments inside a single atomic Redis Lua script.
- **Multi-Tier Limits**:
  - Burst limit: e.g. 50 req/sec
  - Hourly rate limit: e.g. 5,000 req/hour
  - Monthly business quota: e.g. 1,000,000 req/month
- **Smooth Leaky Bucket / Token Bucket Support**: Prevent traffic spikes by shaping traffic smoothly across time windows.

#### 5. Request & Response Transformation Engine
- **Header & Query Manipulation**: Add, remove, or rewrite request/response headers (e.g. `X-Request-Id` UUID generation, stripping internal authorization tokens before forwarding).
- **URL & Path Rewriting**: Advanced regex-based path transformations (e.g. `/v1/users/:id/posts` -> `/posts?userId=:id`).
- **Body Mutation**: Request/response JSON transformation pipelines (stripping sensitive response fields, payload restructuring).

---

### Pillar 3: AI Gateway & LLM Traffic Management

```
                       ┌──────────────────────────────────────────────────────────┐
                       │                     AI GATEWAY HUB                       │
                       └────────────────────────────┬─────────────────────────────┘
                                                    │
                   ┌────────────────────────────────┼────────────────────────────────┐
                   ▼                                ▼                                ▼
     ┌───────────────────────────┐    ┌───────────────────────────┐    ┌───────────────────────────┐
     │      Semantic Cache       │    │     Token Budgeting       │    │     Guardrails & PII      │
     │  Vector embeddings match  │    │  Cost tracking per key    │    │  Prompt injection filter  │
     │  Instant zero-cost return │    │  Spend caps ($/mo limit)  │    │  Anonymize emails/phones  │
     └───────────────────────────┘    └───────────────────────────┘    └───────────────────────────┘
```

#### 1. Multi-Provider LLM Proxy & Unified API Key
- **Unified Interface**: A single gateway endpoint accepting standard OpenAI-compatible requests and intelligently routing between OpenAI, Anthropic Claude, Google Gemini, Groq, Mistral, and local Ollama instances.
- **Automatic Model Failover & Load Balancing**: If OpenAI returns a 429 rate limit or 503 outage, seamlessly retry and failover to Claude or Gemini with identical prompt formats.

#### 2. Semantic Caching Engine
- **Vector Embedding Similarity Cache**: Store previous LLM prompt-response pairs in Redis Vector Search / Qdrant. If an incoming prompt has a cosine similarity > 0.95, return the cached LLM response instantly in <10ms with zero LLM API cost.

#### 3. Token-Based Rate Limiting & Spend Caps
- **Cost & Token Counting**: Track prompt tokens, completion tokens, and dollar costs per API key in real-time.
- **Budget Enforcements**: Configure monthly spend caps (e.g. `$50.00/month`) per developer key, automatically blocking or throttling requests once the monetary threshold is reached.

#### 4. AI Guardrails & Prompt Injection Protection
- **PII Redaction**: Automatically detect and mask Sensitive Personal Information (credit card numbers, emails, phone numbers, SSNs) before forwarding prompts to external LLM providers.
- **Prompt Injection Defense**: Pre-filter prompts against known jailbreak patterns and malicious system override attempts.

---

### Pillar 4: Developer Portal & Interactive Experience

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           DEVELOPER SELF-SERVICE PORTAL                                 │
│                                                                                         │
│  [ Interactive Sandbox ]      [ Live API Docs ]             [ Multi-Language SDK ]      │
│  Try live endpoints with      Auto-synced OpenAPI 3.1       Copy-paste snippets in      │
│  developer's active API key   Interactive Swagger / Redoc   cURL, Python, TS, Go, Java  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 1. Zero-Sync Interactive OpenAPI 3.1 & AsyncAPI Portal
- **Import & Auto-Sync**: Drag-and-drop OpenAPI 3.1 (JSON/YAML) or Postman collections to instantly generate public/private interactive documentation.
- **Live Interactive Sandbox**: Developers can select their active API key from a dropdown and execute live test queries directly from the documentation browser with real response formatting.

#### 2. Automated Multi-Language Code Snippet Generator
- **Auto-Generated Client Code**: Provide 1-click copyable code snippets for every endpoint in:
  - `cURL`
  - `TypeScript / JavaScript (Fetch & Axios)`
  - `Python (Requests & HTTPX)`
  - `Go (net/http)`
  - `Java (OkHttp / HttpClient)`
  - `PHP (Guzzle)`
  - `C# (.NET HttpClient)`
  - `Rust (Reqwest)`

#### 3. Virtual Mock Endpoints
- **Mock Data Engine**: Enable developers to test client applications against mock JSON schemas or Faker.js-generated dynamic data before backend APIs are fully implemented.

#### 4. Developer Self-Service Key Provisioning
- **Self-Service Portal**: External developers can register, create test keys, manage their own IP whitelists, review usage graphs, and rotate compromised credentials without administrator intervention.

---

### Pillar 5: Enterprise Observability & OpenTelemetry (OTel)

```
┌──────────────────────┐      OpenTelemetry       ┌──────────────────────────────┐
│  API Guardian Core   │ ───────────────────────► │  Prometheus (/metrics)       │
│  Gateway Runtime     │      gRPC / OTLP         ├──────────────────────────────┤
└──────────────────────┘                          │  Grafana Cloud / Datadog     │
           │                                      ├──────────────────────────────┤
           ▼                                      │  Jaeger / Zipkin (Tracing)   │
┌──────────────────────┐                          ├──────────────────────────────┤
│  WebSocket Engine    │ ───────────────────────► │  Real-Time UI Live Stream    │
└──────────────────────┘                          └──────────────────────────────┘
```

#### 1. OpenTelemetry (OTel) Distributed Tracing
- **W3C Trace Context**: Inject and propagate `traceparent` and `tracestate` headers across gateway and upstream microservices.
- **OTLP Exporter**: Native export of spans to Jaeger, Zipkin, Honeycomb, Datadog, or Grafana Tempo.

#### 2. Native Prometheus Metrics Endpoint
- Expose `/metrics` scraped by Prometheus with metrics:
  - `http_requests_total{api_id, status, method}`
  - `http_request_duration_seconds_bucket{api_id, endpoint}`
  - `gateway_active_connections`
  - `redis_cache_hits_total` / `redis_cache_misses_total`
  - `rate_limit_exceeded_total{api_key_id}`

#### 3. Real-Time Live Traffic Stream (WebSocket / SSE)
- Live WebSocket stream in the dashboard displaying incoming requests, real-time response times, status codes, and error bursts as they happen.

#### 4. Multi-Channel Alerting & Incident Notification Engine
- Customizable alert rules (e.g. *Error rate > 5% over 5 minutes*, *Latency p99 > 500ms*, *Key usage > 90% of quota*).
- Notification targets: **Slack Webhooks, Discord Webhooks, PagerDuty, OpsGenie, Custom Webhooks, SMS (Twilio), and Email**.

---

### Pillar 6: Monetization, Billing & Multi-Tenancy

```
┌──────────────────────┐      Usage Metering      ┌──────────────────────────────┐
│   Gateway Traffic    │ ───────────────────────► │  Stripe Usage-Based Meter    │
│   (Per-Key Hits)     │      Stripe Webhook      ├──────────────────────────────┤
└──────────────────────┘ ◄─────────────────────── │  Automated Tier Invoicing    │
                                                  └──────────────────────────────┘
```

#### 1. Stripe & LemonSqueezy Monetization Integration
- **Billing Models**:
  - *Tiered Subscriptions*: Free tier (1,000 req/mo), Pro ($29/mo for 100k req), Enterprise ($199/mo for 2M req).
  - *Pay-As-You-Go Metering*: Report exact request counts to Stripe Metered Billing API for automatic end-of-month invoicing.
  - *Prepaid Credits*: Developers purchase API credits that decrement on every request.

#### 2. Multi-Tenant Organizations & Workspace Hierarchy
- **Organization Management**: Users can create organizations, invite team members, assign granular workspace roles (**Owner, Admin, Developer, Auditor, Read-Only**), and manage isolated staging/production environments.

#### 3. Compliance & Audit Export
- **Audit Compliance**: Immutable audit logging for SOC2, HIPAA, and GDPR readiness.
- **1-Click Export**: Export audit trails and usage data in CSV, NDJSON, and Parquet formats.

---

### Pillar 7: Modern UI/UX Overhaul & Frontend Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                             MODERN DESIGN SYSTEM OVERHAUL                               │
│                                                                                         │
│  - HSL Curated Color Palettes (Dark/Light Seamless Toggle)                              │
│  - Command Palette (Cmd+K / Ctrl+K) for instant keyboard navigation                     │
│  - Recharts / Tremor Data Visualizations with Zoom & Filter Range Selectors             │
│  - Full CRUD Settings Module, Live Notification Center & Session Device Manager         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 1. Design System & Theme Polish
- **Color Palette & Glassmorphism**: Upgrade to a curated HSL design token system with glassmorphic cards, subtle borders, and smooth transitions.
- **Dark/Light Mode**: Seamless system-preference detection with persistent theme toggles.
- **Modern Typography**: Integrate Google Fonts (`Inter` / `Outfit` / `JetBrains Mono` for code blocks).

#### 2. Command Palette (`Cmd+K` / `Ctrl+K`)
- Instant keyboard navigation to jump across APIs, API keys, analytics, documentation, and user settings with zero mouse clicks.

#### 3. Complete Bug Fixes & Navigation Continuity
- Fix all broken routes (`/apis/new` -> `/apis/create`, `/api-keys` -> `/keys`, `/documentation/apis`).
- Connect all orphaned Settings pages to new backend endpoints (`/api/settings`).
- Correct API key creation response mappings to eliminate the `TypeError` crash.

---

### Pillar 8: Developer SDKs, CLI & CI/CD Tooling

#### 1. Official Client SDKs
- `@api-guardian/node`: TypeScript/JavaScript SDK for Node.js, Express, Next.js, and Cloudflare Workers.
- `api-guardian-py`: Python client with async/sync support for FastAPI, Django, and Flask.
- `api-guardian-go`: High-performance Go middleware for Gin, Echo, and Fiber.

#### 2. `guardian-cli` Developer Tool
- Command-line tool to manage APIs, generate keys, tail live logs, and simulate traffic from the terminal:
  ```bash
  guardian login
  guardian apis list
  guardian keys create --name "CI Key" --api "Payment API" --rate-limit 5000
  guardian logs tail --api "Payment API" --follow
  ```

#### 3. GitOps & Infrastructure as Code (IaC)
- **Terraform Provider**: Manage APIs, routes, and keys as declarative HCL code.
- **Kubernetes CRD / Ingress Controller**: Deploy API Guardian as a Kubernetes Ingress Controller with custom resource definitions (`kind: GuardianRoute`).

#### 4. Automated Testing Suite & Load Testing
- **Unit & Integration Tests**: 90%+ code coverage with Jest, Supertest, and Testcontainers (PostgreSQL + Redis).
- **Automated Load Testing Benchmarks**: k6 / Artillery scripts validating <2ms gateway proxy latency under 10,000 concurrent virtual users.

---

## Part 6: Implementation Priority & Phased Action Plan

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PHASED EXECUTION MATRIX                                   │
│                                                                                        │
│  PHASE 1: CRITICAL FIXES (Week 1-2)                                                    │
│  ├── SHA-256 Key Hashing & Timing-Safe Verification                                    │
│  ├── Fix Broken PostgreSQL SQL UPDATE queries in keys.js                               │
│  ├── Separate JWT Secrets & Token Type Claims                                          │
│  ├── Fix Frontend Broken Navigation Routes & TypeError Crash                           │
│  └── Resolve Swagger Documentation File Path Resolution                                │
│                                                                                        │
│  PHASE 2: TRAFFIC & GATEWAY EXCELLENCE (Week 3-4)                                      │
│  ├── Persistent Proxy Agent & Zero-Copy Stream Engine                                  │
│  ├── Atomic Redis Lua Script Sliding Window Rate Limiting                              │
│  ├── Backend Settings Module & Profile Management                                      │
│  └── Multi-Tier Quotas & Circuit Breaker                                               │
│                                                                                        │
│  PHASE 3: AI GATEWAY & DEVELOPER PORTAL (Week 5-6)                                     │
│  ├── Unified LLM Proxy Router (OpenAI / Claude / Gemini)                               │
│  ├── Semantic Cache & Token Spend Caps                                                 │
│  ├── Interactive OpenAPI 3.1 Sandbox & Code Generator                                  │
│  └── Public Leaked Key Scanning Webhook Integration                                    │
│                                                                                        │
│  PHASE 4: OBSERVABILITY & ENTERPRISE SCALE (Week 7-8)                                  │
│  ├── OpenTelemetry (OTel) & Prometheus /metrics                                        │
│  ├── Multi-Tenant Teams / RBAC & Stripe Billing                                        │
│  ├── Official SDKs (TypeScript / Python / Go) & guardian-cli                           │
│  └── Automated Load Testing & Kubernetes Ingress Controller                            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Conclusion

API Guardian has established a solid architectural foundation for developer-centric API access management. By executing the critical bug fixes, cryptographic hardening, high-performance streaming proxy upgrades, AI gateway capabilities, and developer portal enhancements outlined in this report, the project is poised to compete directly with premier industry gateways such as **Unkey, Kong, and Zuplo** while delivering a fast, secure, and delightful experience for modern engineering teams.

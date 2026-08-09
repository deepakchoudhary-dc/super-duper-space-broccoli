# 🛡️ API Guardian — High-Security API Access & Governance Hub

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-blue.svg)](https://www.postgresql.org/)
[![Security: Zero--Trust](https://img.shields.io/badge/Security-Zero--Trust%20Hashing-success.svg)](#security-architecture)

**API Guardian** is a production-ready, centralized API Gateway and Security Hub designed to secure, monitor, and manage consumer access across modern web architectures. Built with a zero-trust cryptographic model, API Guardian ensures your backend microservices are resilient against unauthorized access, credential stuffing, replay attacks, and abusive traffic patterns.

---

## 🌟 Core Features

- 🔐 **Zero-Trust API Key Cryptography**: Plaintext API keys are **never stored** in the database. Keys are cryptographically hashed using SHA-256 with timing-safe verification, guaranteeing zero exposure even in the event of database exfiltration.
- 🔄 **JWT Token Type Isolation & Rotation Families**:
  - Separate cryptographic secrets for Access (`JWT_ACCESS_SECRET`) and Refresh (`JWT_REFRESH_SECRET`) tokens.
  - Refresh token family rotation with automated stolen token replay detection and instant family revocation.
  - Instant Redis token blacklisting on logout.
- ⚡ **High-Performance Streaming Proxy**:
  - Keep-Alive HTTP/HTTPS connection pooling (`Map<baseUrl, Agent>`).
  - Zero-copy streaming pipeline (`req.pipe(proxyReq)` / `proxyRes.pipe(res)`) eliminating memory buffering bottlenecks.
  - Non-blocking asynchronous audit logging on request completion.
- 📊 **Real-Time Analytics & Monitoring**:
  - Interactive dashboards with latency graphs, throughput metrics (RPS), status code distributions, and error tracking.
  - Per-API and per-key usage telemetry.
- 🛡️ **Defensive Hardening**:
  - Strict Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), XSS protection, and frame-ancestors blocking via Helmet.
  - Granular rate limiting per IP, per user, and per API key.
  - Account lockout protection against brute-force attacks.
- ⚙️ **Self-Healing Database & Graceful Fallbacks**:
  - Automatic idempotent database schema migrations on startup.
  - Graceful Redis fail-open fallback ensuring uptime even if the cache layer is down.

---

## 🏗️ Architecture Overview

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

## 📂 Project Structure

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
│   ├── utils/                  # Cryptographic utilities (SHA-256), logger, email
│   ├── index.js                # Server entry point & graceful shutdown
│   └── package.json
├── docker-compose.yml          # Multi-container orchestration (DB, Redis, Server, Client)
├── .gitignore                  # Strict anti-leak protection rules
├── package.json                # Root automation scripts
└── README.md
```

---

## 🚀 Quick Start Guide

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

- 🌐 **Frontend UI**: [http://localhost:3000](http://localhost:3000)
- 🔌 **Backend API**: [http://localhost:5000](http://localhost:5000)
- 📖 **Interactive API Docs (Swagger)**: [http://localhost:5000/api/docs](http://localhost:5000/api/docs)
- 💓 **Health Check**: [http://localhost:5000/health](http://localhost:5000/health)

---

## 🐳 Docker Deployment

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

## 🛡️ Anti-Leak & Security Guidelines

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

## 📜 Available NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts server (`nodemon`) and client (`react-scripts`) concurrently |
| `npm run server:dev` | Starts backend API server with hot-reload |
| `npm run client:dev` | Starts React frontend development server |
| `npm run install:all`| Installs all dependencies across root, server, and client |
| `npm run build` | Builds optimized React production bundle in `client/build` |
| `npm test` | Runs both backend Jest tests and client test suite |
| `npm run docker:up` | Starts all Docker containers via `docker-compose` |
| `npm run docker:down`| Tears down all Docker containers and networks |

---

## 📄 License
This project is licensed under the **MIT License**.

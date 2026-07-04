# API Guardian: Developer's Personal Access & Security Hub

**API Guardian** is a secure, centralized portal designed for individual developers and teams to manage API consumer access. It takes the complexity out of API security by allowing you to easily generate, distribute, and rotate secure API keys, enforce fine-grained access control (permissions), set custom rate limits, and monitor usage analytics in real-time.

---

## Key Features

* **Centralized API Registry**: Register your backend API projects and endpoints, configuring global authentication rules and access modes.
* **Granular Access Control**: Issue custom API keys mapped to specific user permissions (e.g. `read`, `write`, `delete`, `admin`).
* **Robust Rate Limiting**: Configure custom limits (requests per minute/hour) both globally for the API and individually per key to prevent abuse.
* **Real-time Monitoring & Analytics**: Visualize usage statistics, latency, success rates, and identify error logs or suspicious traffic pattern trends immediately.
* **Key Revocation & Rotation**: Effortlessly rotate compromised keys or block access with instant revocation.
* **Interactive Developer Documentation**: Auto-generated documentation for consumers detailing endpoints and authorization headers.
* **Audit Trail**: Security-focused audit logging of all developer actions (key generation, API edits, login events).

---

## Tech Stack

* **Frontend**: React (v18), Material-UI (MUI v5), Chart.js / Recharts, Axios
* **Backend**: Node.js, Express, PostgreSQL, Redis (Caching & Rate Limiting)
* **Infrastructure**: Nginx, Docker & Docker Compose

---

## Project Structure

```text
├── client/          # React Single Page Application (UI)
├── server/          # Express API Gateway and Authentication server
├── nginx/           # Reverse proxy configuration
├── docker-compose.yml
└── README.md
```

---

## Getting Started

### Prerequisites

Ensure you have the following installed:
* [Node.js](https://nodejs.org/) (v16+ recommended)
* [PostgreSQL](https://www.postgresql.org/)
* [Redis](https://redis.io/) (or a Redis Windows port / Memurai)

---

### Step 1: Clone and Install Dependencies

Install root, client, and server dependencies concurrently using the root package scripts:

```bash
# Install all dependencies across the project
npm run install-all
```

---

### Step 2: Database Initialization

1. Create a new PostgreSQL database (e.g., `api_guardian`).
2. Run the initialization script located in [server/database/init.sql](server/database/init.sql) to generate the schema, tables, indexes, and triggers:

```bash
psql -U your_username -d api_guardian -f server/database/init.sql
```

---

### Step 3: Configure Environment Variables

Create `.env` files for both the frontend and backend using the templates provided.

#### Backend (`server/.env`):
Duplicate `server/.env.example` to `server/.env` and update the connection values:
```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=api_guardian
DB_USER=postgres
DB_PASSWORD=your_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Email Configuration (Optional, for Password Resets)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=noreply@api-guardian.com
FROM_NAME=API Guardian
```

#### Frontend (`client/.env`):
Create a `client/.env` file:
```env
REACT_APP_API_URL=http://localhost:5000
```

---

### Step 4: Run the Application Locally

Start both the React client and Express server concurrently in development mode:

```bash
npm run dev
```

* The frontend will be available at: **`http://localhost:3000`**
* The backend API server will run at: **`http://localhost:5000`**

---

## Docker Deployment

To launch the entire stack (React, Express, Nginx, PostgreSQL, and Redis) using Docker:

```bash
# Build and run containers
docker-compose up --build
```

---

## Security Best Practices Implemented

* **Secure Key Hashing**: Plaintext API keys are never stored in the database. Instead, only SHA-256 hashes are stored, preventing key compromise in the event of database leaks.
* **IP Whitelisting**: Lock down API keys to specific IP addresses.
* **Audit Logging**: Comprehensive logging of administrative changes.
* **JWT Access & Refresh Rotation**: Stateless token verification with secure refresh rotation.

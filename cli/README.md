# @api-guardian/cli

Zero-dependency command-line tool for the API Guardian gateway. Manage APIs,
API keys, organizations and the audit trail without opening the dashboard.

```bash
npm install -g @api-guardian/cli
guardian help
```

## Setup

```bash
guardian login --email you@example.com --password '...'
# or, for CI:
export GUARDIAN_BASE_URL=https://gw.example.com
export GUARDIAN_TOKEN=<access-token>
```

## Commands

| Command | Description |
|---|---|
| `guardian apis list` | List registered APIs |
| `guardian apis create --name <n> --base-url <u>` | Register an upstream API |
| `guardian keys list` | List API keys |
| `guardian keys create --api-id <id> --name <n>` | Create a key (printed once) |
| `guardian keys rotate <key-id> [--grace <min>]` | Rotate a key (optional grace period) |
| `guardian orgs list` | List organizations with your role |
| `guardian orgs create --name <n>` | Create an organization |
| `guardian audit [--action <a>] [--limit <n>]` | Query the immutable audit trail (admin) |
| `guardian proxy <userId> <apiId> [path]` | Test an API key through the gateway |

## Environment

| Variable | Purpose |
|---|---|
| `GUARDIAN_BASE_URL` | Gateway origin (default `http://localhost:5000`) |
| `GUARDIAN_TOKEN` | Access token (overrides stored login) |
| `GUARDIAN_API_KEY` | API key used by `guardian proxy` |

## Tests

```bash
node --test test/
```

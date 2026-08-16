#!/usr/bin/env node
/**
 * API Guardian CLI — zero-dependency management tool.
 *
 *   guardian login                      # store credentials (token) locally
 *   guardian apis list
 *   guardian apis create --name X --base-url https://... 
 *   guardian keys list
 *   guardian keys create --api-id <id> --name X
 *   guardian keys rotate <key-id> [--grace 5]
 *   guardian orgs list
 *   guardian audit --action API_CREATED
 *
 * Environment:
 *   GUARDIAN_BASE_URL   gateway origin (default http://localhost:5000)
 *   GUARDIAN_TOKEN      access token (or run `guardian login`)
 *   GUARDIAN_API_KEY    API key for proxy/test commands
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_URL = (process.env.GUARDIAN_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const CONFIG_PATH = path.join(os.homedir(), '.guardian', 'config.json');

// ---------------------------------------------------------------------------
// Config persistence (token stored with 0600 perms)
// ---------------------------------------------------------------------------

const loadConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
};

const saveConfig = (cfg) => {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
};

const getToken = () => process.env.GUARDIAN_TOKEN || loadConfig().token || null;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const request = async (method, urlPath, body) => {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} -> ${res.status}: ${(json && json.message) || 'request failed'}`);
  }
  return json;
};

const pretty = (value) => {
  if (value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

const commands = {
  login: async (args) => {
    const email = args.email || process.env.GUARDIAN_EMAIL;
    const password = args.password || process.env.GUARDIAN_PASSWORD;
    if (!email || !password) {
      throw new Error('login requires --email and --password (or GUARDIAN_EMAIL / GUARDIAN_PASSWORD)');
    }
    const res = await request('POST', '/api/auth/login', { email, password });
    const tokens = res.data.tokens;
    saveConfig({ token: tokens.accessToken, refreshToken: tokens.refreshToken, email });
    console.log('Logged in. Token stored in ~/.guardian/config.json');
  },

  'apis:list': async () => {
    const res = await request('GET', '/api/apis');
    const apis = res.data.apis || [];
    for (const api of apis) {
      console.log(`${api.id}\t${api.status}\t${api.name}\t${api.baseUrl}`);
    }
    if (apis.length === 0) console.log('No APIs registered.');
  },

  'apis:create': async (args) => {
    if (!args.name || !args['base-url']) {
      throw new Error('apis create requires --name and --base-url');
    }
    const res = await request('POST', '/api/apis', {
      name: args.name,
      baseUrl: args['base-url'],
      version: args.version || '1.0.0'
    });
    console.log(`Created API ${res.data.api.id}`);
  },

  'keys:list': async () => {
    const res = await request('GET', '/api/keys');
    const keys = res.data.keys || [];
    for (const key of keys) {
      console.log(`${key.id}\t${key.status}\t${key.name}\tapi=${key.apiName}`);
    }
    if (keys.length === 0) console.log('No API keys.');
  },

  'keys:create': async (args) => {
    if (!args['api-id'] || !args.name) {
      throw new Error('keys create requires --api-id and --name');
    }
    const res = await request('POST', '/api/keys', {
      apiId: args['api-id'],
      name: args.name,
      rateLimit: parseInt(args['rate-limit'], 10) || 1000,
      rateLimitWindow: parseInt(args['rate-limit-window'], 10) || 3600,
      burstLimit: parseInt(args['burst-limit'], 10) || 0,
      hourlyLimit: parseInt(args['hourly-limit'], 10) || 0,
      dailyLimit: parseInt(args['daily-limit'], 10) || 0
    });
    // Print the raw key ONCE — it is not retrievable again
    console.log('Created API key:');
    console.log(res.data.key.apiKey);
    console.log('(store this securely — it is shown only once)');
  },

  'keys:rotate': async (args) => {
    const keyId = args._[0];
    if (!keyId) throw new Error('keys rotate requires a key id as the first argument');
    const grace = parseInt(args.grace, 10) || 0;
    const res = await request('POST', `/api/keys/${keyId}/rotate`, {
      gracePeriodMinutes: grace
    });
    console.log('Rotated API key (old key' + (grace > 0 ? ` stays valid ${grace}min` : ' revoked immediately') + '):');
    console.log(res.data.key.apiKey);
  },

  'orgs:list': async () => {
    const res = await request('GET', '/api/orgs');
    const orgs = res.data.orgs || [];
    for (const org of orgs) {
      console.log(`${org.id}\t${org.role}\t${org.name}\t${org.memberCount} members`);
    }
    if (orgs.length === 0) console.log('No organizations.');
  },

  'orgs:create': async (args) => {
    if (!args.name) throw new Error('orgs create requires --name');
    const res = await request('POST', '/api/orgs', { name: args.name });
    console.log(`Created organization ${res.data.org.id}`);
  },

  audit: async (args) => {
    const params = new URLSearchParams();
    if (args.action) params.set('action', args.action);
    if (args['user-id']) params.set('userId', args['user-id']);
    if (args.limit) params.set('limit', args.limit);
    const qs = params.toString();
    const res = await request('GET', `/api/admin/audit-logs${qs ? '?' + qs : ''}`);
    for (const log of res.data.logs) {
      console.log(
        `${new Date(log.createdAt).toISOString()}\t${log.action}\t${log.resourceType}:${(log.resourceId || '-').slice(0, 8)}\t${log.ip}`
      );
    }
  },

  proxy: async (args) => {
    const apiKey = process.env.GUARDIAN_API_KEY || args['api-key'];
    if (!apiKey) throw new Error('proxy requires --api-key or GUARDIAN_API_KEY');
    const userId = args._[0];
    const apiId = args._[1];
    if (!userId || !apiId) throw new Error('proxy requires <userId> <apiId> [path]');
    const restPath = args._[2] || 'ping';
    const res = await fetch(`${BASE_URL}/proxy/${userId}/${apiId}/${restPath}`, {
      headers: { 'X-API-Key': apiKey }
    });
    console.log(`HTTP ${res.status}`);
    console.log(await res.text());
  },

  help: () => {
    console.log(`API Guardian CLI

Usage: guardian <command> [args]

Commands:
  login --email <e> --password <p>     Store credentials
  apis list                            List registered APIs
  apis create --name <n> --base-url <u>  Register an API
  keys list                            List API keys
  keys create --api-id <id> --name <n>  Create a key (prints it once)
  keys rotate <key-id> [--grace <min>]  Rotate a key
  orgs list / orgs create --name <n>   Manage organizations
  audit [--action <a>] [--limit <n>]   Query the audit trail (admin)
  proxy <userId> <apiId> [path]        Test a key through the proxy
  help                                 Show this help

Environment:
  GUARDIAN_BASE_URL  gateway origin (default ${BASE_URL})
  GUARDIAN_TOKEN     access token (overrides stored login)
  GUARDIAN_API_KEY   API key for 'proxy'
`);
  }
};

// ---------------------------------------------------------------------------
// Arg parsing + dispatch
// ---------------------------------------------------------------------------

const parseArgs = (argv) => {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      if (value !== true) i++;
      args[key] = value;
    } else {
      args._.push(arg);
    }
  }
  return args;
};

const main = async () => {
  const [command, sub, ...rest] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help') {
    commands.help();
    return;
  }
  const key = sub ? `${command}:${sub}` : command;
  const handler = commands[key] || commands[command];
  if (!handler) {
    throw new Error(`Unknown command '${command}'. Run 'guardian help'.`);
  }
  await handler(parseArgs(rest));
};

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

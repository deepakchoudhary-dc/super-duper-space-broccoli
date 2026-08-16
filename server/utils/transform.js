/**
 * Request/Response Transformation Engine
 * --------------------------------------
 * Per-API, config-driven rewriting of requests and responses as they pass
 * through the gateway (the "policy" layer Kong/Gravitee call transformations).
 *
 * transform_config shape (stored on the `apis` row, JSONB):
 * {
 *   "request": {
 *     "rewritePath": [ { "pattern": "^/v1/", "replacement": "/v2/" } ],
 *     "headers": [
 *       { "op": "set",    "name": "x-api-version", "value": "2.0" },
 *       { "op": "remove", "name": "x-internal" },
 *       { "op": "add",    "name": "x-source",      "value": "guardian" }
 *     ],
 *     "removeQuery": ["token", "secret"]
 *   },
 *   "response": {
 *     "headers": [
 *       { "op": "set",    "name": "x-powered-by", "value": "api-guardian" },
 *       { "op": "remove", "name": "x-internal-header" }
 *     ],
 *     "cors": { "allowOrigins": ["https://app.example.com"] }
 *   },
 *   "gzip": true
 * }
 *
 * All functions are pure — easy to unit test and safe to call per-request.
 */

const HEADER_OPS = new Set(['set', 'remove', 'add']);

/**
 * Validate a transform_config object. Returns { ok, errors[] }.
 */
const validateTransformConfig = (cfg) => {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return { ok: false, errors: ['transform config must be an object'] };
  }
  const errors = [];

  const validateHeaders = (rules, section) => {
    if (rules === undefined) return;
    if (!Array.isArray(rules)) {
      errors.push(`${section}.headers must be an array`);
      return;
    }
    for (const rule of rules) {
      if (!rule || typeof rule !== 'object' || !HEADER_OPS.has(rule.op) || !rule.name) {
        errors.push(`${section}.headers entries need { op: set|remove|add, name, value? }`);
      }
      if (rule.op !== 'remove' && (rule.value === undefined || rule.value === null)) {
        errors.push(`${section}.headers: set/add rules require a value`);
      }
    }
  };

  if (cfg.request) {
    if (cfg.request.rewritePath) {
      if (!Array.isArray(cfg.request.rewritePath)) {
        errors.push('request.rewritePath must be an array');
      } else {
        for (const rule of cfg.request.rewritePath) {
          try {
            new RegExp(rule.pattern);
          } catch (err) {
            errors.push(`request.rewritePath: invalid pattern "${rule.pattern}"`);
          }
          if (typeof rule.replacement !== 'string') {
            errors.push('request.rewritePath: each rule needs a string replacement');
          }
        }
      }
    }
    if (cfg.request.removeQuery && !Array.isArray(cfg.request.removeQuery)) {
      errors.push('request.removeQuery must be an array of parameter names');
    }
    validateHeaders(cfg.request.headers, 'request');
  }

  if (cfg.response) {
    validateHeaders(cfg.response.headers, 'response');
    if (cfg.response.cors && cfg.response.cors.allowOrigins !== undefined) {
      if (!Array.isArray(cfg.response.cors.allowOrigins)) {
        errors.push('response.cors.allowOrigins must be an array');
      }
    }
  }

  return { ok: errors.length === 0, errors };
};

/**
 * Rewrite a target path according to the configured rules.
 * @param {string} targetPath
 * @param {object} cfg transform_config
 * @returns {string}
 */
const rewriteTargetPath = (targetPath, cfg = {}) => {
  let path = targetPath || '';
  const rules = cfg.request && cfg.request.rewritePath;
  if (rules && Array.isArray(rules)) {
    for (const rule of rules) {
      try {
        path = path.replace(new RegExp(rule.pattern), rule.replacement);
      } catch (err) {
        // Invalid pattern — skip the rule, never break the request
      }
    }
  }
  return path;
};

/**
 * Strip configured query parameters from a query string.
 * @param {string} query e.g. 'a=1&token=xyz&b=2'
 * @returns {string}
 */
const stripQueryParams = (query, cfg = {}) => {
  if (!query) return query;
  const remove = cfg.request && cfg.request.removeQuery;
  if (!remove || !Array.isArray(remove) || remove.length === 0) return query;

  const keep = query.split('&').filter((pair) => {
    if (!pair) return false;
    const name = pair.split('=')[0];
    return !remove.includes(name);
  });
  return keep.join('&');
};

/**
 * Apply request header rules to a headers object (mutates and returns it).
 */
const applyRequestHeaderRules = (headers, cfg = {}) => {
  const rules = cfg.request && cfg.request.headers;
  if (!rules || !Array.isArray(rules)) return headers;
  for (const rule of rules) {
    const name = rule.name.toLowerCase();
    if (rule.op === 'set' || rule.op === 'add') {
      headers[name] = rule.value;
    } else if (rule.op === 'remove') {
      delete headers[name];
    }
  }
  return headers;
};

/**
 * Apply response header rules to a headers object (mutates and returns it).
 */
const applyResponseHeaderRules = (headers, cfg = {}) => {
  const rules = cfg.response && cfg.response.headers;
  if (!rules || !Array.isArray(rules)) return headers;
  for (const rule of rules) {
    const name = rule.name.toLowerCase();
    if (rule.op === 'set' || rule.op === 'add') {
      headers[name] = rule.value;
    } else if (rule.op === 'remove') {
      delete headers[name];
    }
  }
  return headers;
};

/**
 * Resolve the CORS allow-origin list for an API (falls back to '*').
 */
const corsAllowOrigins = (cfg = {}) => {
  const allow = cfg.response && cfg.response.cors && cfg.response.cors.allowOrigins;
  if (Array.isArray(allow) && allow.length > 0) return allow;
  return null;
};

/**
 * Should the gateway gzip the upstream response for this client?
 */
const shouldGzip = (cfg, req, responseHeaders) => {
  if (!cfg || cfg.gzip !== true) return false;
  if (responseHeaders['content-encoding']) return false;
  const accept = String(req.headers['accept-encoding'] || '').toLowerCase();
  return accept.includes('gzip');
};

module.exports = {
  validateTransformConfig,
  rewriteTargetPath,
  stripQueryParams,
  applyRequestHeaderRules,
  applyResponseHeaderRules,
  corsAllowOrigins,
  shouldGzip
};

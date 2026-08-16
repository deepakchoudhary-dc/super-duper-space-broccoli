/**
 * Lightweight WAF (Web Application Firewall) middleware.
 *
 * Detects common attack payloads before they reach route handlers or are
 * forwarded upstream:
 *  - SQL injection (UNION SELECT, OR 1=1, stacked queries, comments)
 *  - Cross-site scripting (<script>, javascript:, onerror=...)
 *  - Path traversal (../, %2e%2e, absolute paths)
 *  - Command injection (; rm -rf, $(...), backticks, | sh)
 *  - NoSQL injection operators ($where, $gt, $ne ...) in JSON bodies
 *
 * Design notes:
 *  - Runs on the proxy path AND protected API paths.
 *  - Cheap regex scans over decoded query/body; intentionally conservative
 *    (false positives are logged, not silently dropped) — operators can tune
 *    the severity via WAF_ENABLED.
 *  - Blocked requests get a generic 400 with a security audit event.
 */

const logger = require('./logger');
const config = require('../config/env');

// Regex library — grouped by category for audit clarity
const PATTERNS = [
  {
    category: 'SQL Injection',
    severity: 'high',
    re: /(\bunion\b[\s\S]*\bselect\b)|(\bor\b[\s\S]*\b=\s*\b\d+\s*$)|(--\s)|(\/\*.*\*\/)|(\bselect\b[\s\S]*\bfrom\b)|(\binsert\b[\s\S]*\binto\b)|(\bupdate\b[\s\S]*\bset\b)|(\bdelete\b[\s\S]*\bfrom\b)|(\bdrop\b\s+\btable\b)|(;\s*\bdrop\b)|(\bexec\b\s*\(|\bexecute\b\s*\()|(information_schema)|(pg_sleep)|(sleep\s*\()|(benchmark\s*\()/i
  },
  {
    category: 'XSS',
    severity: 'high',
    re: /<script[\s>]|<\/script>|javascript\s*:|onerror\s*=|onload\s*=|onclick\s*=|onmouseover\s*=|<iframe[\s>]|<object[\s>]|<embed[\s>]|document\.cookie|eval\s*\(|fromCharCode\s*\(/i
  },
  {
    category: 'Path Traversal',
    severity: 'high',
    re: /(\.\.\/|\.\.\\)|(%2e%2e%2f|%252e%252e%252f)|(\.\.%2f)|(%2e%2e\/)|(\/etc\/passwd)|(\.\.\/\.\.\/)/i
  },
  {
    category: 'Command Injection',
    severity: 'critical',
    re: /(;\s*(rm|cat|wget|curl|sh|bash|nc|python|perl)\b)|(\$\([^)]*\))|(`[^`]*`)|(\|\s*(sh|bash|nc)\b)|(\brm\s+-rf\b)|(\bwget\s+http)|(\bcurl\s+http)/i
  },
  {
    category: 'NoSQL Injection',
    severity: 'high',
    re: /(\$where\b)|(\$gt\b)|(\$ne\b)|(\$lt\b)|(\$regex\b)|(\$exists\b)|(\$nin\b)/i
  },
  {
    category: 'Sensitive Data Exposure',
    severity: 'medium',
    re: /(api[_-]?key\s*[:=]\s*['"]?[a-z0-9_-]{16,})|(password\s*[:=]\s*['"]?[^'"\s]{8,})|(secret\s*[:=]\s*['"]?[^'"\s]{8,})/i
  }
];

/**
 * Scan a string for attack patterns.
 * @returns {null|{category: string, severity: string}}
 */
const scan = (input) => {
  if (!input || typeof input !== 'string' || input.length === 0) return null;
  // Cap scan length to bound CPU cost on huge payloads
  const chunk = input.slice(0, 100000);
  for (const pattern of PATTERNS) {
    if (pattern.re.test(chunk)) {
      return { category: pattern.category, severity: pattern.severity };
    }
  }
  return null;
};

/**
 * Collect all attacker-controllable strings from a request.
 */
const collectInputs = (req) => {
  const parts = [];
  if (req.url) parts.push(decodeURIComponent(req.url));
  if (req.query && typeof req.query === 'object') {
    for (const v of Object.values(req.query)) {
      if (typeof v === 'string') parts.push(v);
      else if (v && typeof v === 'object') parts.push(JSON.stringify(v));
    }
  }
  if (req.body && typeof req.body === 'object') {
    parts.push(JSON.stringify(req.body));
  }
  return parts;
};

/**
 * WAF middleware — attach to routes that must be protected.
 */
const wafMiddleware = (req, res, next) => {
  if (!config.security.wafEnabled) return next();

  // Skip health/metrics/docs endpoints (no attacker-controlled data, low value)
  if (
    req.path === '/health' ||
    req.path === config.observability.metricsPath ||
    req.path.startsWith('/api/docs') ||
    req.path === '/proxy/health'
  ) {
    return next();
  }

  const inputs = collectInputs(req);
  for (const input of inputs) {
    const hit = scan(input);
    if (hit) {
      logger.logSecurityEvent('WAF_BLOCKED', {
        category: hit.category,
        severity: hit.severity,
        ip: req.ip,
        path: req.originalUrl,
        method: req.method,
        requestId: req.requestId
      });

      if (req.apiKey) {
        // Count blocked requests against the key via metrics
        require('./metrics').incrementCounter('gateway_waf_blocked_total', {
          category: hit.category
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Request blocked by security policy',
        reason: hit.category
      });
    }
  }

  next();
};

module.exports = { wafMiddleware, scan, PATTERNS };

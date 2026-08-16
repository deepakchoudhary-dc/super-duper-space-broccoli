/**
 * Prometheus Metrics Registry
 * ---------------------------
 * Exposes a /metrics endpoint scrapable by Prometheus/Grafana.
 *
 * Metrics provided:
 *  - http_requests_total{method,path,status}       — gateway request counter
 *  - http_request_duration_seconds{method,path}    — latency histogram
 *  - gateway_rate_limit_exceeded_total{key_id}     — 429 counter
 *  - gateway_waf_blocked_total{category}           — WAF block counter
 *  - gateway_upstream_failures_total{api_id}       — upstream error counter
 *  - gateway_active_connections                    — gauge (concurrent in-flight)
 *  - gateway_circuit_breaker_state{api_id}         — 1 = closed, 0 = open
 *  - gateway_redis_available                       — 1/0
 *  - gateway_memory_bytes / gateway_uptime_seconds — process metrics
 */

const client = require('prom-client');
const config = require('../config/env');

const enabled = config.observability.metricsEnabled;

// ---------------------------------------------------------------------------
// Registry & default metrics
// ---------------------------------------------------------------------------
const registry = new client.Registry();
if (enabled) {
  client.collectDefaultMetrics({ register: registry, prefix: 'gateway_node_' });
}

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const httpRequestsTotal = enabled
  ? new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests handled by the gateway',
      labelNames: ['method', 'path', 'status'],
      registers: [registry]
    })
  : null;

const httpRequestDuration = enabled
  ? new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds',
      labelNames: ['method', 'path'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry]
    })
  : null;

const rateLimitExceeded = enabled
  ? new client.Counter({
      name: 'gateway_rate_limit_exceeded_total',
      help: 'Requests rejected by rate limiting',
      labelNames: ['key_id', 'tier'],
      registers: [registry]
    })
  : null;

const wafBlocked = enabled
  ? new client.Counter({
      name: 'gateway_waf_blocked_total',
      help: 'Requests blocked by the WAF',
      labelNames: ['category'],
      registers: [registry]
    })
  : null;

const upstreamFailures = enabled
  ? new client.Counter({
      name: 'gateway_upstream_failures_total',
      help: 'Upstream connection/response failures',
      labelNames: ['api_id'],
      registers: [registry]
    })
  : null;

const activeConnections = enabled
  ? new client.Gauge({
      name: 'gateway_active_connections',
      help: 'Number of requests currently being processed',
      registers: [registry]
    })
  : null;

const circuitBreakerState = enabled
  ? new client.Gauge({
      name: 'gateway_circuit_breaker_state',
      help: 'Circuit breaker state per upstream (1 = closed, 0 = open)',
      labelNames: ['api_id'],
      registers: [registry]
    })
  : null;

const redisAvailableGauge = enabled
  ? new client.Gauge({
      name: 'gateway_redis_available',
      help: 'Whether Redis is connected (1 = yes, 0 = no)',
      registers: [registry]
    })
  : null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const observeHttp = (req, res, durationMs) => {
  if (!enabled) return;
  const path = req.route ? req.route.path : (req.baseUrl + (req.path || req.url || 'unknown'));
  const labelPath = (path || 'unknown').replace(/:([^/]+)/g, ':$1').slice(0, 100);
  const status = String(res.statusCode || 500);
  httpRequestsTotal.inc({ method: req.method, path: labelPath, status });
  httpRequestDuration.observe({ method: req.method, path: labelPath }, durationMs / 1000);
};

const incrementRateLimitExceeded = (keyId, tier) => {
  if (!enabled) return;
  rateLimitExceeded.inc({ key_id: keyId || 'unknown', tier: tier || 'default' });
};

const incrementCounter = (name, labels = {}) => {
  if (!enabled) return;
  switch (name) {
    case 'gateway_waf_blocked_total':
      wafBlocked.inc(labels);
      break;
    case 'gateway_upstream_failures_total':
      upstreamFailures.inc(labels);
      break;
    default:
      break;
  }
};

const setActiveConnections = (count) => {
  if (!enabled) return;
  activeConnections.set(count);
};

const setCircuitBreakerState = (apiId, closed) => {
  if (!enabled) return;
  circuitBreakerState.set({ api_id: apiId }, closed ? 1 : 0);
};

const setRedisAvailable = (available) => {
  if (!enabled) return;
  redisAvailableGauge.set(available ? 1 : 0);
};

const getMetrics = async () => {
  if (!enabled) return '';
  return registry.metrics();
};

const getContentType = () => {
  if (!enabled) return 'text/plain';
  return registry.contentType;
};

module.exports = {
  enabled,
  observeHttp,
  incrementRateLimitExceeded,
  incrementCounter,
  setActiveConnections,
  setCircuitBreakerState,
  setRedisAvailable,
  getMetrics,
  getContentType
};

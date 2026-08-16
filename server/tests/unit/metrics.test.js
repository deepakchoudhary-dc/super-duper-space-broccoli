/**
 * Unit tests for the Prometheus metrics registry (utils/metrics.js).
 *
 * Asserts the exposition text exposes every metric family and that
 * recorded values carry the correct labels.
 */

const metrics = require('../../utils/metrics');

describe('prometheus metrics registry', () => {
  test('is enabled and exposes all core metric families', async () => {
    expect(metrics.enabled).toBe(true);
    const text = await metrics.getMetrics();

    expect(text).toContain('http_requests_total');
    expect(text).toContain('http_request_duration_seconds');
    expect(text).toContain('gateway_rate_limit_exceeded_total');
    expect(text).toContain('gateway_waf_blocked_total');
    expect(text).toContain('gateway_upstream_failures_total');
    expect(text).toContain('gateway_active_connections');
    expect(text).toContain('gateway_circuit_breaker_state');
    expect(text).toContain('gateway_redis_available');
  });

  test('records rate-limit rejections with key and tier labels', async () => {
    metrics.incrementRateLimitExceeded('key-1', 'burst');
    const text = await metrics.getMetrics();

    expect(text).toMatch(/gateway_rate_limit_exceeded_total\{key_id="key-1",tier="burst"\} 1/);
  });

  test('records circuit breaker state (1 = closed, 0 = open)', async () => {
    metrics.setCircuitBreakerState('api-1', false);
    const text = await metrics.getMetrics();

    expect(text).toMatch(/gateway_circuit_breaker_state\{api_id="api-1"\} 0/);

    metrics.setCircuitBreakerState('api-1', true);
    const after = await metrics.getMetrics();
    expect(after).toMatch(/gateway_circuit_breaker_state\{api_id="api-1"\} 1/);
  });

  test('records redis availability', async () => {
    metrics.setRedisAvailable(true);
    const text = await metrics.getMetrics();

    expect(text).toMatch(/gateway_redis_available 1/);
  });

  test('observeHttp records request counters and latency histograms', async () => {
    const req = { method: 'GET', baseUrl: '', path: '/test', route: undefined, url: '/test' };
    const res = { statusCode: 200 };

    metrics.observeHttp(req, res, 100);

    const text = await metrics.getMetrics();
    expect(text).toMatch(/http_requests_total\{method="GET",path="\/test",status="200"\} 1/);
    expect(text).toMatch(/http_request_duration_seconds_count\{method="GET",path="\/test"\} 1/);
  });

  test('incrementCounter routes WAF blocks and upstream failures', async () => {
    metrics.incrementCounter('gateway_waf_blocked_total', { category: 'XSS' });
    metrics.incrementCounter('gateway_upstream_failures_total', { api_id: 'api-9' });

    const text = await metrics.getMetrics();
    expect(text).toMatch(/gateway_waf_blocked_total\{category="XSS"\} 1/);
    expect(text).toMatch(/gateway_upstream_failures_total\{api_id="api-9"\} 1/);
  });

  test('unknown counter names are ignored safely', async () => {
    expect(() => metrics.incrementCounter('not_a_real_metric')).not.toThrow();
  });
});

/**
 * Unit tests for the OpenTelemetry tracing wrapper.
 *
 * The wrapper is deliberately safe-by-default: with OTEL_ENABLED unset/false
 * every helper must be a no-op and must never throw, and the SDK must not be
 * loaded (initTracing returns { enabled: false }).
 */

const tracing = require('../../utils/tracing');

describe('tracing (disabled by default)', () => {
  beforeEach(() => {
    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_SERVICE_NAME;
    jest.resetModules();
  });

  test('initTracing returns enabled:false without OTEL_ENABLED', async () => {
    const result = await tracing.initTracing();
    expect(result.enabled).toBe(false);
  });

  test('withSpan executes the callback even when disabled', async () => {
    let called = false;
    const result = await tracing.withSpan('test.span', { foo: 'bar' }, (span) => {
      called = true;
      expect(span).toBeUndefined();
      return 42;
    });
    expect(called).toBe(true);
    expect(result).toBe(42);
  });

  test('withSpan propagates errors when disabled', async () => {
    await expect(
      tracing.withSpan('test.span', {}, () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });

  test('recordEvent / injectTraceHeaders / extractContextFromHeaders are safe no-ops when disabled', () => {
    expect(() => tracing.recordEvent('evt', { a: 1 })).not.toThrow();
    expect(tracing.injectTraceHeaders()).toEqual({});
    expect(tracing.extractContextFromHeaders({ traceparent: '00-abc-def-01' })).toBeDefined();
  });

  test('withContext runs the function when disabled', () => {
    const out = tracing.withContext(undefined, () => 'ran');
    expect(out).toBe('ran');
  });

  test('isEnabled is false when disabled', () => {
    expect(tracing.isEnabled()).toBe(false);
  });
});

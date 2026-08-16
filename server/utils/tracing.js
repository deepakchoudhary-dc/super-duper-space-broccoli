/**
 * OpenTelemetry Tracing
 * ---------------------
 * Full OTel support behind the OTEL_ENABLED flag:
 *
 *   OTEL_ENABLED=true
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318   (default http://localhost:4318)
 *   OTEL_SERVICE_NAME=api-guardian                            (default api-guardian)
 *
 * When disabled (the default), every helper below is a safe no-op and the SDK
 * is never loaded — zero overhead. When enabled, the Node SDK is registered at
 * startup (index.js calls initTracing()) and spans are exported over OTLP/HTTP
 * to a collector (Jaeger, Grafana Tempo, SigNoz, ...).
 *
 * The gateway already propagates W3C trace context via the `traceparent`
 * header (see index.js), so upstream services can join the same trace. This
 * module additionally records application-level spans for proxy requests,
 * auth flows, WAF blocks and rate-limit rejections.
 */

const { trace, context, propagation, SpanStatusCode, ROOT_CONTEXT } = require('@opentelemetry/api');
const config = require('../config/env');

let initialized = false;
let initError = null;

/**
 * Register the OTel SDK with an OTLP/HTTP trace exporter.
 * Safe to call multiple times (idempotent). Never throws — failures degrade
 * to the no-op API so a broken collector cannot take the gateway down.
 */
const initTracing = async () => {
  if (initialized) return { enabled: config.otel.enabled };
  initialized = true;

  // Full OTel is opt-in via OTEL_ENABLED=true; TRACE_ENABLED keeps the legacy
  // header-propagation behavior. Without the opt-in we never load the SDK.
  if (!config.otel.enabled) {
    return { enabled: false };
  }

  try {
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    // Modern @opentelemetry/resources (2.x) exposes resourceFromAttributes
    // instead of the old `new Resource()` constructor.
    const { resourceFromAttributes } = require('@opentelemetry/resources');
    const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'api-guardian',
        [SEMRESATTRS_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0'
      }),
      traceExporter: new OTLPTraceExporter({
        url:
          process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
          process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
          'http://localhost:4318/v1/traces'
      })
      // NodeSDK wraps the exporter in a BatchSpanProcessor automatically,
      // so spans flush in batches instead of one request per span.
    });

    sdk.start();
    // Keep a handle for clean shutdown on SIGTERM/SIGINT
    if (typeof sdk.shutdown === 'function') {
      process.once('beforeExit', () => {
        sdk.shutdown().catch(() => {});
      });
    }
    return { enabled: true };
  } catch (err) {
    initError = err;
    return { enabled: false, error: err.message };
  }
};

const isEnabled = () => config.otel.enabled && initialized;

/**
 * Start a span under the current (or given) context and run `fn` inside it.
 * The span is ended automatically. Returns the fn result (or undefined if
 * tracing is disabled). Any error thrown re-throws after recording it on the
 * span and marking the span as errored.
 *
 *   await withSpan('proxy.request', { api_id: apiId }, async (span) => {
 *     span.setAttribute('http.status_code', 200);
 *   });
 */
const withSpan = async (name, attributes = {}, fn) => {
  if (!isEnabled()) return fn && fn(undefined);

  const tracer = trace.getTracer('api-guardian');
  return tracer.startActiveSpan(name, (span) => {
    try {
      for (const [key, value] of Object.entries(attributes || {})) {
        if (value !== undefined && value !== null) {
          span.setAttribute(key, String(value));
        }
      }
      const result = fn(span);
      return Promise.resolve(result).then(
        (value) => {
          span.end();
          return value;
        },
        (err) => {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          span.end();
          throw err;
        }
      );
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.end();
      throw err;
    }
  });
};

/**
 * Record an event on the current span (no-op when tracing is disabled).
 * Useful for WAF blocks, rate-limit rejections, cache HIT/MISS, etc.
 */
const recordEvent = (name, attributes = {}) => {
  if (!isEnabled()) return;
  const span = trace.getActiveSpan();
  if (!span) return;
  span.addEvent(name, attributes);
};

/**
 * Attach W3C trace context to an outgoing request (upstream proxying).
 * Returns the headers object to merge — or {} when disabled.
 */
const injectTraceHeaders = () => {
  if (!isEnabled()) return {};
  const headers = {};
  propagation.inject(context.active(), headers);
  return headers;
};

/**
 * Extract an incoming traceparent into the active context so the incoming
 * trace continues into spans created by this request.
 */
const extractContextFromHeaders = (headers = {}) => {
  if (!isEnabled() || !headers || typeof headers !== 'object') return ROOT_CONTEXT;
  const carrier = {
    traceparent: headers.traceparent || headers['traceparent'],
    tracestate: headers.tracestate || headers['tracestate']
  };
  return propagation.extract(ROOT_CONTEXT, carrier);
};

/**
 * Run `fn` with the given context active. Use together with
 * extractContextFromHeaders to continue inbound traces:
 *
 *   const ctx = extractContextFromHeaders(req.headers);
 *   await withContext(ctx, () => ...);
 */
const withContext = (ctx, fn) => {
  if (!ctx || ctx === ROOT_CONTEXT) return fn();
  return context.with(ctx, fn);
};

module.exports = {
  initTracing,
  withSpan,
  recordEvent,
  injectTraceHeaders,
  extractContextFromHeaders,
  withContext,
  isEnabled,
  getInitError: () => (initError ? initError.message : null)
};

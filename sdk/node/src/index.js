/**
 * API Guardian Node.js SDK
 * -------------------------
 * Thin, dependency-free client for calling upstream APIs through the gateway:
 *
 *   const { ApiGuardian } = require('@api-guardian/sdk');
 *
 *   const client = new ApiGuardian({
 *     baseUrl: 'https://api-guardian.example.com', // gateway origin
 *     apiKey:  'ag_live_...',
 *     userId:  '...',
 *     apiId:   '...'
 *   });
 *
 *   const data = await client.get('/users/42');
 *   await client.post('/users', { name: 'Ada' });
 *
 * Built-in behavior:
 *  - Automatic API-key auth (X-API-Key header)
 *  - Retry with exponential backoff on 429 (honoring Retry-After) and 5xx
 *  - JSON encoding/decoding
 *  - Typed errors (ApiGuardianError, RateLimitError, UpstreamError)
 *  - W3C traceparent propagation when a trace context is provided
 */

const DEFAULT_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 250;
// Upper bound on honoring Retry-After between attempts (seconds).
const MAX_RETRY_AFTER_SLEEP_SECONDS = 10;

class ApiGuardianError extends Error {
  constructor(message, { status, statusText, body, url } = {}) {
    super(message);
    this.name = 'ApiGuardianError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.url = url;
  }
}

class RateLimitError extends ApiGuardianError {
  constructor(message, { status, retryAfterSeconds, ...rest } = {}) {
    super(message, { status, ...rest });
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

class UpstreamError extends ApiGuardianError {
  constructor(message, opts = {}) {
    super(message, opts);
    this.name = 'UpstreamError';
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class ApiGuardian {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl  Gateway origin, e.g. https://gw.example.com
   * @param {string} opts.apiKey   API key (ag_...)
   * @param {string} opts.userId   Owner user id (from the dashboard)
   * @param {string} opts.apiId    Registered upstream API id
   * @param {number} [opts.retries=3]      Max retries on 429/5xx
   * @param {number} [opts.backoffMs=250]  Base exponential backoff
   * @param {number} [opts.timeoutMs=30000] Request timeout
   */
  constructor({ baseUrl, apiKey, userId, apiId, retries = DEFAULT_RETRIES, backoffMs = DEFAULT_BACKOFF_MS, timeoutMs = 30000 }) {
    if (!baseUrl || !apiKey || !userId || !apiId) {
      throw new Error('ApiGuardian requires baseUrl, apiKey, userId and apiId');
    }
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.userId = userId;
    this.apiId = apiId;
    this.retries = retries;
    this.backoffMs = backoffMs;
    this.timeoutMs = timeoutMs;
  }

  /** Build the gateway proxy URL for a path (must start with /). */
  _url(path) {
    if (!path.startsWith('/')) path = `/${path}`;
    return `${this.baseUrl}/proxy/${this.userId}/${this.apiId}${path}`;
  }

  /**
   * Perform a request against the proxy with retries.
   * @param {string} method HTTP method
   * @param {string} path   Path on the upstream, e.g. '/users'
   * @param {object} [body] JSON body (auto-encoded)
   * @param {object} [opts] { headers, timeoutMs, retries }
   */
  async request(method, path, body, opts = {}) {
    const url = this._url(path);
    const headers = {
      'X-API-Key': this.apiKey,
      Accept: 'application/json',
      ...(opts.headers || {})
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (opts.traceparent) {
      headers.traceparent = opts.traceparent;
    }

    const attempts = opts.retries ?? this.retries;
    let lastError;

    for (let attempt = 0; attempt <= attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.timeoutMs);

      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal
        });

        if (res.status === 429) {
          const retryAfterSeconds = parseInt(res.headers.get('retry-after'), 10) || 1;
          if (attempt < attempts) {
            // Cap the retry-after sleep: never let a single 429 pin a worker
            // for minutes when the client runs unattended.
            await sleep(Math.min(retryAfterSeconds, MAX_RETRY_AFTER_SLEEP_SECONDS) * 1000);
            continue;
          }
          throw new RateLimitError('Rate limit exceeded', {
            status: 429,
            retryAfterSeconds,
            url
          });
        }

        // Retry transient upstream/server errors
        if (res.status >= 500 && res.status < 600 && attempt < attempts) {
          const wait = this.backoffMs * 2 ** attempt;
          await sleep(wait);
          continue;
        }

        const text = await res.text();
        let json;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        if (!res.ok) {
          throw new ApiGuardianError(
            (json && json.message) || `Request failed with status ${res.status}`,
            { status: res.status, statusText: res.statusText, body: json, url }
          );
        }

        // Gateway envelope: { success, data } — unwrap `data`
        if (json && typeof json === 'object' && 'data' in json) {
          return json.data;
        }
        return json;
      } catch (err) {
        if (err instanceof ApiGuardianError) throw err;
        if (err.name === 'AbortError') {
          throw new UpstreamError('Request timed out', { url });
        }
        lastError = err;
        if (attempt < attempts) {
          await sleep(this.backoffMs * 2 ** attempt);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new UpstreamError(`Request failed: ${lastError ? lastError.message : 'unknown error'}`, { url });
  }

  get(path, opts) { return this.request('GET', path, undefined, opts); }
  post(path, body, opts) { return this.request('POST', path, body, opts); }
  put(path, body, opts) { return this.request('PUT', path, body, opts); }
  patch(path, body, opts) { return this.request('PATCH', path, body, opts); }
  delete(path, opts) { return this.request('DELETE', path, undefined, opts); }
}

module.exports = {
  ApiGuardian,
  ApiGuardianError,
  RateLimitError,
  UpstreamError
};

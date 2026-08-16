/**
 * Unit tests for server/utils/transform.js — the per-API transformation engine.
 */

const {
  validateTransformConfig,
  rewriteTargetPath,
  stripQueryParams,
  applyRequestHeaderRules,
  applyResponseHeaderRules,
  corsAllowOrigins,
  shouldGzip
} = require('../../utils/transform');

describe('transform engine', () => {
  describe('validateTransformConfig', () => {
    test('accepts a valid config', () => {
      const result = validateTransformConfig({
        request: {
          rewritePath: [{ pattern: '^/v1/', replacement: '/v2/' }],
          headers: [{ op: 'set', name: 'x-api-version', value: '2' }, { op: 'remove', name: 'x-internal' }],
          removeQuery: ['token']
        },
        response: {
          headers: [{ op: 'add', name: 'x-powered-by', value: 'guardian' }],
          cors: { allowOrigins: ['https://app.example.com'] }
        },
        gzip: true
      });
      expect(result.ok).toBe(true);
    });

    test('rejects non-object configs', () => {
      expect(validateTransformConfig(null).ok).toBe(false);
      expect(validateTransformConfig([]).ok).toBe(false);
    });

    test('rejects invalid regex patterns and header rules', () => {
      const result = validateTransformConfig({
        request: {
          rewritePath: [{ pattern: '([', replacement: 'x' }],
          headers: [{ op: 'remove' }]
        }
      });
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('rewriteTargetPath', () => {
    const cfg = { request: { rewritePath: [{ pattern: '^/v1/', replacement: '/v2/' }] } };

    test('rewrites matching paths', () => {
      expect(rewriteTargetPath('/v1/users', cfg)).toBe('/v2/users');
    });

    test('leaves non-matching paths untouched', () => {
      expect(rewriteTargetPath('/v2/users', cfg)).toBe('/v2/users');
    });

    test('tolerates invalid patterns without throwing', () => {
      const badCfg = { request: { rewritePath: [{ pattern: '([', replacement: 'x' }] } };
      expect(() => rewriteTargetPath('/anything', badCfg)).not.toThrow();
    });
  });

  describe('stripQueryParams', () => {
    const cfg = { request: { removeQuery: ['token', 'secret'] } };

    test('removes configured params', () => {
      expect(stripQueryParams('a=1&token=xyz&b=2&secret=s', cfg)).toBe('a=1&b=2');
    });

    test('returns the query unchanged when nothing matches', () => {
      expect(stripQueryParams('a=1&b=2', cfg)).toBe('a=1&b=2');
    });
  });

  describe('header rules', () => {
    test('applies request header set/add/remove rules', () => {
      const headers = { accept: 'application/json', 'x-internal': 'yes' };
      applyRequestHeaderRules(headers, {
        request: {
          headers: [
            { op: 'set', name: 'x-api-version', value: '2.0' },
            { op: 'remove', name: 'x-internal' },
            { op: 'add', name: 'x-source', value: 'guardian' }
          ]
        }
      });
      expect(headers).toEqual({ accept: 'application/json', 'x-api-version': '2.0', 'x-source': 'guardian' });
    });

    test('applies response header rules', () => {
      const headers = { 'x-internal-header': 'secret' };
      applyResponseHeaderRules(headers, {
        response: { headers: [{ op: 'remove', name: 'x-internal-header' }] }
      });
      expect(headers).toEqual({});
    });
  });

  describe('corsAllowOrigins', () => {
    test('returns null when no origins configured (falls back to *)', () => {
      expect(corsAllowOrigins({})).toBeNull();
    });

    test('returns the configured allowlist', () => {
      expect(corsAllowOrigins({ response: { cors: { allowOrigins: ['https://a.com'] } } }))
        .toEqual(['https://a.com']);
    });
  });

  describe('shouldGzip', () => {
    const gzipCfg = { gzip: true };

    test('true when the API opts in and the client accepts gzip', () => {
      const req = { headers: { 'accept-encoding': 'gzip, deflate' } };
      expect(shouldGzip(gzipCfg, req, {})).toBe(true);
    });

    test('false when the response is already encoded', () => {
      const req = { headers: { 'accept-encoding': 'gzip' } };
      expect(shouldGzip(gzipCfg, req, { 'content-encoding': 'gzip' })).toBe(false);
    });

    test('false when the client does not accept gzip', () => {
      const req = { headers: { 'accept-encoding': 'identity' } };
      expect(shouldGzip(gzipCfg, req, {})).toBe(false);
    });

    test('false when gzip is not enabled on the API', () => {
      const req = { headers: { 'accept-encoding': 'gzip' } };
      expect(shouldGzip({}, req, {})).toBe(false);
    });
  });
});

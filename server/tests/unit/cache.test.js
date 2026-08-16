/**
 * Unit tests for server/utils/cache.js — memory fallback path.
 * (The Redis path is exercised in CI integration tests with a real Redis.)
 */

jest.mock('../../config/redis', () => ({
  getRedisClient: () => null
}));

const {
  buildCacheKey,
  isCacheable,
  effectiveTtlSeconds,
  getResponseCache,
  setResponseCache,
  clearResponseCacheForKey
} = require('../../utils/cache');

describe('response cache', () => {
  beforeEach(async () => {
    await clearResponseCacheForKey('key-test');
    await clearResponseCacheForKey('key-other');
  });

  describe('buildCacheKey', () => {
    test('is deterministic and scoped per key', () => {
      expect(buildCacheKey('k1', 'GET', '/users', 'a=1'))
        .toBe(buildCacheKey('k1', 'GET', '/users', 'a=1'));
      expect(buildCacheKey('k1', 'GET', '/users', 'a=1'))
        .not.toBe(buildCacheKey('k2', 'GET', '/users', 'a=1'));
      expect(buildCacheKey('k1', 'GET', '/users', 'a=1'))
        .not.toBe(buildCacheKey('k1', 'POST', '/users', 'a=1'));
    });
  });

  describe('isCacheable', () => {
    test('caches plain 200 responses', () => {
      expect(isCacheable(200, { 'content-type': 'application/json' }, Buffer.from('{}'))).toBe(true);
    });

    test('never caches set-cookie responses', () => {
      expect(isCacheable(200, { 'set-cookie': ['a=b'] }, Buffer.from('{}'))).toBe(false);
    });

    test('never caches no-store responses', () => {
      expect(isCacheable(200, { 'cache-control': 'no-store' }, Buffer.from('{}'))).toBe(false);
      expect(isCacheable(200, { 'cache-control': 'private, max-age=60' }, Buffer.from('{}'))).toBe(false);
    });

    test('rejects non-2xx/3xx statuses', () => {
      expect(isCacheable(500, {}, Buffer.from('err'))).toBe(false);
    });
  });

  describe('effectiveTtlSeconds', () => {
    test('honors upstream max-age but caps at the configured TTL', () => {
      // config.caching.ttlSeconds defaults to 60
      expect(effectiveTtlSeconds({ 'cache-control': 'max-age=5' })).toBe(5);
      expect(effectiveTtlSeconds({ 'cache-control': 'max-age=3600' })).toBe(60);
      expect(effectiveTtlSeconds({})).toBe(60);
    });
  });

  describe('get/set/clear', () => {
    test('stores and serves a cached response with headers', async () => {
      await setResponseCache('key-test', 'GET', '/users', 'a=1', 200, { 'content-type': 'application/json' }, Buffer.from('{"hello":"world"}'));

      const entry = await getResponseCache('key-test', 'GET', '/users', 'a=1');
      expect(entry).not.toBeNull();
      expect(entry.statusCode).toBe(200);
      expect(entry.fromCache).toBe(true);
      expect(entry.body.toString()).toBe('{"hello":"world"}');
      expect(entry.headers['content-type']).toBe('application/json');
    });

    test('returns null for a miss', async () => {
      expect(await getResponseCache('key-test', 'GET', '/nope', '')).toBeNull();
    });

    test('is scoped by key, method and query', async () => {
      await setResponseCache('key-test', 'GET', '/users', 'a=1', 200, {}, Buffer.from('one'));
      expect(await getResponseCache('key-test', 'GET', '/users', 'b=2')).toBeNull();
      expect(await getResponseCache('key-other', 'GET', '/users', 'a=1')).toBeNull();
      expect(await getResponseCache('key-test', 'POST', '/users', 'a=1')).toBeNull();
    });

    test('does not cache uncacheable responses', async () => {
      await setResponseCache('key-test', 'GET', '/cookie', '', 200, { 'set-cookie': ['s=1'] }, Buffer.from('x'));
      expect(await getResponseCache('key-test', 'GET', '/cookie', '')).toBeNull();
    });

    test('clearResponseCacheForKey removes only that key entries', async () => {
      await setResponseCache('key-test', 'GET', '/a', '', 200, {}, Buffer.from('a'));
      await setResponseCache('key-other', 'GET', '/a', '', 200, {}, Buffer.from('a'));

      await clearResponseCacheForKey('key-test');

      expect(await getResponseCache('key-test', 'GET', '/a', '')).toBeNull();
      expect(await getResponseCache('key-other', 'GET', '/a', '')).not.toBeNull();
    });
  });
});

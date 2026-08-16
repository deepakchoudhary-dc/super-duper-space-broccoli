/**
 * Unit tests for server/utils/rateLimiter.js — in-memory fallback path.
 * (Redis path is exercised in CI integration tests with a real Redis.)
 */
const { checkRateLimit, resetRateLimit } = require('../../utils/rateLimiter');

// Force the in-memory path by making Redis appear unavailable.
jest.mock('../../config/redis', () => ({
  getRedisClient: () => null
}));

describe('rateLimiter (memory fallback)', () => {
  test('allows requests under the limit', async () => {
    const result = await checkRateLimit('test:key1', { limit: 3, window: 60 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  test('rejects once the limit is exceeded', async () => {
    await resetRateLimit('test:key2');
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit('test:key2', { limit: 3, window: 60 });
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkRateLimit('test:key2', { limit: 3, window: 60 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.tier).toBe('default');
  });

  test('enforces the burst tier (per-second) first', async () => {
    await resetRateLimit('test:key3');
    const opts = { limit: 100, window: 3600, burst: 2 };
    expect((await checkRateLimit('test:key3', opts)).allowed).toBe(true);
    expect((await checkRateLimit('test:key3', opts)).allowed).toBe(true);
    const blocked = await checkRateLimit('test:key3', opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.tier).toBe('burst');
  });

  test('different identifiers have independent counters', async () => {
    await resetRateLimit('test:key4');
    await resetRateLimit('test:key5');
    const opts = { limit: 1, window: 60 };
    expect((await checkRateLimit('test:key4', opts)).allowed).toBe(true);
    expect((await checkRateLimit('test:key4', opts)).allowed).toBe(false);
    expect((await checkRateLimit('test:key5', opts)).allowed).toBe(true);
  });

  test('resetRateLimit clears counters', async () => {
    await resetRateLimit('test:key6');
    const opts = { limit: 1, window: 60 };
    await checkRateLimit('test:key6', opts);
    expect((await checkRateLimit('test:key6', opts)).allowed).toBe(false);
    await resetRateLimit('test:key6');
    expect((await checkRateLimit('test:key6', opts)).allowed).toBe(true);
  });

  test('returns positive resetInSeconds', async () => {
    const result = await checkRateLimit('test:key7', { limit: 5, window: 60 });
    expect(result.resetInSeconds).toBeGreaterThanOrEqual(0);
    expect(result.resetInSeconds).toBeLessThanOrEqual(60);
  });
});

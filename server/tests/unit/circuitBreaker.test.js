/**
 * Unit tests for server/utils/circuitBreaker.js — state machine.
 */
const { CircuitBreaker } = require('../../utils/circuitBreaker');

jest.mock('../../utils/metrics', () => ({
  setCircuitBreakerState: jest.fn(),
  incrementCounter: jest.fn(),
  observeHttp: jest.fn(),
  incrementRateLimitExceeded: jest.fn(),
  setActiveConnections: jest.fn(),
  setRedisAvailable: jest.fn(),
  getMetrics: jest.fn().mockResolvedValue(''),
  getContentType: jest.fn().mockReturnValue('text/plain'),
  enabled: true
}));

describe('CircuitBreaker', () => {
  const makeBreaker = (overrides = {}) =>
    new CircuitBreaker({
      baseUrl: 'http://upstream.test',
      apiId: 'api-1',
      threshold: 3,
      cooldownMs: 100,
      healthPath: '/health',
      ...overrides
    });

  test('starts CLOSED and allows requests', () => {
    const cb = makeBreaker();
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.allowRequest()).toBe(true);
  });

  test('trips OPEN after threshold consecutive failures', () => {
    const cb = makeBreaker();
    cb.recordResult(false);
    cb.recordResult(false);
    expect(cb.getState()).toBe('CLOSED');
    cb.recordResult(false); // 3rd failure -> trip
    expect(cb.getState()).toBe('OPEN');
    expect(cb.allowRequest()).toBe(false);
  });

  test('recovers to HALF_OPEN after cooldown, then CLOSED on probe success', () => {
    const cb = makeBreaker({ cooldownMs: 1 });
    cb.recordResult(false);
    cb.recordResult(false);
    cb.recordResult(false);
    expect(cb.getState()).toBe('OPEN');

    // Wait past cooldown
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(cb.allowRequest()).toBe(true); // transitions to HALF_OPEN and allows probe
        expect(cb.getState()).toBe('HALF_OPEN');
        cb.recordResult(true);
        expect(cb.getState()).toBe('CLOSED');
        expect(cb.allowRequest()).toBe(true);
        resolve();
      }, 10);
    });
  });

  test('re-opens when a half-open probe fails', () => {
    const cb = makeBreaker({ cooldownMs: 1 });
    cb.recordResult(false);
    cb.recordResult(false);
    cb.recordResult(false);
    expect(cb.getState()).toBe('OPEN');

    return new Promise((resolve) => {
      setTimeout(() => {
        expect(cb.allowRequest()).toBe(true); // HALF_OPEN probe
        cb.recordResult(false);
        expect(cb.getState()).toBe('OPEN');
        expect(cb.allowRequest()).toBe(false);
        resolve();
      }, 10);
    });
  });

  test('a success resets the failure counter while CLOSED', () => {
    const cb = makeBreaker();
    cb.recordResult(false);
    cb.recordResult(false);
    cb.recordResult(true);
    cb.recordResult(false);
    cb.recordResult(false);
    expect(cb.getState()).toBe('CLOSED'); // counter was reset by success
  });

  test('destroy clears the health check timer', () => {
    const cb = makeBreaker();
    cb.startHealthCheck();
    expect(cb.healthCheckTimer).toBeTruthy();
    cb.destroy();
    expect(cb.healthCheckTimer).toBeNull();
  });
});

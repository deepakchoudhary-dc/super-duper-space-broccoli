/**
 * Unit tests for the alerting engine (utils/alerts.js).
 *
 * Covers:
 *  - Rate-limit alerts are cooldown-throttled per key.
 *  - Alerts fire again once the cooldown expires.
 *  - Alerts are skipped when the owner cannot be resolved.
 *  - Security alerts honor the user's emailOnSecurityAlert setting.
 *  - Security alerts are cooldown-throttled per subject + user.
 */

jest.mock('../../config/database', () => ({
  pool: { query: jest.fn() }
}));

jest.mock('../../utils/email', () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: 'test-msg', preview: 'https://preview' }),
  testEmailConfig: jest.fn().mockResolvedValue(true)
}));

const { pool } = require('../../config/database');
const { sendEmail } = require('../../utils/email');
const alerts = require('../../utils/alerts');

const OWNER_ROW = { email: 'owner@test.local', first_name: 'Owner' };
const API_ROW = { name: 'Test API' };

const keyData = {
  id: 'key-1',
  user_id: 'user-1',
  api_id: 'api-1',
  name: 'Key One',
  rate_limit: 5,
  rate_limit_window: 3600
};

describe('alerting engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    pool.query.mockImplementation(async (query) => {
      if (query.includes('FROM users')) return { rows: [OWNER_ROW] };
      if (query.includes('FROM apis')) return { rows: [API_ROW] };
      return { rows: [] };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('rate-limit alert sends a single email per cooldown window', async () => {
    await alerts.notifyRateLimitExceeded(keyData, 6);
    await alerts.notifyRateLimitExceeded(keyData, 9);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@test.local',
        template: 'rate-limit-exceeded',
        data: expect.objectContaining({
          apiName: 'Test API',
          keyName: 'Key One',
          currentUsage: 6,
          rateLimit: 5
        })
      })
    );
  });

  test('rate-limit alert fires again after the cooldown expires', async () => {
    // Unique key id: the cooldown map persists across tests and the fake clock
    // does not reset, so a fresh key isolates this test from prior throttling.
    const keyData2 = { ...keyData, id: 'key-2' };

    await alerts.notifyRateLimitExceeded(keyData2, 6);
    jest.advanceTimersByTime(15 * 60 * 1000 + 1);
    await alerts.notifyRateLimitExceeded(keyData2, 6);

    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  test('rate-limit alert is skipped when the owner cannot be resolved', async () => {
    pool.query.mockImplementationOnce(async () => ({ rows: [] }));

    await alerts.notifyRateLimitExceeded({ ...keyData, id: 'key-ghost' }, 6);

    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('security alert honors the user emailOnSecurityAlert setting', async () => {
    pool.query.mockImplementationOnce(async () => ({
      rows: [{
        email: 'quiet@test.local',
        first_name: 'Quiet',
        settings: { notifications: { emailOnSecurityAlert: false } }
      }]
    }));

    await alerts.notifySecurityAlert('user-quiet', 'WAF blocked a request', { category: 'XSS' });

    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('security alert is cooldown-throttled per subject and user', async () => {
    await alerts.notifySecurityAlert('user-a', 'WAF blocked a request', { category: 'XSS' });
    await alerts.notifySecurityAlert('user-a', 'WAF blocked a request', { category: 'SQL Injection' });
    await alerts.notifySecurityAlert('user-a', 'Upstream circuit opened', { apiId: 'api-1' });
    await alerts.notifySecurityAlert('user-b', 'WAF blocked a request', { category: 'XSS' });

    // user-a: WAF subject sent once (second throttled); circuit subject sent once.
    // user-b: WAF subject is a different user, so it sends.
    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'WAF blocked a request' })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Upstream circuit opened' })
    );
  });
});

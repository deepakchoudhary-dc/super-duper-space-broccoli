/**
 * Unit tests for server/utils/audit.js.
 */

jest.mock('../../config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn()
  }
}));

const { pool } = require('../../config/database');
const { audit, queryAuditLogs } = require('../../utils/audit');

describe('audit log', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('writes an audit row with actor, action, resource and details', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const req = { ip: '10.0.0.1', get: () => 'audit-test-agent' };

    await audit({
      userId: 'user-1',
      action: 'API_CREATED',
      resourceType: 'api',
      resourceId: 'api-1',
      details: { name: 'Test' },
      req
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining([
        'user-1',
        'API_CREATED',
        'api',
        'api-1',
        '{"name":"Test"}',
        '10.0.0.1',
        'audit-test-agent'
      ])
    );
  });

  test('never throws when the insert fails (audit must not break requests)', async () => {
    pool.query.mockRejectedValue(new Error('db down'));
    await expect(audit({ userId: 'u', action: 'X', resourceType: 'other' })).resolves.toBeUndefined();
  });

  test('queryAuditLogs builds filters and returns total', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'l1', action: 'SECURITY_WAF_BLOCK' }] })
      .mockResolvedValueOnce({ rows: [{ total: '42' }] });

    const result = await queryAuditLogs({ action: 'SECURITY_WAF_BLOCK', limit: 10, offset: 0 });

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(result.logs).toHaveLength(1);
    expect(result.total).toBe(42);
  });
});

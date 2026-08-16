/**
 * Unit tests for server/utils/orgs.js — role ranking and membership helpers.
 */

jest.mock('../../config/database', () => ({
  pool: { query: jest.fn() }
}));

const { pool } = require('../../config/database');
const { hasRole, getOrgMembership, getUserOrgIds } = require('../../utils/orgs');

describe('orgs helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hasRole', () => {
    test('ranks owner > admin > member', () => {
      expect(hasRole('owner', 'member')).toBe(true);
      expect(hasRole('admin', 'member')).toBe(true);
      expect(hasRole('member', 'admin')).toBe(false);
      expect(hasRole('member', 'owner')).toBe(false);
      expect(hasRole('owner', 'owner')).toBe(true);
    });

    test('rejects unknown roles', () => {
      expect(hasRole('superuser', 'member')).toBe(false);
    });
  });

  describe('getOrgMembership', () => {
    test('returns the role for a member', async () => {
      pool.query.mockResolvedValue({ rows: [{ role: 'admin' }] });
      expect(await getOrgMembership('org-1', 'user-1')).toEqual({ role: 'admin' });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('organization_members'),
        ['org-1', 'user-1']
      );
    });

    test('returns null for non-members', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await getOrgMembership('org-1', 'user-9')).toBeNull();
    });
  });

  describe('getUserOrgIds', () => {
    test('maps memberships to org ids', async () => {
      pool.query.mockResolvedValue({
        rows: [{ org_id: 'org-a', role: 'owner' }, { org_id: 'org-b', role: 'member' }]
      });
      expect(await getUserOrgIds('user-1')).toEqual(['org-a', 'org-b']);
    });
  });
});

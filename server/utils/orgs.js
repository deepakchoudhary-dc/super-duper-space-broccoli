/**
 * Multi-tenancy helpers
 * ---------------------
 * Organizations + membership roles (owner > admin > member). APIs can be
 * attached to an org; every org member can then view/use them. Role-gated
 * administration lives in routes/orgs.js; these helpers are shared by the
 * routes and by the scoping queries in apis.js / keys.js.
 */

const { pool } = require('../config/database');

const ROLE_RANK = { owner: 3, admin: 2, member: 1 };

/**
 * @returns {Promise<{org_id: string, role: string}[]>}
 */
const getUserOrgMemberships = async (userId) => {
  const result = await pool.query(
    'SELECT org_id, role FROM organization_members WHERE user_id = $1',
    [userId]
  );
  return result.rows;
};

/**
 * @returns {Promise<string[]>} ids of every org the user belongs to
 */
const getUserOrgIds = async (userId) => {
  const memberships = await getUserOrgMemberships(userId);
  return memberships.map((m) => m.org_id);
};

/**
 * @returns {Promise<{role: string}|null>} membership role for a user in an org
 */
const getOrgMembership = async (orgId, userId) => {
  const result = await pool.query(
    'SELECT role FROM organization_members WHERE org_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Whether a user can access an API (own it, or belong to its org).
 */
const canAccessApi = async (userId, apiId) => {
  const result = await pool.query(
    `SELECT a.user_id, a.org_id,
            EXISTS(SELECT 1 FROM organization_members om WHERE om.org_id = a.org_id AND om.user_id = $1) AS is_member
     FROM apis a WHERE a.id = $2`,
    [userId, apiId]
  );
  if (result.rows.length === 0) return false;
  const row = result.rows[0];
  if (row.user_id === userId) return true;
  return row.org_id !== null && row.is_member === true;
};

const hasRole = (role, minRole) => {
  const rank = ROLE_RANK[role] || 0;
  const min = ROLE_RANK[minRole] || 0;
  return rank >= min;
};

module.exports = {
  ROLE_RANK,
  getUserOrgMemberships,
  getUserOrgIds,
  getOrgMembership,
  canAccessApi,
  hasRole
};

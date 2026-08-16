const express = require('express');
const { body, validationResult, param } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const {
  getOrgMembership,
  getUserOrgMemberships,
  hasRole
} = require('../utils/orgs');
const { audit } = require('../utils/audit');
const logger = require('../utils/logger');

const router = express.Router();

const ROLE_NAMES = ['owner', 'admin', 'member'];

// Middleware: require membership in the org named by req.params.orgId
const requireOrgMember = async (req, res, next) => {
  try {
    const membership = await getOrgMembership(req.params.orgId, req.user.id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'You are not a member of this organization' });
    }
    req.orgRole = membership.role;
    next();
  } catch (error) {
    logger.error('Org membership check error:', error);
    res.status(500).json({ success: false, message: 'Membership check failed' });
  }
};

const requireOrgRole = (minRole) => (req, res, next) => {
  if (!hasRole(req.orgRole, minRole)) {
    return res.status(403).json({ success: false, message: `Requires ${minRole} role or higher` });
  }
  next();
};

/**
 * @openapi
 * /api/orgs:
 *   post:
 *     summary: Create an organization (creator becomes owner)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *     responses:
 *       201:
 *         description: Organization created
 */
router.post('/', authenticateToken, [
  body('name').trim().notEmpty().withMessage('Organization name is required').isLength({ min: 1, max: 255 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const client = await pool.connect();
    let org;
    try {
      await client.query('BEGIN');
      const orgResult = await client.query(
        'INSERT INTO organizations (name, owner_user_id) VALUES ($1, $2) RETURNING *',
        [req.body.name.trim(), req.user.id]
      );
      org = orgResult.rows[0];
      await client.query(
        'INSERT INTO organization_members (org_id, user_id, role) VALUES ($1, $2, $3)',
        [org.id, req.user.id, 'owner']
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(400).json({ success: false, message: 'An organization with this name already exists' });
      }
      throw err;
    } finally {
      client.release();
    }

    await audit({
      userId: req.user.id,
      action: 'ORG_CREATED',
      resourceType: 'org',
      resourceId: org.id,
      details: { name: org.name },
      req
    });

    res.status(201).json({ success: true, message: 'Organization created', data: { org } });
  } catch (error) {
    logger.error('Create org error:', error);
    res.status(500).json({ success: false, message: 'Failed to create organization' });
  }
});

/**
 * @openapi
 * /api/orgs:
 *   get:
 *     summary: List the user's organizations with their role
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of orgs
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const memberships = await getUserOrgMemberships(req.user.id);
    if (memberships.length === 0) {
      return res.json({ success: true, data: { orgs: [] } });
    }

    const orgIds = memberships.map((m) => m.org_id);
    const orgResult = await pool.query(
      `SELECT o.*, COUNT(om.user_id)::int AS member_count
       FROM organizations o
       JOIN organization_members om ON om.org_id = o.id
       WHERE o.id = ANY($1::uuid[])
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [orgIds]
    );
    const roleByOrg = Object.fromEntries(memberships.map((m) => [m.org_id, m.role]));

    res.json({
      success: true,
      data: {
        orgs: orgResult.rows.map((org) => ({
          id: org.id,
          name: org.name,
          role: roleByOrg[org.id],
          memberCount: org.member_count,
          createdAt: org.created_at
        }))
      }
    });
  } catch (error) {
    logger.error('List orgs error:', error);
    res.status(500).json({ success: false, message: 'Failed to list organizations' });
  }
});

/**
 * @openapi
 * /api/orgs/{orgId}:
 *   get:
 *     summary: Organization detail + member list (members only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Org detail
 */
router.get('/:orgId', authenticateToken, requireOrgMember, async (req, res) => {
  try {
    const orgResult = await pool.query('SELECT * FROM organizations WHERE id = $1', [req.params.orgId]);
    if (orgResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }
    const memberResult = await pool.query(
      `SELECT om.user_id, om.role, u.email, u.first_name, u.last_name, om.created_at
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.org_id = $1
       ORDER BY om.created_at ASC`,
      [req.params.orgId]
    );
    res.json({
      success: true,
      data: {
        org: orgResult.rows[0],
        members: memberResult.rows,
        yourRole: req.orgRole
      }
    });
  } catch (error) {
    logger.error('Get org error:', error);
    res.status(500).json({ success: false, message: 'Failed to load organization' });
  }
});

/**
 * @openapi
 * /api/orgs/{orgId}/members:
 *   post:
 *     summary: Add a member by email (owner/admin only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *               role: { type: string, enum: [admin, member], default: member }
 *     responses:
 *       201:
 *         description: Member added
 */
router.post('/:orgId/members', authenticateToken, requireOrgMember, requireOrgRole('admin'), [
  body('email').isEmail().withMessage('A valid email is required'),
  body('role').optional().isIn(['admin', 'member']).withMessage('Role must be admin or member')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const email = req.body.email.toLowerCase();
    const role = req.body.role || 'member';

    const userResult = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No registered user with that email' });
    }
    const targetUser = userResult.rows[0];

    const existing = await getOrgMembership(req.params.orgId, targetUser.id);
    if (existing) {
      return res.status(400).json({ success: false, message: 'User is already a member' });
    }

    await pool.query(
      'INSERT INTO organization_members (org_id, user_id, role) VALUES ($1, $2, $3)',
      [req.params.orgId, targetUser.id, role]
    );

    await audit({
      userId: req.user.id,
      action: 'ORG_MEMBER_ADDED',
      resourceType: 'org',
      resourceId: req.params.orgId,
      details: { targetUserId: targetUser.id, email, role },
      req
    });

    res.status(201).json({ success: true, message: 'Member added' });
  } catch (error) {
    logger.error('Add org member error:', error);
    res.status(500).json({ success: false, message: 'Failed to add member' });
  }
});

/**
 * @openapi
 * /api/orgs/{orgId}/members/{userId}:
 *   patch:
 *     summary: Change a member's role (owner/admin only; owner role is protected)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:orgId/members/:userId', authenticateToken, requireOrgMember, requireOrgRole('admin'), async (req, res) => {
  try {
    const { orgId, userId } = req.params;
    const role = req.body.role;
    if (!role || !ROLE_NAMES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be owner, admin or member' });
    }

    const targetMembership = await getOrgMembership(orgId, userId);
    if (!targetMembership) {
      return res.status(404).json({ success: false, message: 'User is not a member' });
    }
    if (targetMembership.role === 'owner') {
      return res.status(403).json({ success: false, message: 'The owner role cannot be changed' });
    }
    if (role === 'owner') {
      return res.status(400).json({ success: false, message: 'Ownership can only be transferred by the owner' });
    }

    await pool.query(
      'UPDATE organization_members SET role = $1 WHERE org_id = $2 AND user_id = $3',
      [role, orgId, userId]
    );

    await audit({
      userId: req.user.id,
      action: 'ORG_MEMBER_ROLE_CHANGED',
      resourceType: 'org',
      resourceId: orgId,
      details: { targetUserId: userId, role },
      req
    });

    res.json({ success: true, message: 'Role updated' });
  } catch (error) {
    logger.error('Change org member role error:', error);
    res.status(500).json({ success: false, message: 'Failed to update role' });
  }
});

/**
 * @openapi
 * /api/orgs/{orgId}/members/{userId}:
 *   delete:
 *     summary: Remove a member (owner/admin only; cannot remove the owner)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:orgId/members/:userId', authenticateToken, requireOrgMember, requireOrgRole('admin'), async (req, res) => {
  try {
    const { orgId, userId } = req.params;
    const targetMembership = await getOrgMembership(orgId, userId);
    if (!targetMembership) {
      return res.status(404).json({ success: false, message: 'User is not a member' });
    }
    if (targetMembership.role === 'owner') {
      return res.status(403).json({ success: false, message: 'The owner cannot be removed' });
    }

    await pool.query('DELETE FROM organization_members WHERE org_id = $1 AND user_id = $2', [orgId, userId]);

    await audit({
      userId: req.user.id,
      action: 'ORG_MEMBER_REMOVED',
      resourceType: 'org',
      resourceId: orgId,
      details: { targetUserId: userId },
      req
    });

    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    logger.error('Remove org member error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove member' });
  }
});

/**
 * @openapi
 * /api/orgs/{orgId}:
 *   delete:
 *     summary: Delete an organization (owner only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:orgId', authenticateToken, requireOrgMember, requireOrgRole('owner'), async (req, res) => {
  try {
    // Detach org APIs (org_id -> NULL) so they become personal resources
    await pool.query('UPDATE apis SET org_id = NULL WHERE org_id = $1', [req.params.orgId]);
    await pool.query('DELETE FROM organizations WHERE id = $1', [req.params.orgId]);

    await audit({
      userId: req.user.id,
      action: 'ORG_DELETED',
      resourceType: 'org',
      resourceId: req.params.orgId,
      req
    });

    res.json({ success: true, message: 'Organization deleted' });
  } catch (error) {
    logger.error('Delete org error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete organization' });
  }
});

module.exports = router;

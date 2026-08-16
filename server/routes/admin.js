const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { queryAuditLogs } = require('../utils/audit');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @openapi
 * /api/admin/audit-logs:
 *   get:
 *     summary: Query the immutable audit trail (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: action, in: query, schema: { type: string } }
 *       - { name: resourceType, in: query, schema: { type: string } }
 *       - { name: userId, in: query, schema: { type: string } }
 *       - { name: resourceId, in: query, schema: { type: string } }
 *       - { name: page, in: query, schema: { type: integer } }
 *       - { name: limit, in: query, schema: { type: integer, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Paginated audit log entries (append-only)
 *       403:
 *         description: Admin access required
 */
router.get('/audit-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // SECURITY: clamp pagination to prevent resource-exhaustion
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const { logs, total } = await queryAuditLogs({
      userId: req.query.userId || null,
      action: req.query.action || null,
      resourceType: req.query.resourceType || null,
      resourceId: req.query.resourceId || null,
      limit,
      offset
    });

    res.json({
      success: true,
      data: {
        logs: logs.map((row) => ({
          id: row.id,
          userId: row.user_id,
          action: row.action,
          resourceType: row.resource_type,
          resourceId: row.resource_id,
          details: row.details,
          ip: row.ip_address,
          userAgent: row.user_agent,
          createdAt: row.created_at
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Query audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to query audit logs'
    });
  }
});

module.exports = router;

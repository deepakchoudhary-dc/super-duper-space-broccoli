const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');

const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Validation rules
const updateProfileValidation = [
  body('firstName').optional().trim().isLength({ min: 1, max: 100 }),
  body('lastName').optional().trim().isLength({ min: 1, max: 100 }),
  body('email').optional().isEmail().normalizeEmail()
];

const changePasswordValidation = [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
];

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const userQuery = `
      SELECT id, email, first_name, last_name, two_fa_enabled, 
             is_email_verified, last_login, created_at,
             (SELECT COUNT(*) FROM apis WHERE user_id = $1) as total_apis,
             (SELECT COUNT(*) FROM api_keys WHERE user_id = $1) as total_keys,
             (SELECT COUNT(*) FROM api_keys WHERE user_id = $1 AND status = 'active') as active_keys
      FROM users WHERE id = $1
    `;
    
    const userResult = await pool.query(userQuery, [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = userResult.rows[0];
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          twoFactorEnabled: user.two_fa_enabled,
          emailVerified: user.is_email_verified,
          lastLogin: user.last_login,
          createdAt: user.created_at,
          stats: {
            totalApis: parseInt(user.total_apis),
            totalKeys: parseInt(user.total_keys),
            activeKeys: parseInt(user.active_keys)
          }
        }
      }
    });
    
  } catch (error) {
    logger.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user profile'
    });
  }
});

// Update user profile
router.put('/profile', authenticateToken, updateProfileValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const userId = req.user.id;
    const { firstName, lastName, email } = req.body;
    
    // Check if email is being changed and is available
    if (email && email !== req.user.email) {
      const existingUser = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email address is already in use'
        });
      }
    }
    
    // Build update query
    const updateFields = {};
    let emailChanged = false;
    if (firstName !== undefined) updateFields.first_name = firstName;
    if (lastName !== undefined) updateFields.last_name = lastName;
    if (email !== undefined && email !== req.user.email) {
      updateFields.email = email;
      updateFields.is_email_verified = false; // Reset verification if email changed
      emailChanged = true;
    }
    
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    const setClause = Object.keys(updateFields).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const updateQuery = `
      UPDATE users 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email, first_name, last_name, is_email_verified, updated_at
    `;
    
    const values = [userId, ...Object.values(updateFields)];
    const result = await pool.query(updateQuery, values);
    
    const updatedUser = result.rows[0];

    // If email changed: issue a fresh verification token and email it
    if (emailChanged && !process.env.SKIP_EMAIL_VERIFICATION === 'true') {
      try {
        const crypto = require('crypto');
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const bcrypt = require('bcryptjs');
        const tokenHash = await bcrypt.hash(verificationToken, 10);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await pool.query(
          'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
          [userId, tokenHash, expiresAt]
        );

        const { sendEmail } = require('../utils/email');
        await sendEmail({
          to: email,
          subject: 'Verify your new API Guardian email address',
          template: 'email-verification',
          data: {
            firstName: updatedUser.first_name || 'User',
            verificationUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`
          }
        });
      } catch (emailError) {
        logger.error('Failed to send new-email verification:', emailError);
      }
    }
    
    // Log audit event
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    await pool.query(auditQuery, [
      userId,
      'PROFILE_UPDATED',
      'user',
      userId,
      JSON.stringify(updateFields),
      req.ip,
      req.get('User-Agent')
    ]);
    
    logger.info('User profile updated', { userId, updatedFields: Object.keys(updateFields) });
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.first_name,
          lastName: updatedUser.last_name,
          emailVerified: updatedUser.is_email_verified,
          updatedAt: updatedUser.updated_at
        }
      }
    });
    
  } catch (error) {
    logger.error('Update user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// Change password
router.post('/change-password', authenticateToken, changePasswordValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    
    // Get current password hash
    const userQuery = 'SELECT password_hash FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = userResult.rows[0];
    
    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    );
    
    // Log audit event
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    await pool.query(auditQuery, [
      userId,
      'PASSWORD_CHANGED',
      'user',
      userId,
      JSON.stringify({ timestamp: new Date().toISOString() }),
      req.ip,
      req.get('User-Agent')
    ]);
    
    logger.info('User password changed', { userId });
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

// Get user activity/audit logs
router.get('/activity', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, action } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT action, resource_type, resource_id, details, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE user_id = $1
    `;
    
    const queryParams = [userId];
    let paramCount = 1;
    
    if (action) {
      paramCount++;
      query += ` AND action = $${paramCount}`;
      queryParams.push(action);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(parseInt(limit), offset);
    
    const result = await pool.query(query, queryParams);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM audit_logs WHERE user_id = $1';
    const countParams = [userId];
    let countParamCount = 1;
    
    if (action) {
      countParamCount++;
      countQuery += ` AND action = $${countParamCount}`;
      countParams.push(action);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);
    
    res.json({
      success: true,
      data: {
        activities: result.rows.map(row => ({
          action: row.action,
          resourceType: row.resource_type,
          resourceId: row.resource_id,
          details: row.details,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          createdAt: row.created_at
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        }
      }
    });
    
  } catch (error) {
    logger.error('Get user activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user activity'
    });
  }
});

// Get user dashboard statistics
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    // SECURITY: clamp days, parameterized intervals (was interpolated into SQL)
    const days = (() => {
      const parsed = parseInt(req.query.days, 10);
      return Number.isFinite(parsed) ? Math.max(1, Math.min(365, parsed)) : 30;
    })();
    
    // Get overview statistics
    const overviewQuery = `
      SELECT 
        (SELECT COUNT(*) FROM apis WHERE user_id = $1) as total_apis,
        (SELECT COUNT(*) FROM apis WHERE user_id = $1 AND status = 'active') as active_apis,
        (SELECT COUNT(*) FROM api_keys WHERE user_id = $1) as total_keys,
        (SELECT COUNT(*) FROM api_keys WHERE user_id = $1 AND status = 'active') as active_keys,
        (SELECT COUNT(*) FROM api_usage_logs WHERE user_id = $1 AND created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)) as total_requests,
        (SELECT COUNT(*) FROM api_usage_logs WHERE user_id = $1 AND status_code >= 400 AND created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)) as error_requests
    `;
    
    const overviewResult = await pool.query(overviewQuery, [userId, days]);
    const overview = overviewResult.rows[0];
    
    // Get daily usage for the last 30 days
    const usageQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as requests,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors,
        AVG(response_time) as avg_response_time
      FROM api_usage_logs
      WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
    
    const usageResult = await pool.query(usageQuery, [userId]);
    
    // Get top APIs by usage
    const topApisQuery = `
      SELECT 
        a.id, a.name, a.base_url,
        COUNT(aul.*) as request_count,
        MAX(aul.created_at) as last_used
      FROM apis a
      LEFT JOIN api_usage_logs aul ON a.id = aul.api_id AND aul.created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)
      WHERE a.user_id = $1
      GROUP BY a.id, a.name, a.base_url
      ORDER BY request_count DESC
      LIMIT 5
    `;
    
    const topApisResult = await pool.query(topApisQuery, [userId, days]);
    
    // Get recent activity
    const recentActivityQuery = `
      SELECT action, resource_type, resource_id, details, created_at
      FROM audit_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    const recentActivityResult = await pool.query(recentActivityQuery, [userId]);
    
    res.json({
      success: true,
      data: {
        overview: {
          totalApis: parseInt(overview.total_apis),
          activeApis: parseInt(overview.active_apis),
          totalKeys: parseInt(overview.total_keys),
          activeKeys: parseInt(overview.active_keys),
          totalRequests: parseInt(overview.total_requests),
          errorRequests: parseInt(overview.error_requests),
          successRate: overview.total_requests > 0 ? 
            ((overview.total_requests - overview.error_requests) / overview.total_requests * 100).toFixed(2) : '100.00'
        },
        dailyUsage: usageResult.rows.map(row => ({
          date: row.date,
          requests: parseInt(row.requests),
          errors: parseInt(row.errors),
          avgResponseTime: parseFloat(row.avg_response_time) || 0
        })),
        topApis: topApisResult.rows.map(row => ({
          id: row.id,
          name: row.name,
          baseUrl: row.base_url,
          requestCount: parseInt(row.request_count),
          lastUsed: row.last_used
        })),
        recentActivity: recentActivityResult.rows.map(row => ({
          action: row.action,
          resourceType: row.resource_type,
          resourceId: row.resource_id,
          details: row.details,
          createdAt: row.created_at
        }))
      }
    });
    
  } catch (error) {
    logger.error('Get user dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard data'
    });  }
});

// Get user statistics for dashboard
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM apis WHERE user_id = $1) as apis,
        (SELECT COUNT(*) FROM api_keys WHERE user_id = $1 AND status = 'active') as keys,
        (SELECT COUNT(*) FROM api_usage_logs WHERE user_id = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') as requests_last_24h,
        (SELECT COUNT(*) FROM api_usage_logs WHERE user_id = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') as requests_last_30d,
        (SELECT COALESCE(AVG(response_time), 0) FROM api_usage_logs WHERE user_id = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') as avg_response_time
    `;
    
    const result = await pool.query(statsQuery, [userId]);
    const stats = result.rows[0];
    
    res.json({
      success: true,
      data: {
        apis: parseInt(stats.apis) || 0,
        keys: parseInt(stats.keys) || 0,
        requests: parseInt(stats.requests_last_24h) || 0,
        requestsLast30d: parseInt(stats.requests_last_30d) || 0,
        avgResponseTime: parseFloat(stats.avg_response_time) || 0
      }
    });
    
  } catch (error) {
    logger.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user statistics'
    });
  }
});

// Get recent activity for dashboard (real data from audit_logs + usage spikes)
router.get('/recent-activity', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Recent audit events (real data)
    const activityQuery = `
      SELECT action, resource_type, resource_id, details, created_at
      FROM audit_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 8
    `;
    const activityResult = await pool.query(activityQuery, [userId]);
    
    // Recent API usage spikes (error bursts or high traffic)
    const spikesQuery = `
      SELECT 
        a.id as api_id, a.name as api_name,
        COUNT(*) as request_count,
        COUNT(CASE WHEN aul.status_code >= 400 THEN 1 END) as error_count,
        MAX(aul.created_at) as last_used
      FROM api_usage_logs aul
      JOIN apis a ON aul.api_id = a.id
      WHERE aul.user_id = $1 AND aul.created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      GROUP BY a.id, a.name
      HAVING COUNT(*) > 100 OR COUNT(CASE WHEN aul.status_code >= 400 THEN 1 END) > 10
      ORDER BY request_count DESC
      LIMIT 3
    `;
    const spikesResult = await pool.query(spikesQuery, [userId]);
    
    const recentActivity = [
      ...activityResult.rows.map(row => ({
        type: 'activity',
        title: formatActionTitle(row.action),
        description: typeof row.details === 'string' ? row.details.slice(0, 120) : JSON.stringify(row.details || {}).slice(0, 120),
        timestamp: row.created_at,
        createdAt: row.created_at
      })),
      ...spikesResult.rows.map(row => ({
        type: 'request_spike',
        title: 'High Traffic Detected',
        description: `${row.api_name} — ${row.request_count} requests in the last 24h${row.error_count > 0 ? ` (${row.error_count} errors)` : ''}`,
        timestamp: row.last_used,
        createdAt: row.last_used,
        apiId: row.api_id
      }))
    ];
    
    res.json({
      success: true,
      data: recentActivity
    });
    
  } catch (error) {
    logger.error('Get recent activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve recent activity'
    });
  }
});

// Get alerts for dashboard (real data: error rates, expiring keys, rate limit pressure)
router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const alerts = [];

    // 1. APIs with elevated error rates in the last hour
    const errorRateQuery = `
      SELECT a.name, a.id,
             COUNT(*) as total,
             COUNT(CASE WHEN aul.status_code >= 400 THEN 1 END) as errors
      FROM api_usage_logs aul
      JOIN apis a ON aul.api_id = a.id
      WHERE aul.user_id = $1 AND aul.created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
      GROUP BY a.id, a.name
      HAVING COUNT(*) >= 10 AND (COUNT(CASE WHEN aul.status_code >= 400 THEN 1 END)::float / COUNT(*)) > 0.05
      ORDER BY errors DESC
      LIMIT 5
    `;
    const errorRateResult = await pool.query(errorRateQuery, [userId]);
    for (const row of errorRateResult.rows) {
      const rate = ((row.errors / row.total) * 100).toFixed(1);
      alerts.push({
        type: 'error',
        title: 'Elevated Error Rate',
        message: `${row.name} has a ${rate}% error rate in the last hour (${row.errors}/${row.total})`,
        timestamp: new Date().toISOString(),
        apiId: row.id
      });
    }

    // 2. Keys expiring within 7 days
    const expiringKeysQuery = `
      SELECT ak.name, ak.expires_at, a.name as api_name
      FROM api_keys ak
      JOIN apis a ON ak.api_id = a.id
      WHERE ak.user_id = $1 AND ak.status = 'active'
        AND ak.expires_at IS NOT NULL
        AND ak.expires_at BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '7 days'
      ORDER BY ak.expires_at ASC
      LIMIT 5
    `;
    const expiringKeysResult = await pool.query(expiringKeysQuery, [userId]);
    for (const row of expiringKeysResult.rows) {
      alerts.push({
        type: 'warning',
        title: 'API Key Expiring Soon',
        message: `Key "${row.name}" for ${row.api_name} expires ${new Date(row.expires_at).toLocaleDateString()}`,
        timestamp: new Date().toISOString()
      });
    }

    // 3. Rate-limit pressure — keys near their limit in the last 24h
    const rateLimitPressureQuery = `
      SELECT ak.id, ak.name, ak.rate_limit, a.name as api_name, COUNT(aul.*) as used
      FROM api_keys ak
      JOIN apis a ON ak.api_id = a.id
      LEFT JOIN api_usage_logs aul ON ak.id = aul.api_key_id 
        AND aul.created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      WHERE ak.user_id = $1 AND ak.status = 'active'
      GROUP BY ak.id, ak.name, ak.rate_limit, a.name
      HAVING ak.rate_limit > 0 AND COUNT(aul.*) >= ak.rate_limit * 0.8
      ORDER BY used DESC
      LIMIT 5
    `;
    const pressureResult = await pool.query(rateLimitPressureQuery, [userId]);
    for (const row of pressureResult.rows) {
      const pct = ((row.used / row.rate_limit) * 100).toFixed(0);
      alerts.push({
        type: 'warning',
        title: 'Rate Limit Approaching',
        message: `${row.api_name} key "${row.name}" has used ${pct}% of its ${row.rate_limit}/24h allowance`,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: alerts.slice(0, 10)
    });
    
  } catch (error) {
    logger.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve alerts'
    });
  }
});

// Helper: human-readable action title
function formatActionTitle(action) {
  const titles = {
    USER_LOGIN: 'User logged in',
    USER_LOGOUT: 'User logged out',
    USER_REGISTERED: 'Account created',
    API_CREATED: 'API registered',
    API_UPDATED: 'API updated',
    API_DELETED: 'API deleted',
    API_KEY_CREATED: 'API key created',
    API_KEY_UPDATED: 'API key updated',
    API_KEY_REVOKED: 'API key revoked',
    API_KEY_REGENERATED: 'API key regenerated',
    API_KEY_DELETED: 'API key deleted',
    PASSWORD_CHANGED: 'Password changed',
    PASSWORD_RESET_SUCCESSFUL: 'Password reset',
    TWO_FA_ENABLED: '2FA enabled',
    TWO_FA_DISABLED: '2FA disabled',
    SETTINGS_UPDATED: 'Settings updated',
    PROFILE_UPDATED: 'Profile updated'
  };
  return titles[action] || action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = router;

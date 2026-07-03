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
    if (firstName !== undefined) updateFields.first_name = firstName;
    if (lastName !== undefined) updateFields.last_name = lastName;
    if (email !== undefined) {
      updateFields.email = email;
      updateFields.is_email_verified = false; // Reset verification if email changed
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
    const { days = 30 } = req.query;
    
    // Get overview statistics
    const overviewQuery = `
      SELECT 
        (SELECT COUNT(*) FROM apis WHERE user_id = $1) as total_apis,
        (SELECT COUNT(*) FROM apis WHERE user_id = $1 AND status = 'active') as active_apis,
        (SELECT COUNT(*) FROM api_keys WHERE user_id = $1) as total_keys,
        (SELECT COUNT(*) FROM api_keys WHERE user_id = $1 AND status = 'active') as active_keys,
        (SELECT COUNT(*) FROM api_usage_logs WHERE user_id = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${parseInt(days)} days') as total_requests,
        (SELECT COUNT(*) FROM api_usage_logs WHERE user_id = $1 AND status_code >= 400 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${parseInt(days)} days') as error_requests
    `;
    
    const overviewResult = await pool.query(overviewQuery, [userId]);
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
      LEFT JOIN api_usage_logs aul ON a.id = aul.api_id AND aul.created_at >= CURRENT_TIMESTAMP - INTERVAL '${parseInt(days)} days'
      WHERE a.user_id = $1
      GROUP BY a.id, a.name, a.base_url
      ORDER BY request_count DESC
      LIMIT 5
    `;
    
    const topApisResult = await pool.query(topApisQuery, [userId]);
    
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
        0 as requests,
        '99.9%' as uptime
    `;
    
    const result = await pool.query(statsQuery, [userId]);
    const stats = result.rows[0];
    
    res.json({
      success: true,
      data: {
        apis: parseInt(stats.apis) || 0,
        keys: parseInt(stats.keys) || 0,
        requests: parseInt(stats.requests) || 0,
        uptime: stats.uptime
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

// Get recent activity for dashboard
router.get('/recent-activity', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Mock recent activity data for now
    const recentActivity = [
      {
        type: 'api_created',
        title: 'New API Created',
        description: 'Weather API was successfully registered',
        timestamp: '2 hours ago'
      },
      {
        type: 'key_generated', 
        title: 'API Key Generated',
        description: 'New key generated for Payment API',
        timestamp: '5 hours ago'
      },
      {
        type: 'request_spike',
        title: 'High Traffic Detected',
        description: 'User Management API experiencing increased usage',
        timestamp: '1 day ago'
      }
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

// Get alerts for dashboard
router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Mock alerts data for now
    const alerts = [
      {
        type: 'warning',
        title: 'Rate Limit Approaching',
        message: 'Payment API is at 80% of rate limit',
        timestamp: '30 minutes ago'
      },
      {
        type: 'info',
        title: 'New Feature Available',
        message: 'Enhanced analytics now available for all APIs',
        timestamp: '2 days ago'
      }
    ];
    
    res.json({
      success: true,
      data: alerts
    });
    
  } catch (error) {
    logger.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve alerts'
    });
  }
});

module.exports = router;

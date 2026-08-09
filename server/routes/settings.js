const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const DEFAULT_SETTINGS = {
  notifications: {
    emailOnKeyCreation: true,
    emailOnKeyRevocation: true,
    emailOnRateLimitExceeded: true,
    emailOnSecurityAlert: true,
    emailOnWeeklyReport: false
  },
  appearance: {
    theme: 'system', // 'light', 'dark', 'system'
    language: 'en',
    timezone: 'UTC',
    dateFormat: 'YYYY-MM-DD'
  },
  security: {
    sessionTimeout: 30, // minutes of inactivity
    ipWhitelist: [],
    requireTwoFactorForKeyCreation: false
  },
  api: {
    defaultRateLimit: 1000,
    defaultRateLimitWindow: 3600,
    defaultKeyExpiry: null // days, null = no expiry
  }
};

// ============================================================================
// AUDIT LOGGING
// ============================================================================

const logAuditEvent = async (userId, action, details, req) => {
  try {
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource_type, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    await pool.query(auditQuery, [
      userId,
      action,
      'settings',
      JSON.stringify(details),
      req.ip,
      req.get('User-Agent')
    ]);
  } catch (error) {
    logger.error('Failed to log settings audit event:', error);
  }
};

// ============================================================================
// GET SETTINGS
// ============================================================================

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT COALESCE(settings, '{}'::jsonb) AS settings FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Merge stored settings with defaults (stored settings take precedence)
    const storedSettings = result.rows[0].settings || {};
    const mergedSettings = deepMerge(DEFAULT_SETTINGS, storedSettings);

    res.json({
      success: true,
      data: {
        settings: mergedSettings
      }
    });

  } catch (error) {
    logger.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve settings'
    });
  }
});

// ============================================================================
// UPDATE SETTINGS
// ============================================================================

router.put('/', authenticateToken, [
  body('notifications').optional().isObject(),
  body('appearance').optional().isObject(),
  body('security').optional().isObject(),
  body('api').optional().isObject()
], async (req, res) => {
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
    const updates = req.body;

    // Validate specific settings values
    if (updates.appearance?.theme && !['light', 'dark', 'system'].includes(updates.appearance.theme)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid theme value. Must be "light", "dark", or "system".'
      });
    }

    if (updates.security?.sessionTimeout !== undefined) {
      const timeout = parseInt(updates.security.sessionTimeout);
      if (isNaN(timeout) || timeout < 5 || timeout > 1440) {
        return res.status(400).json({
          success: false,
          message: 'Session timeout must be between 5 and 1440 minutes'
        });
      }
    }

    // Get current settings and merge
    const currentResult = await pool.query("SELECT COALESCE(settings, '{}'::jsonb) AS settings FROM users WHERE id = $1", [userId]);
    const currentSettings = currentResult.rows[0]?.settings || {};
    const mergedSettings = deepMerge(currentSettings, updates);

    // Store merged settings
    const updateResult = await pool.query(
      'UPDATE users SET settings = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING settings',
      [JSON.stringify(mergedSettings), userId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Log audit event
    await logAuditEvent(userId, 'SETTINGS_UPDATED', {
      updatedKeys: Object.keys(updates)
    }, req);

    logger.info('User settings updated', { userId, updatedKeys: Object.keys(updates) });

    // Merge with defaults for response
    const responseSettings = deepMerge(DEFAULT_SETTINGS, updateResult.rows[0].settings || {});

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        settings: responseSettings
      }
    });

  } catch (error) {
    logger.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
});

// ============================================================================
// RESET SETTINGS TO DEFAULTS
// ============================================================================

router.post('/reset', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    await pool.query(
      'UPDATE users SET settings = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify({}), userId]
    );

    await logAuditEvent(userId, 'SETTINGS_RESET', {}, req);
    logger.info('User settings reset to defaults', { userId });

    res.json({
      success: true,
      message: 'Settings reset to defaults',
      data: {
        settings: DEFAULT_SETTINGS
      }
    });

  } catch (error) {
    logger.error('Reset settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset settings'
    });
  }
});

// ============================================================================
// DELETE ACCOUNT
// ============================================================================

router.delete('/delete-account', authenticateToken, [
  body('password').notEmpty().withMessage('Password is required for account deletion'),
  body('confirmation').equals('DELETE').withMessage('You must type DELETE to confirm')
], async (req, res) => {
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
    const { password } = req.body;

    // Verify password before deletion
    const userResult = await pool.query(
      'SELECT password_hash, email FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, userResult.rows[0].password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    // Log audit event BEFORE deletion
    await logAuditEvent(userId, 'ACCOUNT_DELETED', {
      email: userResult.rows[0].email
    }, req);

    // Delete user — cascades to apis, api_keys, usage logs, audit logs, tokens
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    logger.info('User account deleted', { userId, email: userResult.rows[0].email });

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    logger.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
  }
});

// ============================================================================
// HELPER: Deep Merge Objects
// ============================================================================

function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

module.exports = router;

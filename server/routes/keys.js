const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { pool } = require('../config/database');
const { authenticateToken, checkResourceOwnership } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');
const { generateSecureApiKey, hashApiKey } = require('../utils/crypto');
const { deleteCache } = require('../config/redis');
const logger = require('../utils/logger');

const router = express.Router();

// Validation rules
const createKeyValidation = [
  body('name').trim().notEmpty().withMessage('Key name is required').isLength({ min: 1, max: 255 }),
  body('description').optional({ checkFalsy: true, nullable: true }).trim().isLength({ max: 1000 }),
  body('apiId').notEmpty().withMessage('Please select an API'),
  body('permissions').optional({ checkFalsy: true, nullable: true }),
  body('rateLimit').optional({ checkFalsy: true, nullable: true }).isInt({ min: 1, max: 100000 }),
  body('rateLimitWindow').optional({ checkFalsy: true, nullable: true }).isInt({ min: 1, max: 86400 }),
  body('expiresAt').optional({ checkFalsy: true, nullable: true })
];

const updateKeyValidation = [
  body('name').optional().trim().notEmpty().withMessage('Key name cannot be empty').isLength({ min: 1, max: 255 }),
  body('description').optional({ checkFalsy: true, nullable: true }).trim().isLength({ max: 1000 }),
  body('permissions').optional({ checkFalsy: true, nullable: true }),
  body('rateLimit').optional({ checkFalsy: true, nullable: true }).isInt({ min: 1, max: 100000 }),
  body('rateLimitWindow').optional({ checkFalsy: true, nullable: true }).isInt({ min: 1, max: 86400 }),
  body('status').optional().isIn(['active', 'inactive', 'revoked']),
  body('expiresAt').optional({ checkFalsy: true, nullable: true })
];

// ============================================================================
// AUDIT LOGGING HELPER
// ============================================================================

const logAuditEvent = async (userId, action, resourceId, details, req) => {
  try {
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    await pool.query(auditQuery, [
      userId,
      action,
      'api_key',
      resourceId,
      JSON.stringify(details),
      req.ip,
      req.get('User-Agent')
    ]);
  } catch (error) {
    logger.error('Failed to log audit event:', error);
  }
};

// ============================================================================
// GET ALL API KEYS
// ============================================================================

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status, apiId, search } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT ak.id, ak.name, ak.description, ak.key_prefix, ak.api_id, ak.permissions,
             ak.rate_limit, ak.rate_limit_window, ak.status, ak.expires_at, ak.last_used,
             ak.created_at, ak.updated_at,
             a.name as api_name, a.base_url as api_base_url,
             (SELECT COUNT(*) FROM api_usage_logs WHERE api_key_id = ak.id AND created_at >= CURRENT_DATE - INTERVAL '30 days') as usage_last_30_days
      FROM api_keys ak
      JOIN apis a ON ak.api_id = a.id
      WHERE ak.user_id = $1
    `;
    
    const queryParams = [userId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND ak.status = $${paramCount}`;
      queryParams.push(status);
    }

    if (apiId) {
      paramCount++;
      query += ` AND ak.api_id = $${paramCount}`;
      queryParams.push(apiId);
    }

    if (search) {
      paramCount++;
      query += ` AND (ak.name ILIKE $${paramCount} OR ak.description ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    query += ` ORDER BY ak.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(parseInt(limit), offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) 
      FROM api_keys ak
      JOIN apis a ON ak.api_id = a.id
      WHERE ak.user_id = $1
    `;
    const countParams = [userId];
    let countParamCount = 1;

    if (status) {
      countParamCount++;
      countQuery += ` AND ak.status = $${countParamCount}`;
      countParams.push(status);
    }

    if (apiId) {
      countParamCount++;
      countQuery += ` AND ak.api_id = $${countParamCount}`;
      countParams.push(apiId);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (ak.name ILIKE $${countParamCount} OR ak.description ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: {
        keys: result.rows.map(key => ({
          id: key.id,
          name: key.name,
          description: key.description,
          keyPrefix: key.key_prefix,
          apiId: key.api_id,
          apiName: key.api_name,
          apiBaseUrl: key.api_base_url,
          permissions: key.permissions,
          rateLimit: key.rate_limit,
          rateLimitWindow: key.rate_limit_window,
          status: key.status,
          expiresAt: key.expires_at,
          lastUsed: key.last_used,
          usageLast30Days: parseInt(key.usage_last_30_days),
          createdAt: key.created_at,
          updatedAt: key.updated_at
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
    logger.error('Get API keys error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve API keys'
    });
  }
});

// ============================================================================
// GET SINGLE API KEY
// ============================================================================

router.get('/:id', authenticateToken, checkResourceOwnership('api_key'), async (req, res) => {
  try {
    const keyId = req.params.id;

    const query = `
      SELECT ak.id, ak.name, ak.description, ak.key_prefix, ak.api_id, ak.permissions,
             ak.rate_limit, ak.rate_limit_window, ak.status, ak.expires_at, ak.last_used,
             ak.created_at, ak.updated_at,
             a.name as api_name, a.base_url as api_base_url,
             (SELECT COUNT(*) FROM api_usage_logs WHERE api_key_id = ak.id) as total_usage,
             (SELECT COUNT(*) FROM api_usage_logs WHERE api_key_id = ak.id AND created_at >= CURRENT_DATE - INTERVAL '30 days') as usage_last_30_days,
             (SELECT COUNT(*) FROM api_usage_logs WHERE api_key_id = ak.id AND created_at >= CURRENT_DATE - INTERVAL '7 days') as usage_last_7_days
      FROM api_keys ak
      JOIN apis a ON ak.api_id = a.id
      WHERE ak.id = $1
    `;

    const result = await pool.query(query, [keyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    const key = result.rows[0];

    res.json({
      success: true,
      data: {
        key: {
          id: key.id,
          name: key.name,
          description: key.description,
          keyPrefix: key.key_prefix,
          apiId: key.api_id,
          apiName: key.api_name,
          apiBaseUrl: key.api_base_url,
          permissions: key.permissions,
          rateLimit: key.rate_limit,
          rateLimitWindow: key.rate_limit_window,
          status: key.status,
          expiresAt: key.expires_at,
          lastUsed: key.last_used,
          totalUsage: parseInt(key.total_usage),
          usageLast30Days: parseInt(key.usage_last_30_days),
          usageLast7Days: parseInt(key.usage_last_7_days),
          createdAt: key.created_at,
          updatedAt: key.updated_at
        }
      }
    });

  } catch (error) {
    logger.error('Get API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve API key'
    });
  }
});

// ============================================================================
// CREATE API KEY — With SHA-256 Hashing (plaintext NEVER stored)
// ============================================================================

router.post('/', authenticateToken, createKeyValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return res.status(400).json({
        success: false,
        message: firstError.msg || 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { 
      name, 
      description, 
      apiId, 
      permissions, 
      rateLimit, 
      rateLimitWindow, 
      expiresAt 
    } = req.body;

    // Verify that the API belongs to the user
    const apiQuery = 'SELECT name, base_url FROM apis WHERE id = $1 AND user_id = $2';
    const apiResult = await pool.query(apiQuery, [apiId, userId]);

    if (apiResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API not found'
      });
    }

    const api = apiResult.rows[0];

    // Check if key name already exists for this API
    const existingKey = await pool.query(
      'SELECT id FROM api_keys WHERE api_id = $1 AND name = $2',
      [apiId, name]
    );

    if (existingKey.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'An API key with this name already exists for this API'
      });
    }

    // Generate secure API key with SHA-256 hash
    const { apiKey, keyPrefix, keyHash } = generateSecureApiKey();

    // Default permissions if not provided
    const defaultPermissions = permissions || {
      endpoints: [
        {
          path: '*',
          methods: ['GET']
        }
      ]
    };

    // Create API key — STORE HASH ONLY, never plaintext
    const keyQuery = `
      INSERT INTO api_keys (
        api_id, user_id, key_hash, key_prefix, name, description, 
        permissions, rate_limit, rate_limit_window, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, name, description, key_prefix, api_id, permissions,
                rate_limit, rate_limit_window, status, expires_at, created_at
    `;

    const keyResult = await pool.query(keyQuery, [
      apiId,
      userId,
      keyHash,  // SHA-256 hash — plaintext is NEVER stored
      keyPrefix,
      name,
      description || null,
      JSON.stringify(defaultPermissions),
      rateLimit || 1000,
      rateLimitWindow || 3600,
      expiresAt || null
    ]);

    const newKey = keyResult.rows[0];

    // Send notification email
    try {
      const userQuery = 'SELECT email, first_name FROM users WHERE id = $1';
      const userResult = await pool.query(userQuery, [userId]);
      const user = userResult.rows[0];

      await sendEmail({
        to: user.email,
        template: 'api-key-created',
        data: {
          firstName: user.first_name,
          apiName: api.name,
          keyName: name,
          rateLimit: newKey.rate_limit,
          createdAt: newKey.created_at,
          expiresAt: newKey.expires_at
        }
      });
    } catch (emailError) {
      logger.error('Failed to send key creation notification email:', emailError);
    }

    // Log audit event
    await logAuditEvent(userId, 'API_KEY_CREATED', newKey.id, {
      name,
      apiId,
      apiName: api.name
    }, req);

    logger.info('API key created successfully', {
      userId,
      keyId: newKey.id,
      apiId,
      name
    });

    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      data: {
        key: {
          id: newKey.id,
          name: newKey.name,
          description: newKey.description,
          apiKey: apiKey, // Only returned once during creation — NEVER stored
          keyPrefix: newKey.key_prefix,
          apiId: newKey.api_id,
          apiName: api.name,
          permissions: newKey.permissions,
          rateLimit: newKey.rate_limit,
          rateLimitWindow: newKey.rate_limit_window,
          status: newKey.status,
          expiresAt: newKey.expires_at,
          createdAt: newKey.created_at
        }
      }
    });

  } catch (error) {
    logger.error('Create API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create API key'
    });
  }
});

// ============================================================================
// UPDATE API KEY — Fixed SQL syntax
// ============================================================================

router.put('/:id', authenticateToken, checkResourceOwnership('api_key'), updateKeyValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const keyId = req.params.id;
    const userId = req.user.id;
    const updateFields = req.body;

    // Check if name is being updated and doesn't conflict
    if (updateFields.name) {
      const currentKeyQuery = 'SELECT api_id FROM api_keys WHERE id = $1';
      const currentKeyResult = await pool.query(currentKeyQuery, [keyId]);
      
      if (currentKeyResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'API key not found'
        });
      }

      const apiId = currentKeyResult.rows[0].api_id;

      const existingKey = await pool.query(
        'SELECT id FROM api_keys WHERE api_id = $1 AND name = $2 AND id != $3',
        [apiId, updateFields.name, keyId]
      );

      if (existingKey.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'An API key with this name already exists for this API'
        });
      }
    }

    // Build dynamic update query
    const updateKeys = Object.keys(updateFields);
    if (updateKeys.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    const setClause = updateKeys.map((key, index) => {
      const dbField = key === 'rateLimit' ? 'rate_limit' : 
                      key === 'rateLimitWindow' ? 'rate_limit_window' : 
                      key === 'expiresAt' ? 'expires_at' : key;
      return `${dbField} = $${index + 2}`;
    }).join(', ');

    // FIXED SQL: Correct PostgreSQL UPDATE ... RETURNING syntax
    const updateQuery = `
      UPDATE api_keys 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $${updateKeys.length + 2}
      RETURNING *
    `;

    const values = [
      keyId, 
      ...updateKeys.map(key => {
        if (key === 'permissions' && typeof updateFields[key] === 'object') {
          return JSON.stringify(updateFields[key]);
        }
        return updateFields[key];
      }), 
      userId
    ];
    
    const result = await pool.query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    const updatedKey = result.rows[0];

    // Fetch API name separately (clean separation from UPDATE)
    const apiNameResult = await pool.query('SELECT name FROM apis WHERE id = $1', [updatedKey.api_id]);
    const apiName = apiNameResult.rows.length > 0 ? apiNameResult.rows[0].name : null;

    // Clear cached key if status changed
    if (updateFields.status) {
      try {
        await deleteCache(`api_key_cache:${updatedKey.key_hash}`);
      } catch (redisError) {
        logger.error('Failed to clear key cache:', redisError);
      }
    }

    // Log audit event
    await logAuditEvent(userId, 'API_KEY_UPDATED', keyId, updateFields, req);

    logger.info('API key updated successfully', {
      userId,
      keyId,
      updatedFields: updateKeys
    });

    res.json({
      success: true,
      message: 'API key updated successfully',
      data: {
        key: {
          id: updatedKey.id,
          name: updatedKey.name,
          description: updatedKey.description,
          keyPrefix: updatedKey.key_prefix,
          apiId: updatedKey.api_id,
          apiName: apiName,
          permissions: updatedKey.permissions,
          rateLimit: updatedKey.rate_limit,
          rateLimitWindow: updatedKey.rate_limit_window,
          status: updatedKey.status,
          expiresAt: updatedKey.expires_at,
          lastUsed: updatedKey.last_used,
          createdAt: updatedKey.created_at,
          updatedAt: updatedKey.updated_at
        }
      }
    });

  } catch (error) {
    logger.error('Update API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update API key'
    });
  }
});

// ============================================================================
// REVOKE API KEY — Fixed SQL syntax
// ============================================================================

router.post('/:id/revoke', authenticateToken, checkResourceOwnership('api_key'), async (req, res) => {
  try {
    const keyId = req.params.id;
    const userId = req.user.id;

    // FIXED SQL: Correct UPDATE ... RETURNING syntax (no FROM/JOIN after RETURNING)
    const updateQuery = `
      UPDATE api_keys 
      SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [keyId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    const key = result.rows[0];

    // Fetch API name separately
    const apiNameResult = await pool.query('SELECT name FROM apis WHERE id = $1', [key.api_id]);
    const apiName = apiNameResult.rows.length > 0 ? apiNameResult.rows[0].name : 'Unknown';

    // Clear cached key
    try {
      await deleteCache(`api_key_cache:${key.key_hash}`);
    } catch (redisError) {
      logger.error('Failed to clear key cache:', redisError);
    }

    // Log audit event
    await logAuditEvent(userId, 'API_KEY_REVOKED', keyId, {
      name: key.name,
      apiName: apiName
    }, req);

    logger.info('API key revoked successfully', {
      userId,
      keyId,
      keyName: key.name
    });

    res.json({
      success: true,
      message: 'API key revoked successfully'
    });

  } catch (error) {
    logger.error('Revoke API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke API key'
    });
  }
});

// ============================================================================
// REGENERATE API KEY — Fixed SQL syntax + SHA-256 hashing
// ============================================================================

router.post('/:id/regenerate', authenticateToken, checkResourceOwnership('api_key'), async (req, res) => {
  try {
    const keyId = req.params.id;
    const userId = req.user.id;

    // Generate new secure API key with hash
    const { apiKey: newApiKey, keyPrefix: newKeyPrefix, keyHash: newKeyHash } = generateSecureApiKey();

    // Get old key hash for cache invalidation BEFORE updating
    const oldKeyResult = await pool.query(
      'SELECT key_hash FROM api_keys WHERE id = $1 AND user_id = $2 AND status = \'active\'',
      [keyId, userId]
    );

    if (oldKeyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API key not found or not active'
      });
    }

    const oldKeyHash = oldKeyResult.rows[0].key_hash;

    // FIXED SQL: Correct UPDATE ... RETURNING syntax
    const updateQuery = `
      UPDATE api_keys 
      SET key_hash = $1, key_prefix = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND user_id = $4 AND status = 'active'
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [newKeyHash, newKeyPrefix, keyId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API key not found or not active'
      });
    }

    const key = result.rows[0];

    // Fetch API name separately
    const apiNameResult = await pool.query('SELECT name FROM apis WHERE id = $1', [key.api_id]);
    const apiName = apiNameResult.rows.length > 0 ? apiNameResult.rows[0].name : 'Unknown';

    // Clear old cached key
    try {
      await deleteCache(`api_key_cache:${oldKeyHash}`);
    } catch (redisError) {
      logger.error('Failed to clear old key cache:', redisError);
    }

    // Log audit event
    await logAuditEvent(userId, 'API_KEY_REGENERATED', keyId, {
      name: key.name,
      apiName: apiName
    }, req);

    logger.info('API key regenerated successfully', {
      userId,
      keyId,
      keyName: key.name
    });

    res.json({
      success: true,
      message: 'API key regenerated successfully',
      data: {
        key: {
          id: key.id,
          name: key.name,
          apiKey: newApiKey, // Only returned once during regeneration — NEVER stored
          keyPrefix: key.key_prefix,
          updatedAt: key.updated_at
        }
      }
    });

  } catch (error) {
    logger.error('Regenerate API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate API key'
    });
  }
});

// ============================================================================
// DELETE API KEY
// ============================================================================

router.delete('/:id', authenticateToken, checkResourceOwnership('api_key'), async (req, res) => {
  try {
    const keyId = req.params.id;
    const userId = req.user.id;

    // Get key details for audit log and cache clear
    const keyQuery = `
      SELECT ak.name, ak.key_hash, a.name as api_name
      FROM api_keys ak
      JOIN apis a ON ak.api_id = a.id
      WHERE ak.id = $1 AND ak.user_id = $2
    `;
    const keyResult = await pool.query(keyQuery, [keyId, userId]);
    
    if (keyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    const keyData = keyResult.rows[0];

    // Delete API key
    const deleteQuery = 'DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id';
    const deleteResult = await pool.query(deleteQuery, [keyId, userId]);

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    // Clear cached key (using hash-based cache key)
    try {
      await deleteCache(`api_key_cache:${keyData.key_hash}`);
    } catch (redisError) {
      logger.error('Failed to clear key cache:', redisError);
    }

    // Log audit event
    await logAuditEvent(userId, 'API_KEY_DELETED', keyId, {
      name: keyData.name,
      apiName: keyData.api_name
    }, req);

    logger.info('API key deleted successfully', {
      userId,
      keyId,
      keyName: keyData.name
    });

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });

  } catch (error) {
    logger.error('Delete API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete API key'
    });
  }
});

// ============================================================================
// API KEY USAGE STATISTICS — Sanitized interval inputs
// ============================================================================

router.get('/:id/usage', authenticateToken, checkResourceOwnership('api_key'), async (req, res) => {
  try {
    const keyId = req.params.id;
    const { days = 7, groupBy = 'day' } = req.query;

    // SECURITY FIX: Sanitize days parameter to prevent NaN/injection in INTERVAL
    const safeDays = Math.max(1, Math.min(365, parseInt(days) || 7));

    let dateFormat;
    switch (groupBy) {
      case 'hour':
        dateFormat = "DATE_TRUNC('hour', created_at)";
        break;
      case 'week':
        dateFormat = "DATE_TRUNC('week', created_at)";
        break;
      case 'day':
      default:
        dateFormat = "DATE_TRUNC('day', created_at)";
    }

    const usageQuery = `
      SELECT 
        ${dateFormat} as period,
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as successful_requests,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_requests,
        AVG(response_time) as avg_response_time,
        SUM(request_size) as total_request_size,
        SUM(response_size) as total_response_size
      FROM api_usage_logs 
      WHERE api_key_id = $1 AND created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)
      GROUP BY ${dateFormat}
      ORDER BY period DESC
    `;

    const usageResult = await pool.query(usageQuery, [keyId, safeDays]);

    // Get endpoint usage
    const endpointQuery = `
      SELECT 
        endpoint,
        method,
        COUNT(*) as request_count,
        AVG(response_time) as avg_response_time,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
      FROM api_usage_logs 
      WHERE api_key_id = $1 AND created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)
      GROUP BY endpoint, method
      ORDER BY request_count DESC
      LIMIT 10
    `;

    const endpointResult = await pool.query(endpointQuery, [keyId, safeDays]);

    // Get error details
    const errorQuery = `
      SELECT 
        status_code,
        COUNT(*) as error_count,
        error_message
      FROM api_usage_logs 
      WHERE api_key_id = $1 AND status_code >= 400 
        AND created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)
      GROUP BY status_code, error_message
      ORDER BY error_count DESC
      LIMIT 10
    `;

    const errorResult = await pool.query(errorQuery, [keyId, safeDays]);

    res.json({
      success: true,
      data: {
        usage: usageResult.rows.map(row => ({
          period: row.period,
          totalRequests: parseInt(row.total_requests),
          successfulRequests: parseInt(row.successful_requests),
          errorRequests: parseInt(row.error_requests),
          avgResponseTime: parseFloat(row.avg_response_time) || 0,
          totalRequestSize: parseInt(row.total_request_size) || 0,
          totalResponseSize: parseInt(row.total_response_size) || 0
        })),
        endpoints: endpointResult.rows.map(row => ({
          endpoint: row.endpoint,
          method: row.method,
          requestCount: parseInt(row.request_count),
          avgResponseTime: parseFloat(row.avg_response_time) || 0,
          errorCount: parseInt(row.error_count)
        })),
        errors: errorResult.rows.map(row => ({
          statusCode: row.status_code,
          errorCount: parseInt(row.error_count),
          errorMessage: row.error_message
        }))
      }
    });

  } catch (error) {
    logger.error('Get key usage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve key usage statistics'
    });
  }
});

module.exports = router;

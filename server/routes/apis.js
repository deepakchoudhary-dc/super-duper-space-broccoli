const express = require('express');
const { body, validationResult, param } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { pool } = require('../config/database');
const { authenticateToken, checkResourceOwnership } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Validation rules
const createApiValidation = [
  body('name').trim().notEmpty().withMessage('API name is required').isLength({ min: 1, max: 255 }).withMessage('API name must be between 1 and 255 characters'),
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('Description must be under 1000 characters'),
  body('version').optional({ checkFalsy: true }).trim(),
  body('documentationUrl').optional({ checkFalsy: true }).trim(),
  body('documentation').optional({ checkFalsy: true }).trim(),
  body('webhookUrl').optional({ checkFalsy: true }).trim(),
  body().custom((value, { req }) => {
    const url = req.body.baseUrl || req.body.endpoint;
    if (!url || !url.trim()) {
      throw new Error('Base URL is required');
    }
    return true;
  })
];

const updateApiValidation = [
  body('name').optional().trim().notEmpty().withMessage('API name cannot be empty').isLength({ min: 1, max: 255 }),
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }),
  body('version').optional({ checkFalsy: true }).trim(),
  body('documentationUrl').optional({ checkFalsy: true }).trim(),
  body('documentation').optional({ checkFalsy: true }).trim(),
  body('webhookUrl').optional({ checkFalsy: true }).trim(),
  body('status').optional().isIn(['active', 'inactive', 'maintenance']),
  body().custom((value, { req }) => {
    const url = req.body.baseUrl || req.body.endpoint;
    if (url !== undefined && !url.trim()) {
      throw new Error('Base URL cannot be empty');
    }
    return true;
  })
];

// Helper function to log audit events
const logAuditEvent = async (userId, action, resourceId, details, req) => {
  try {
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    await pool.query(auditQuery, [
      userId,
      action,
      'api',
      resourceId,
      JSON.stringify(details),
      req.ip,
      req.get('User-Agent')
    ]);
  } catch (error) {
    logger.error('Failed to log audit event:', error);
  }
};

/**
 * @openapi
 * /api/apis:
 *   get:
 *     summary: List APIs for the authenticated user
 *     tags: [APIs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer } }
 *       - { name: limit, in: query, schema: { type: integer, maximum: 100 } }
 *       - { name: status, in: query, schema: { type: string, enum: [active, inactive, maintenance] } }
 *     responses:
 *       200:
 *         description: Paginated list of APIs
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    // SECURITY: clamp pagination to prevent resource-exhaustion (LIMIT 999999999)
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const { status, search } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT a.*, 
             COUNT(ak.id) as total_keys,
             COUNT(CASE WHEN ak.status = 'active' THEN 1 END) as active_keys
      FROM apis a
      LEFT JOIN api_keys ak ON a.id = ak.api_id
      WHERE (a.user_id = $1 OR a.org_id IN (SELECT org_id FROM organization_members WHERE user_id = $1))
    `;
    
    const queryParams = [userId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND a.status = $${paramCount}`;
      queryParams.push(status);
    }

    if (search) {
      paramCount++;
      query += ` AND (a.name ILIKE $${paramCount} OR a.description ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    query += ` GROUP BY a.id ORDER BY a.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(parseInt(limit), offset);

    const result = await pool.query(query, queryParams);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM apis WHERE (user_id = $1 OR org_id IN (SELECT org_id FROM organization_members WHERE user_id = $1))`;
    const countParams = [userId];
    let countParamCount = 1;

    if (status) {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (name ILIKE $${countParamCount} OR description ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: {
        apis: result.rows.map(api => ({
          id: api.id,
          name: api.name,
          description: api.description,
          baseUrl: api.base_url,
          version: api.version,
          status: api.status,
          documentationUrl: api.documentation_url,
          webhookUrl: api.webhook_url,
          totalKeys: parseInt(api.total_keys),
          activeKeys: parseInt(api.active_keys),
          createdAt: api.created_at,
          updatedAt: api.updated_at
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
    logger.error('Get APIs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve APIs'
    });
  }
});

// Get single API by ID
router.get('/:id', authenticateToken, checkResourceOwnership('api'), async (req, res) => {
  try {
    const apiId = req.params.id;

    const query = `
      SELECT a.*, 
             COUNT(ak.id) as total_keys,
             COUNT(CASE WHEN ak.status = 'active' THEN 1 END) as active_keys,
             COUNT(CASE WHEN ak.last_used > CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as recently_used_keys
      FROM apis a
      LEFT JOIN api_keys ak ON a.id = ak.api_id
      WHERE a.id = $1
      GROUP BY a.id
    `;

    const result = await pool.query(query, [apiId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API not found'
      });
    }

    const api = result.rows[0];

    res.json({
      success: true,
      data: {
        api: {
          id: api.id,
          name: api.name,
          description: api.description,
          baseUrl: api.base_url,
          version: api.version,
          status: api.status,
          documentationUrl: api.documentation_url,
          webhookUrl: api.webhook_url,
          totalKeys: parseInt(api.total_keys),
          activeKeys: parseInt(api.active_keys),
          recentlyUsedKeys: parseInt(api.recently_used_keys),
          createdAt: api.created_at,
          updatedAt: api.updated_at
        }
      }
    });

  } catch (error) {
    logger.error('Get API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve API'
    });
  }
});

/**
 * @openapi
 * /api/apis:
 *   post:
 *     summary: Register a new upstream API
 *     tags: [APIs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, baseUrl]
 *             properties:
 *               name: { type: string }
 *               baseUrl: { type: string, format: uri, description: SSRF-protected upstream base URL }
 *               version: { type: string }
 *               category: { type: string, enum: [REST, GraphQL] }
 *               isPublic: { type: boolean }
 *     responses:
 *       201:
 *         description: API registered
 *       400:
 *         description: Validation or SSRF rejection
 */
router.post('/', authenticateToken, createApiValidation, async (req, res) => {
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
      baseUrl, 
      endpoint,
      version, 
      documentationUrl, 
      documentation,
      webhookUrl,
      isPublic,
      is_public,
      authRequired,
      requiresAuth,
      auth_required,
      rateLimit,
      rate_limit,
      rateLimitWindow,
      rate_limit_window,
      category,
      orgId,
      org_id,
      transformConfig,
      transform_config,
      mtlsConfig,
      mtls_config
    } = req.body;

    const actualBaseUrl = baseUrl || endpoint;
    const actualDocumentationUrl = documentationUrl || documentation || null;
    const actualIsPublic = isPublic !== undefined ? isPublic : (is_public !== undefined ? is_public : false);
    const actualAuthRequired = authRequired !== undefined ? authRequired : (requiresAuth !== undefined ? requiresAuth : (auth_required !== undefined ? auth_required : true));
    const actualRateLimit = rateLimit !== undefined ? parseInt(rateLimit) : (rate_limit !== undefined ? parseInt(rate_limit) : 1000);
    const actualRateLimitWindow = rateLimitWindow !== undefined ? parseInt(rateLimitWindow) : (rate_limit_window !== undefined ? parseInt(rate_limit_window) : 3600);
    const actualCategory = category || 'REST';

    // Transformation + mTLS config validation (opt-in gateway policies)
    const actualTransformConfig = transformConfig || transform_config || {};
    const { validateTransformConfig } = require('../utils/transform');
    const transformCheck = validateTransformConfig(actualTransformConfig);
    if (!transformCheck.ok) {
      return res.status(400).json({
        success: false,
        message: `Invalid transform config: ${transformCheck.errors.join('; ')}`
      });
    }
    const actualMtlsConfig = mtlsConfig || mtls_config || null;
    if (actualMtlsConfig && (!actualMtlsConfig.certPath || !actualMtlsConfig.keyPath)) {
      return res.status(400).json({
        success: false,
        message: 'mTLS config requires certPath and keyPath'
      });
    }

    // Organization attachment (multi-tenancy): creator must be a member
    const actualOrgId = orgId || org_id || null;
    if (actualOrgId) {
      const { getOrgMembership } = require('../utils/orgs');
      const membership = await getOrgMembership(actualOrgId, userId);
      if (!membership) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of that organization'
        });
      }
    }

    // SECURITY: SSRF protection — validate the upstream base_url before storing.
    // Prevents registering internal/cloud-metadata targets that the gateway
    // would later proxy to (e.g. http://169.254.169.254).
    const { validateUrl, isObviousInternal } = require('../utils/ssrf');
    let baseHost;
    try { baseHost = new URL(actualBaseUrl).hostname; } catch (urlErr) { baseHost = null; }
    if (!baseHost || isObviousInternal(baseHost)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid base URL: internal or reserved targets are not allowed'
      });
    }
    const ssrfCheck = await validateUrl(actualBaseUrl);
    if (!ssrfCheck.ok) {
      return res.status(400).json({
        success: false,
        message: `Invalid base URL: ${ssrfCheck.reason}`
      });
    }

    // Check if API name already exists for this user
    const existingApi = await pool.query(
      'SELECT id FROM apis WHERE user_id = $1 AND name = $2',
      [userId, name]
    );

    if (existingApi.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'An API with this name already exists'
      });
    }

    // Create API
    const apiQuery = `
      INSERT INTO apis (
        user_id, name, description, base_url, version, 
        documentation_url, webhook_url, is_public, auth_required, 
        rate_limit, rate_limit_window, category, org_id, transform_config, mtls_config
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const apiResult = await pool.query(apiQuery, [
      userId,
      name,
      description || null,
      actualBaseUrl,
      version || '1.0.0',
      actualDocumentationUrl,
      webhookUrl || null,
      actualIsPublic,
      actualAuthRequired,
      actualRateLimit,
      actualRateLimitWindow,
      actualCategory,
      actualOrgId,
      JSON.stringify(actualTransformConfig),
      actualMtlsConfig ? JSON.stringify(actualMtlsConfig) : null
    ]);

    const api = apiResult.rows[0];

    // Log audit event
    await logAuditEvent(userId, 'API_CREATED', api.id, {
      name,
      baseUrl: actualBaseUrl,
      version: api.version
    }, req);

    logger.info('API created successfully', {
      userId,
      apiId: api.id,
      name,
      baseUrl: actualBaseUrl
    });

    res.status(201).json({
      success: true,
      message: 'API created successfully',
      data: {
        api: {
          id: api.id,
          name: api.name,
          description: api.description,
          baseUrl: api.base_url,
          version: api.version,
          status: api.status,
          documentationUrl: api.documentation_url,
          webhookUrl: api.webhook_url,
          isPublic: api.is_public,
          authRequired: api.auth_required,
          rateLimit: api.rate_limit,
          rateLimitWindow: api.rate_limit_window,
          category: api.category,
          createdAt: api.created_at,
          updatedAt: api.updated_at
        }
      }
    });

  } catch (error) {
    logger.error('Create API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create API'
    });
  }
});

// Update API
router.put('/:id', authenticateToken, checkResourceOwnership('api'), updateApiValidation, async (req, res) => {
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

    const apiId = req.params.id;
    const userId = req.user.id;
    const updateFields = req.body;

    // SECURITY: SSRF protection on base URL updates
    const { validateUrl, isObviousInternal } = require('../utils/ssrf');
    const newBaseUrl = updateFields.baseUrl || updateFields.endpoint;
    if (newBaseUrl) {
      let baseHost;
      try { baseHost = new URL(newBaseUrl).hostname; } catch (urlErr) { baseHost = null; }
      if (!baseHost || isObviousInternal(baseHost)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid base URL: internal or reserved targets are not allowed'
        });
      }
      const ssrfCheck = await validateUrl(newBaseUrl);
      if (!ssrfCheck.ok) {
        return res.status(400).json({
          success: false,
          message: `Invalid base URL: ${ssrfCheck.reason}`
        });
      }
    }

    // Check if name is being updated and doesn't conflict
    if (updateFields.name) {
      const existingApi = await pool.query(
        'SELECT id FROM apis WHERE user_id = $1 AND name = $2 AND id != $3',
        [userId, updateFields.name, apiId]
      );

      if (existingApi.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'An API with this name already exists'
        });
      }
    }

    // Normalize update fields to database columns
    const cleanedFields = {};
    
    if (updateFields.name !== undefined) cleanedFields.name = updateFields.name;
    if (updateFields.description !== undefined) cleanedFields.description = updateFields.description;
    
    const actualBaseUrl = updateFields.baseUrl || updateFields.endpoint;
    if (actualBaseUrl !== undefined) cleanedFields.base_url = actualBaseUrl;
    
    if (updateFields.version !== undefined) cleanedFields.version = updateFields.version;
    if (updateFields.status !== undefined) cleanedFields.status = updateFields.status;
    
    const actualDocumentationUrl = updateFields.documentationUrl || updateFields.documentation;
    if (actualDocumentationUrl !== undefined) cleanedFields.documentation_url = actualDocumentationUrl;
    
    const actualWebhookUrl = updateFields.webhookUrl;
    if (actualWebhookUrl !== undefined) cleanedFields.webhook_url = actualWebhookUrl;
    
    const isPublicVal = updateFields.isPublic !== undefined ? updateFields.isPublic : updateFields.is_public;
    if (isPublicVal !== undefined) cleanedFields.is_public = isPublicVal;
    
    const authReqVal = updateFields.authRequired !== undefined ? updateFields.authRequired : (updateFields.requiresAuth !== undefined ? updateFields.requiresAuth : updateFields.auth_required);
    if (authReqVal !== undefined) cleanedFields.auth_required = authReqVal;
    
    const rlVal = updateFields.rateLimit !== undefined ? updateFields.rateLimit : updateFields.rate_limit;
    if (rlVal !== undefined) cleanedFields.rate_limit = parseInt(rlVal);
    
    const rlwVal = updateFields.rateLimitWindow !== undefined ? updateFields.rateLimitWindow : updateFields.rate_limit_window;
    if (rlwVal !== undefined) cleanedFields.rate_limit_window = parseInt(rlwVal);
    
    if (updateFields.category !== undefined) cleanedFields.category = updateFields.category;

    const newTransformConfig = updateFields.transformConfig || updateFields.transform_config;
    if (newTransformConfig !== undefined) {
      const { validateTransformConfig } = require('../utils/transform');
      const transformCheck = validateTransformConfig(newTransformConfig);
      if (!transformCheck.ok) {
        return res.status(400).json({
          success: false,
          message: `Invalid transform config: ${transformCheck.errors.join('; ')}`
        });
      }
      cleanedFields.transform_config = JSON.stringify(newTransformConfig);
    }

    const newMtlsConfig = updateFields.mtlsConfig || updateFields.mtls_config;
    if (newMtlsConfig !== undefined) {
      if (newMtlsConfig && (!newMtlsConfig.certPath || !newMtlsConfig.keyPath)) {
        return res.status(400).json({
          success: false,
          message: 'mTLS config requires certPath and keyPath'
        });
      }
      cleanedFields.mtls_config = newMtlsConfig ? JSON.stringify(newMtlsConfig) : null;
    }

    const updateKeys = Object.keys(cleanedFields);
    if (updateKeys.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    const setClause = updateKeys.map((key, index) => {
      return `${key} = $${index + 2}`;
    }).join(', ');

    const updateQuery = `
      UPDATE apis 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $${updateKeys.length + 2}
      RETURNING *
    `;

    const values = [apiId, ...updateKeys.map(key => cleanedFields[key]), userId];
    const result = await pool.query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API not found'
      });
    }

    const api = result.rows[0];

    // Log audit event
    await logAuditEvent(userId, 'API_UPDATED', apiId, updateFields, req);

    logger.info('API updated successfully', {
      userId,
      apiId,
      updatedFields: updateKeys
    });

    res.json({
      success: true,
      message: 'API updated successfully',
      data: {
        api: {
          id: api.id,
          name: api.name,
          description: api.description,
          baseUrl: api.base_url,
          version: api.version,
          status: api.status,
          documentationUrl: api.documentation_url,
          webhookUrl: api.webhook_url,
          isPublic: api.is_public,
          authRequired: api.auth_required,
          rateLimit: api.rate_limit,
          rateLimitWindow: api.rate_limit_window,
          category: api.category,
          createdAt: api.created_at,
          updatedAt: api.updated_at
        }
      }
    });

  } catch (error) {
    logger.error('Update API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update API'
    });
  }
});

// Delete API
router.delete('/:id', authenticateToken, checkResourceOwnership('api'), async (req, res) => {
  try {
    const apiId = req.params.id;
    const userId = req.user.id;

    // Check if API has active keys
    const activeKeysQuery = 'SELECT COUNT(*) as count FROM api_keys WHERE api_id = $1 AND status = $2';
    const activeKeysResult = await pool.query(activeKeysQuery, [apiId, 'active']);
    
    if (parseInt(activeKeysResult.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete API with active keys. Please revoke all keys first.'
      });
    }

    // Get API details for audit log
    const apiQuery = 'SELECT name FROM apis WHERE id = $1';
    const apiResult = await pool.query(apiQuery, [apiId]);
    const apiName = apiResult.rows[0]?.name;

    // Delete API (cascade will handle related records)
    const deleteQuery = 'DELETE FROM apis WHERE id = $1 AND user_id = $2 RETURNING id';
    const deleteResult = await pool.query(deleteQuery, [apiId, userId]);

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API not found'
      });
    }

    // Log audit event
    await logAuditEvent(userId, 'API_DELETED', apiId, { name: apiName }, req);

    logger.info('API deleted successfully', { userId, apiId, apiName });

    res.json({
      success: true,
      message: 'API deleted successfully'
    });

  } catch (error) {
    logger.error('Delete API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete API'
    });
  }
});

// Get API statistics
router.get('/:id/stats', authenticateToken, checkResourceOwnership('api'), async (req, res) => {
  try {
    const apiId = req.params.id;
    // SECURITY: clamp days and use parameterized MAKE_INTERVAL (was interpolated
    // directly into SQL — allowed NaN crashes and unbounded windows)
    const days = (() => {
      const parsed = parseInt(req.query.days, 10);
      return Number.isFinite(parsed) ? Math.max(1, Math.min(365, parsed)) : 7;
    })();

    // Get usage statistics
    const usageQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as successful_requests,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_requests,
        AVG(response_time) as avg_response_time,
        COUNT(DISTINCT api_key_id) as unique_keys
      FROM api_usage_logs 
      WHERE api_id = $1 AND created_at >= CURRENT_DATE - MAKE_INTERVAL(days => $2)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    const usageResult = await pool.query(usageQuery, [apiId, days]);

    // Get top endpoints
    const endpointsQuery = `
      SELECT 
        endpoint,
        method,
        COUNT(*) as request_count,
        AVG(response_time) as avg_response_time
      FROM api_usage_logs 
      WHERE api_id = $1 AND created_at >= CURRENT_DATE - MAKE_INTERVAL(days => $2)
      GROUP BY endpoint, method
      ORDER BY request_count DESC
      LIMIT 10
    `;

    const endpointsResult = await pool.query(endpointsQuery, [apiId, days]);

    // Get key usage statistics
    const keyUsageQuery = `
      SELECT 
        ak.name as key_name,
        ak.id as key_id,
        COUNT(aul.*) as request_count,
        MAX(aul.created_at) as last_used
      FROM api_keys ak
      LEFT JOIN api_usage_logs aul ON ak.id = aul.api_key_id AND aul.created_at >= CURRENT_DATE - MAKE_INTERVAL(days => $2)
      WHERE ak.api_id = $1
      GROUP BY ak.id, ak.name
      ORDER BY request_count DESC
    `;

    const keyUsageResult = await pool.query(keyUsageQuery, [apiId, days]);

    res.json({
      success: true,
      data: {
        usage: usageResult.rows.map(row => ({
          date: row.date,
          totalRequests: parseInt(row.total_requests),
          successfulRequests: parseInt(row.successful_requests),
          errorRequests: parseInt(row.error_requests),
          avgResponseTime: parseFloat(row.avg_response_time) || 0,
          uniqueKeys: parseInt(row.unique_keys)
        })),
        topEndpoints: endpointsResult.rows.map(row => ({
          endpoint: row.endpoint,
          method: row.method,
          requestCount: parseInt(row.request_count),
          avgResponseTime: parseFloat(row.avg_response_time) || 0
        })),
        keyUsage: keyUsageResult.rows.map(row => ({
          keyId: row.key_id,
          keyName: row.key_name,
          requestCount: parseInt(row.request_count),
          lastUsed: row.last_used
        }))
      }
    });

  } catch (error) {
    logger.error('Get API stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve API statistics'
    });
  }
});

// ============================================================================
// UPDATE TRANSFORM CONFIG — per-API request/response transformation policy
// ============================================================================

/**
 * @openapi
 * /api/apis/{id}/transform:
 *   patch:
 *     summary: Set the per-API transformation policy (path rewrites, headers, CORS, gzip)
 *     tags: [APIs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               transformConfig:
 *                 type: object
 *                 description: See server/utils/transform.js for the full shape
 *     responses:
 *       200:
 *         description: Transform policy updated
 *       400:
 *         description: Invalid transform config
 */
router.patch('/:id/transform', authenticateToken, checkResourceOwnership('api'), async (req, res) => {
  try {
    const apiId = req.params.id;
    const { transformConfig } = req.body;
    if (transformConfig === undefined || transformConfig === null) {
      return res.status(400).json({ success: false, message: 'transformConfig is required' });
    }

    const { validateTransformConfig } = require('../utils/transform');
    const transformCheck = validateTransformConfig(transformConfig);
    if (!transformCheck.ok) {
      return res.status(400).json({
        success: false,
        message: `Invalid transform config: ${transformCheck.errors.join('; ')}`
      });
    }

    const result = await pool.query(
      `UPDATE apis SET transform_config = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, transform_config`,
      [JSON.stringify(transformConfig), apiId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'API not found' });
    }

    await logAuditEvent(req.user.id, 'API_TRANSFORM_UPDATED', apiId, { transformConfig }, req);

    res.json({ success: true, message: 'Transform policy updated', data: { transformConfig: result.rows[0].transform_config } });
  } catch (error) {
    logger.error('Update transform config error:', error);
    res.status(500).json({ success: false, message: 'Failed to update transform config' });
  }
});

module.exports = router;

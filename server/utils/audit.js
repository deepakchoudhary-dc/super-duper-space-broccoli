/**
 * Audit Logging (append-only)
 * ---------------------------
 * Single entry point for the immutable audit trail. Rows are INSERT-only;
 * the database enforces immutability with triggers (audit_logs_no_update /
 * audit_logs_no_delete), so no code path can rewrite history.
 *
 * Every gateway security event and every sensitive admin/user mutation is
 * recorded here: who (user_id), what (action), which resource, when, from
 * where (ip/user-agent), plus a free-form details blob.
 *
 * Retention: old rows are purged on a daily timer (config.audit.retentionDays).
 */

const { pool } = require('../config/database');
const config = require('../config/env');
const logger = require('./logger');

/**
 * Record an audit event.
 * @param {object} opts
 * @param {string|null} opts.userId  - actor; null for system events (webhooks)
 * @param {string} opts.action       - e.g. 'API_CREATED', 'SECURITY_WAF_BLOCK'
 * @param {string} [opts.resourceType] - 'api' | 'api_key' | 'user' | 'org' | 'security' | 'auth'
 * @param {string} [opts.resourceId]
 * @param {object} [opts.details]
 * @param {object} [opts.req]        - optional express request for ip/user-agent
 */
const audit = async ({ userId, action, resourceType = 'other', resourceId = null, details = {}, req = null }) => {
  if (!config.audit.enabled) return;

  const ip = req?.ip || null;
  const userAgent = req ? req.get('User-Agent') : null;

  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, action, resourceType, resourceId, JSON.stringify(details), ip, userAgent]
    );
  } catch (error) {
    // Audit failures must never break the request that triggered them
    logger.error('Failed to write audit event:', error.message);
  }
};

/**
 * Query audit logs (admin API). Filters + clamped pagination.
 */
const queryAuditLogs = async ({ userId, action, resourceType, resourceId, limit, offset }) => {
  const conditions = [];
  const params = [];

  if (userId) {
    params.push(userId);
    conditions.push(`user_id = $${params.length}`);
  }
  if (action) {
    params.push(action);
    conditions.push(`action = $${params.length}`);
  }
  if (resourceType) {
    params.push(resourceType);
    conditions.push(`resource_type = $${params.length}`);
  }
  if (resourceId) {
    params.push(resourceId);
    conditions.push(`resource_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataResult = await pool.query(
    `SELECT id, user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at
     FROM audit_logs ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM audit_logs ${where}`,
    params
  );

  return {
    logs: dataResult.rows,
    total: parseInt(countResult.rows[0].total, 10)
  };
};

/**
 * Purge audit rows older than the retention window.
 * @returns {Promise<number>} number of rows deleted
 */
const purgeExpired = async () => {
  if (!config.audit.enabled) return 0;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Bypass the immutability trigger for this session only — this is the sole
    // sanctioned path that may delete audit rows (retention policy).
    await client.query("SET LOCAL session_replication_role = 'replica'");
    const result = await client.query(
      `DELETE FROM audit_logs WHERE created_at < CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $1)`,
      [config.audit.retentionDays]
    );
    await client.query('COMMIT');
    if (result.rowCount > 0) {
      logger.info(`Audit retention purge removed ${result.rowCount} rows`);
    }
    return result.rowCount;
  } catch (error) {
    logger.error('Audit purge failed:', error.message);
    try { await client?.query('ROLLBACK'); } catch (rollbackErr) { /* noop */ }
    return 0;
  } finally {
    try { client?.release(); } catch (releaseErr) { /* noop */ }
  }
};

// Daily retention sweep (unref'd so it never blocks process exit)
const retentionTimer = setInterval(() => {
  purgeExpired().catch(() => {});
}, 24 * 60 * 60 * 1000);
retentionTimer.unref();

module.exports = { audit, queryAuditLogs, purgeExpired };

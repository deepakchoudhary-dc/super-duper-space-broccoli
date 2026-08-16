const express = require('express');
const { pool } = require('../config/database');
const { hashApiKey, isValidKeyFormat } = require('../utils/crypto');
const { deleteCache } = require('../config/redis');
const { clearResponseCacheForKey } = require('../utils/cache');
const { resetRateLimit } = require('../utils/rateLimiter');
const { audit } = require('../utils/audit');
const { notifySecurityAlert } = require('../utils/alerts');
const config = require('../config/env');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GitHub secret-scanning partner webhook.
 *
 * GitHub's partner program posts detected secrets to a webhook you configure
 * with a shared secret token. Payload shape (v2):
 *   { "alerts": [ { "token": "<raw secret>", "type": "api_guardian_key", ... } ] }
 *
 * Security:
 *  - The shared token must be passed as ?token=<GITHUB_WEBHOOK_SECRET>.
 *  - Raw tokens are never logged; only their SHA-256 hashes are matched.
 *  - A matched key is revoked immediately, its caches purged, and the owner
 *    is alerted. Everything lands in the immutable audit trail.
 */
router.post('/github-secret-scanning', async (req, res) => {
  if (!config.webhooks.enabled || !config.webhooks.githubSecret) {
    return res.status(503).json({ success: false, message: 'Webhook not configured' });
  }

  // Timing-safe token comparison
  const provided = req.query.token || '';
  const expected = config.webhooks.githubSecret;
  let match = false;
  try {
    match = require('crypto').timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch (err) {
    match = false;
  }
  if (!match) {
    logger.logSecurityEvent('WEBHOOK_INVALID_TOKEN', { ip: req.ip });
    return res.status(401).json({ success: false, message: 'Invalid webhook token' });
  }

  const alerts = Array.isArray(req.body) ? req.body : (req.body && Array.isArray(req.body.alerts) ? req.body.alerts : []);
  let revoked = 0;
  const results = [];

  for (const alert of alerts) {
    const rawToken = alert && (alert.token || alert.secret);
    if (!rawToken || typeof rawToken !== 'string') {
      results.push({ status: 'skipped', reason: 'missing token' });
      continue;
    }

    // Only consider well-formed API Guardian keys — avoids hashing noise
    if (!isValidKeyFormat(rawToken)) {
      results.push({ status: 'skipped', reason: 'not an api-guardian key format' });
      continue;
    }

    const keyHash = hashApiKey(rawToken);
    const keyResult = await pool.query(
      `SELECT ak.id, ak.user_id, ak.name, ak.key_hash, a.name as api_name
       FROM api_keys ak
       JOIN apis a ON ak.api_id = a.id
       WHERE ak.key_hash = $1 AND ak.status = 'active'`,
      [keyHash]
    );

    if (keyResult.rows.length === 0) {
      results.push({ status: 'skipped', reason: 'no matching active key' });
      continue;
    }

    const key = keyResult.rows[0];

    // Revoke the leaked key immediately
    await pool.query(`UPDATE api_keys SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [key.id]);
    try {
      await deleteCache(`api_key_cache:${key.key_hash}`);
    } catch (redisError) {
      logger.error('Failed to clear leaked key cache:', redisError);
    }
    await clearResponseCacheForKey(key.id);
    await resetRateLimit(`api_key:${key.id}`);

    // Audit trail (system event — actor is the webhook)
    await audit({
      userId: key.user_id,
      action: 'SECURITY_KEY_LEAK_REVOKED',
      resourceType: 'api_key',
      resourceId: key.id,
      details: {
        source: 'github_secret_scanning',
        keyName: key.name,
        apiName: key.api_name
      },
      req
    });

    // Alert the owner (cooldown-throttled, never blocks the webhook response)
    notifySecurityAlert(
      key.user_id,
      'API key leaked and revoked',
      {
        keyName: key.name,
        apiName: key.api_name,
        source: 'GitHub secret scanning',
        timestamp: new Date().toISOString()
      }
    ).catch(() => {});

    revoked += 1;
    results.push({ status: 'revoked', keyId: key.id, keyName: key.name });
    logger.logSecurityEvent('KEY_REVOKED_VIA_WEBHOOK', {
      keyId: key.id,
      keyName: key.name,
      source: 'github_secret_scanning'
    });
  }

  res.json({ success: true, revoked, results });
});

module.exports = router;

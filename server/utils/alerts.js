/**
 * Alerting Engine
 * ---------------
 * Turns gateway events into developer notifications:
 *  - RATE_LIMIT_EXCEEDED: email to the key owner (cooldown throttled so a
 *    burst doesn't spam the inbox).
 *  - Security events (circuit opened, suspicious activity): audit + email.
 *
 * The email templates already exist in utils/email.js; this wires them up.
 */

const { pool } = require('../config/database');
const { sendEmail } = require('./email');
const config = require('../config/env');
const logger = require('./logger');

// Cooldown store: key -> lastNotifiedAt (per process; Redis would be better
// across replicas but this keeps the dependency surface small)
const lastNotified = new Map();

const withinCooldown = (key, cooldownMs) => {
  const cooldown = cooldownMs || config.alerts.rateLimitAlertCooldownMs;
  const last = lastNotified.get(key) || 0;
  if (Date.now() - last < cooldown) return true;
  lastNotified.set(key, Date.now());
  return false;
};

/**
 * Notify the owner of a key that their rate limit was exceeded.
 * @param {object} keyData { id, name, api_id, user_id, rate_limit, rate_limit_window }
 */
const notifyRateLimitExceeded = async (keyData, currentUsage) => {
  if (!config.alerts.rateLimitEmail) return;

  const cooldownKey = `rl:${keyData.id}`;
  if (withinCooldown(cooldownKey, config.alerts.rateLimitAlertCooldownMs)) return;

  try {
    const userResult = await pool.query('SELECT email, first_name FROM users WHERE id = $1', [keyData.user_id]);
    if (userResult.rows.length === 0) return;
    const user = userResult.rows[0];

    const apiResult = await pool.query('SELECT name FROM apis WHERE id = $1', [keyData.api_id]);
    const apiName = apiResult.rows.length > 0 ? apiResult.rows[0].name : 'Unknown API';

    await sendEmail({
      to: user.email,
      template: 'rate-limit-exceeded',
      data: {
        firstName: user.first_name,
        apiName,
        keyName: keyData.name,
        currentUsage,
        rateLimit: keyData.rate_limit,
        timestamp: new Date().toISOString()
      }
    });

    logger.info('Rate limit exceeded alert sent', {
      keyId: keyData.id,
      currentUsage
    });
  } catch (error) {
    logger.error('Failed to send rate limit alert:', error.message);
  }
};

/**
 * Generic security alert (email only when user settings allow; no-op otherwise).
 * Cooldown-throttled per subject + user so a burst of blocked requests
 * (WAF, circuit trips) does not spam the inbox.
 */
const notifySecurityAlert = async (userId, subject, details) => {
  if (!config.alerts.securityAlertEmail) return;

  const cooldownKey = `sec:${userId}:${subject}`;
  if (withinCooldown(cooldownKey, config.alerts.securityAlertCooldownMs)) return;

  try {
    const userResult = await pool.query(
      "SELECT email, first_name, COALESCE(settings, '{}'::jsonb) AS settings FROM users WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) return;
    const user = userResult.rows[0];

    const notifications = user.settings?.notifications;
    if (notifications && notifications.emailOnSecurityAlert === false) return;

    await sendEmail({
      to: user.email,
      subject,
      html: `
        <h3>${subject}</h3>
        <pre style="background:#f5f5f5;padding:16px;border-radius:6px;font-size:13px;">${JSON.stringify(details, null, 2)}</pre>
        <p>If you did not perform this action, review your account security immediately.</p>
      `
    });

    logger.info('Security alert sent', { userId, subject });
  } catch (error) {
    logger.error('Failed to send security alert:', error.message);
  }
};

module.exports = { notifyRateLimitExceeded, notifySecurityAlert };

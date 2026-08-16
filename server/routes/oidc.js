const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const config = require('../config/env');
const logger = require('../utils/logger');
const { audit } = require('../utils/audit');

const router = express.Router();

// ---------------------------------------------------------------------------
// OIDC discovery cache + PKCE state store
// ---------------------------------------------------------------------------
let discoveryCache = { at: 0, endpoints: null };
const pendingStates = new Map(); // state -> { verifier, redirectUri, createdAt }

const DISCOVERY_TTL = 60 * 60 * 1000; // 1 hour

const getDiscovery = async () => {
  if (discoveryCache.endpoints && Date.now() - discoveryCache.at < DISCOVERY_TTL) {
    return discoveryCache.endpoints;
  }
  const issuer = config.oidc.issuer.replace(/\/+$/, '');
  const res = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) {
    throw new Error(`OIDC discovery failed with HTTP ${res.status}`);
  }
  const doc = await res.json();
  discoveryCache = {
    at: Date.now(),
    endpoints: {
      authorizationEndpoint: doc.authorization_endpoint,
      tokenEndpoint: doc.token_endpoint,
      userinfoEndpoint: doc.userinfo_endpoint
    }
  };
  return discoveryCache.endpoints;
};

const requireOidc = (req, res, next) => {
  if (!config.oidc.enabled || !config.oidc.issuer || !config.oidc.clientId || !config.oidc.clientSecret || !config.oidc.redirectUri) {
    return res.status(404).json({ success: false, message: 'OIDC is not configured' });
  }
  next();
};

/**
 * @openapi
 * /api/auth/oidc/authorize:
 *   get:
 *     summary: Start the OIDC authorization flow (redirects to the provider)
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirect to the IdP authorization endpoint (PKCE)
 */
router.get('/oidc/authorize', requireOidc, async (req, res) => {
  try {
    const endpoints = await getDiscovery();

    // PKCE S256
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    pendingStates.set(state, {
      verifier,
      redirectUri: config.oidc.redirectUri,
      createdAt: Date.now()
    });
    // Expire stale states
    for (const [key, value] of pendingStates) {
      if (Date.now() - value.createdAt > 10 * 60 * 1000) pendingStates.delete(key);
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.oidc.clientId,
      redirect_uri: config.oidc.redirectUri,
      scope: config.oidc.scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });

    res.redirect(`${endpoints.authorizationEndpoint}?${params.toString()}`);
  } catch (error) {
    logger.error('OIDC authorize error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to start OIDC flow' });
  }
});

/**
 * @openapi
 * /api/auth/oidc/callback:
 *   get:
 *     summary: OIDC callback — exchanges the code, links the user, issues JWTs
 *     tags: [Authentication]
 *     parameters:
 *       - { name: code, in: query, required: true, schema: { type: string } }
 *       - { name: state, in: query, required: true, schema: { type: string } }
 *     responses:
 *       302:
 *         description: Redirect to the frontend with tokens in the URL fragment
 *       400:
 *         description: Invalid or expired state
 */
router.get('/oidc/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).json({ success: false, message: 'Missing code or state' });
    }

    const pending = pendingStates.get(state);
    if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OIDC state' });
    }
    pendingStates.delete(state);

    const endpoints = await getDiscovery();

    // Exchange the authorization code (PKCE)
    const tokenRes = await fetch(endpoints.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: pending.redirectUri,
        client_id: config.oidc.clientId,
        client_secret: config.oidc.clientSecret,
        code_verifier: pending.verifier
      })
    });
    if (!tokenRes.ok) {
      logger.logSecurityEvent('OIDC_TOKEN_EXCHANGE_FAILED', { status: tokenRes.status });
      return res.status(401).json({ success: false, message: 'OIDC token exchange failed' });
    }
    const tokens = await tokenRes.json();
    const accessToken = tokens.access_token;
    if (!accessToken) {
      return res.status(401).json({ success: false, message: 'No access token returned by provider' });
    }

    // Fetch the user's profile (userinfo endpoint)
    const userinfoRes = await fetch(endpoints.userinfoEndpoint, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!userinfoRes.ok) {
      return res.status(401).json({ success: false, message: 'Failed to fetch user profile' });
    }
    const profile = await userinfoRes.json();

    const email = (profile.email || '').toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: 'Provider did not return an email address' });
    }

    // Upsert the user, linking by OAuth subject when possible, else by email
    let userResult = await pool.query(
      'SELECT id, email FROM users WHERE oauth_provider = $1 AND oauth_subject = $2',
      [config.oidc.issuer, String(profile.sub)]
    );
    let user;
    if (userResult.rows.length > 0) {
      user = userResult.rows[0];
    } else {
      userResult = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
      if (userResult.rows.length > 0) {
        user = userResult.rows[0];
        // Link the OAuth identity to the existing account
        await pool.query(
          'UPDATE users SET oauth_provider = $1, oauth_subject = $2, oauth_email_verified = $3, is_email_verified = TRUE WHERE id = $4',
          [config.oidc.issuer, String(profile.sub), profile.email_verified !== false, user.id]
        );
      } else {
        // Create the account (password is unusable — the user signs in via OIDC)
        const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        const insertResult = await pool.query(
          `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified, oauth_provider, oauth_subject, oauth_email_verified)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, email`,
          [email, passwordHash, profile.given_name || profile.firstName || null, profile.family_name || profile.lastName || null, true, config.oidc.issuer, String(profile.sub), profile.email_verified !== false]
        );
        user = insertResult.rows[0];
      }
    }

    // Issue our own JWT pair (isolated secrets, family rotation — same as password login)
    const { generateTokens } = require('./auth');
    const tokens_ = generateTokens(user.id);

    await audit({
      userId: user.id,
      action: 'USER_OIDC_LOGIN',
      resourceType: 'user',
      resourceId: user.id,
      details: { provider: config.oidc.issuer, email },
      req
    });

    const frontendUrl = config.frontendUrl.replace(/\/+$/, '');
    res.redirect(
      `${frontendUrl}/oidc/callback#access_token=${encodeURIComponent(tokens_.accessToken)}&refresh_token=${encodeURIComponent(tokens_.refreshToken)}`
    );
  } catch (error) {
    logger.error('OIDC callback error:', error.message);
    res.status(500).json({ success: false, message: 'OIDC callback failed' });
  }
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');
const { generateSecureToken } = require('../utils/crypto');
const config = require('../config/env');
const {
  blacklistToken,
  setRefreshTokenFamily,
  getRefreshTokenFamily,
  revokeRefreshTokenFamily
} = require('../config/redis');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

// JWT Secret Resolution — separate secrets for access & refresh tokens
// to prevent cross-purpose token abuse
const getAccessSecret = () => config.jwt.accessSecret;

const getRefreshSecret = () => config.jwt.refreshSecret;

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 attempts per window
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 registrations per hour per IP
  message: {
    success: false,
    message: 'Too many registration attempts, please try again later'
  }
});

// Validation rules
// Password policy is consistent with reset-password: 8+ chars with upper,
// lower, digit, and special character.
const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

const registerValidation = [
  body('email').isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(PASSWORD_POLICY).withMessage('Password must include uppercase, lowercase, number, and special character'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required')
];

const loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate JWT access + refresh token pair with type isolation.
 * 
 * Security:
 * - Access tokens signed with JWT_ACCESS_SECRET, claim { type: 'access' }
 * - Refresh tokens signed with JWT_REFRESH_SECRET, claim { type: 'refresh' }
 * - Each refresh token belongs to a "family" for rotation detection
 * - JTI (JWT ID) enables individual token blacklisting
 */
const generateTokens = (userId, familyId = uuidv4()) => {
  const accessJti = uuidv4();
  const refreshJti = uuidv4();

  const accessToken = jwt.sign(
    { id: userId, type: 'access', jti: accessJti },
    getAccessSecret(),
    { expiresIn: config.jwt.accessExpiresIn }
  );

  const refreshToken = jwt.sign(
    { id: userId, type: 'refresh', jti: refreshJti, family: familyId },
    getRefreshSecret(),
    { expiresIn: config.jwt.refreshExpiresIn }
  );

  // Store refresh token family in Redis for rotation tracking
  // TTL = 30 days in seconds
  const refreshTtl = 30 * 24 * 60 * 60;
  setRefreshTokenFamily(familyId, refreshJti, refreshTtl).catch(err => {
    logger.error('Failed to store refresh token family:', err);
  });

  return { accessToken, refreshToken, familyId };
};

const logAuditEvent = async (userId, action, details = {}, req) => {
  try {
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource_type, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    
    await pool.query(auditQuery, [
      userId,
      action,
      'user',
      JSON.stringify(details),
      req.ip,
      req.get('User-Agent')
    ]);
  } catch (error) {
    logger.error('Failed to log audit event:', error);
  }
};

// ============================================================================
// REGISTER ENDPOINT
// ============================================================================

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new user account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 */
router.post('/register', registerLimiter, registerValidation, async (req, res) => {
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

    const { email, password, firstName, lastName } = req.body;

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Hash password
    const saltRounds = config.security.bcryptRounds;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Check if email verification should be skipped (dev convenience)
    const skipVerification = config.security.skipEmailVerification;

    // Create user
    const userQuery = `
      INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, first_name, last_name, created_at
    `;
    
    const userResult = await pool.query(userQuery, [
      email, passwordHash, firstName, lastName, skipVerification
    ]);
    const user = userResult.rows[0];

    // Generate and send email verification token (unless skipped)
    if (!skipVerification) {
      try {
        const verificationToken = uuidv4();
        const tokenHash = await bcrypt.hash(verificationToken, 10);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await pool.query(
          'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
          [user.id, tokenHash, expiresAt]
        );

        await sendEmail({
          to: email,
          subject: 'Verify your API Guardian account',
          template: 'email-verification',
          data: {
            firstName,
            verificationUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`
          }
        });
      } catch (emailError) {
        logger.error('Failed to send verification email:', emailError);
        // Don't fail registration if email fails — user can request resend
      }
    }

    // Log audit event
    await logAuditEvent(user.id, 'USER_REGISTERED', { email }, req);

    logger.info('User registered successfully', { userId: user.id, email });

    const message = skipVerification
      ? 'User registered successfully.'
      : 'User registered successfully. Please check your email to verify your account.';

    res.status(201).json({
      success: true,
      message,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          createdAt: user.created_at
        }
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

// ============================================================================
// LOGIN ENDPOINT
// ============================================================================

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Log in and receive access + refresh tokens
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               twoFactorCode: { type: string, description: Required if 2FA is enabled }
 *     responses:
 *       200:
 *         description: Login successful (or 2FA required)
 *       401:
 *         description: Invalid credentials
 *       423:
 *         description: Account locked
 */
router.post('/login', authLimiter, loginValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password, twoFactorCode } = req.body;

    // Get user
    const userQuery = `
      SELECT id, email, password_hash, first_name, last_name, 
             two_fa_enabled, two_fa_secret, failed_login_attempts, 
             locked_until, last_login, is_email_verified
      FROM users WHERE email = $1
    `;
    
    const userResult = await pool.query(userQuery, [email]);
    
    if (userResult.rows.length === 0) {
      logger.logSecurityEvent('LOGIN_FAILED', { email, reason: 'user_not_found', ip: req.ip });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = userResult.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      logger.logSecurityEvent('LOGIN_BLOCKED', { email, reason: 'account_locked', ip: req.ip });
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to multiple failed login attempts'
      });
    }

    // Check email verification (with env bypass for development)
    const skipVerification = config.security.skipEmailVerification;
    if (!skipVerification && !user.is_email_verified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address before logging in'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      // Increment failed attempts
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      const maxAttempts = config.security.maxLoginAttempts;
      const lockoutTime = config.security.lockoutTimeMs;

      let lockedUntil = null;
      if (failedAttempts >= maxAttempts) {
        lockedUntil = new Date(Date.now() + lockoutTime);
      }

      await pool.query(
        'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
        [failedAttempts, lockedUntil, user.id]
      );

      logger.logSecurityEvent('LOGIN_FAILED', { 
        email, 
        reason: 'invalid_password', 
        failedAttempts,
        ip: req.ip 
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check 2FA if enabled
    if (user.two_fa_enabled) {
      if (!twoFactorCode) {
        return res.status(200).json({
          success: true,
          requiresTwoFactor: true,
          message: 'Two-factor authentication required'
        });
      }

      const verified = speakeasy.totp.verify({
        secret: user.two_fa_secret,
        encoding: 'base32',
        token: twoFactorCode,
        window: parseInt(process.env.TWO_FA_WINDOW) || 1
      });

      if (!verified) {
        logger.logSecurityEvent('TWO_FA_FAILED', { email, ip: req.ip });
        return res.status(401).json({
          success: false,
          message: 'Invalid two-factor authentication code'
        });
      }
    }

    // Successful login - reset failed attempts and update last login
    await pool.query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Generate tokens (with type isolation & family tracking)
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Log audit event
    await logAuditEvent(user.id, 'USER_LOGIN', { email }, req);

    logger.info('User logged in successfully', { userId: user.id, email });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          twoFactorEnabled: user.two_fa_enabled,
          lastLogin: user.last_login
        },
        tokens: {
          accessToken,
          refreshToken
        }
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

// ============================================================================
// EMAIL VERIFICATION ENDPOINT
// ============================================================================

const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Too many verification attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/verify-email', verifyEmailLimiter, async (req, res) => {
  try {
    const { token, email } = req.body;

    if (!token || !email) {
      return res.status(400).json({
        success: false,
        message: 'Token and email are required'
      });
    }

    // Get user
    const userQuery = 'SELECT id FROM users WHERE email = $1 AND is_email_verified = FALSE';
    const userResult = await pool.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification request'
      });
    }

    const user = userResult.rows[0];

    // Get verification token
    const tokenQuery = `
      SELECT id, token_hash, expires_at, used 
      FROM email_verification_tokens 
      WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP AND used = FALSE
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const tokenResult = await pool.query(tokenQuery, [user.id]);

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    const tokenRecord = tokenResult.rows[0];
    const isTokenValid = await bcrypt.compare(token, tokenRecord.token_hash);

    if (!isTokenValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token'
      });
    }

    // Mark email as verified and token as used
    await pool.query('BEGIN');
    
    await pool.query(
      'UPDATE users SET is_email_verified = TRUE WHERE id = $1',
      [user.id]
    );
    
    await pool.query(
      'UPDATE email_verification_tokens SET used = TRUE WHERE id = $1',
      [tokenRecord.id]
    );
    
    await pool.query('COMMIT');

    logger.info('Email verified successfully', { userId: user.id, email });

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    logger.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Email verification failed'
    });
  }
});

// ============================================================================
// RESEND VERIFICATION EMAIL
// ============================================================================

router.post('/resend-verification', [
  body('email').isEmail().normalizeEmail()
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

    const { email } = req.body;

    const userQuery = 'SELECT id, first_name FROM users WHERE email = $1 AND is_email_verified = FALSE';
    const userResult = await pool.query(userQuery, [email]);

    // Always return success to prevent user enumeration
    if (userResult.rows.length === 0) {
      return res.json({
        success: true,
        message: 'If the email exists and is unverified, a verification email has been sent.'
      });
    }

    const user = userResult.rows[0];

    // Invalidate any existing tokens
    await pool.query(
      'UPDATE email_verification_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE',
      [user.id]
    );

    // Generate new token
    const verificationToken = uuidv4();
    const tokenHash = await bcrypt.hash(verificationToken, 10);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await pool.query(
      'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    try {
      await sendEmail({
        to: email,
        subject: 'Verify your API Guardian account',
        template: 'email-verification',
        data: {
          firstName: user.first_name,
          verificationUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`
        }
      });
    } catch (emailError) {
      logger.error('Failed to resend verification email:', emailError);
    }

    res.json({
      success: true,
      message: 'If the email exists and is unverified, a verification email has been sent.'
    });

  } catch (error) {
    logger.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification email'
    });
  }
});

// ============================================================================
// 2FA SETUP, ENABLE, DISABLE
// ============================================================================

router.post('/setup-2fa', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const userQuery = 'SELECT two_fa_enabled FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [userId]);
    
    if (userResult.rows[0].two_fa_enabled) {
      return res.status(400).json({
        success: false,
        message: 'Two-factor authentication is already enabled'
      });
    }

    const secret = speakeasy.generateSecret({
      name: `API Guardian (${req.user.email})`,
      issuer: process.env.TWO_FA_ISSUER || 'API Guardian'
    });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      success: true,
      data: {
        secret: secret.base32,
        qrCode: qrCodeUrl,
        manualEntryKey: secret.base32
      }
    });

  } catch (error) {
    logger.error('2FA setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to setup two-factor authentication'
    });
  }
});

router.post('/enable-2fa', authenticateToken, async (req, res) => {
  try {
    const { secret, token } = req.body;
    const userId = req.user.id;

    if (!secret || !token) {
      return res.status(400).json({
        success: false,
        message: 'Secret and token are required'
      });
    }

    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 1
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid authentication code'
      });
    }

    await pool.query(
      'UPDATE users SET two_fa_enabled = TRUE, two_fa_secret = $1 WHERE id = $2',
      [secret, userId]
    );

    await logAuditEvent(userId, 'TWO_FA_ENABLED', {}, req);
    logger.info('2FA enabled successfully', { userId });

    res.json({
      success: true,
      message: 'Two-factor authentication enabled successfully'
    });

  } catch (error) {
    logger.error('2FA enable error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enable two-factor authentication'
    });
  }
});

router.post('/disable-2fa', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Authentication code is required'
      });
    }

    const userQuery = 'SELECT two_fa_secret FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [userId]);
    
    if (!userResult.rows[0].two_fa_secret) {
      return res.status(400).json({
        success: false,
        message: 'Two-factor authentication is not enabled'
      });
    }

    const verified = speakeasy.totp.verify({
      secret: userResult.rows[0].two_fa_secret,
      encoding: 'base32',
      token: token,
      window: 1
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid authentication code'
      });
    }

    await pool.query(
      'UPDATE users SET two_fa_enabled = FALSE, two_fa_secret = NULL WHERE id = $1',
      [userId]
    );

    await logAuditEvent(userId, 'TWO_FA_DISABLED', {}, req);
    logger.info('2FA disabled successfully', { userId });

    res.json({
      success: true,
      message: 'Two-factor authentication disabled successfully'
    });

  } catch (error) {
    logger.error('2FA disable error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disable two-factor authentication'
    });
  }
});

// ============================================================================
// LOGOUT ENDPOINT
// ============================================================================

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Blacklist the current access token to prevent reuse after logout
    if (req.tokenJti) {
      const tokenExp = req.tokenExp || Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
      const ttl = Math.max(0, tokenExp - Math.floor(Date.now() / 1000));
      await blacklistToken(req.tokenJti, ttl);
    }

    await logAuditEvent(userId, 'USER_LOGOUT', {}, req);
    logger.info('User logged out successfully', { userId });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// ============================================================================
// GET CURRENT USER
// ============================================================================

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Get the currently authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Missing or invalid token
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userQuery = `
      SELECT id, email, first_name, last_name, two_fa_enabled, 
             is_email_verified, last_login, created_at
      FROM users WHERE id = $1
    `;
    
    const userResult = await pool.query(userQuery, [req.user.id]);
    
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
          createdAt: user.created_at
        }
      }
    });

  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user information'
    });
  }
});

// ============================================================================
// FORGOT PASSWORD
// ============================================================================

router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
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

    const { email } = req.body;

    const userQuery = 'SELECT id, first_name, email FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      // Return 200 for security — prevent user enumeration
      return res.status(200).json({
        success: true,
        message: 'If the email exists in our system, password reset instructions have been sent.'
      });
    }

    const user = userResult.rows[0];
    const resetToken = uuidv4();
    const tokenHash = await bcrypt.hash(resetToken, 10);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    try {
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
      await sendEmail({
        to: email,
        template: 'password-reset',
        data: {
          firstName: user.first_name,
          resetUrl
        }
      });
    } catch (emailError) {
      logger.error('Failed to send password reset email:', emailError);
    }

    await logAuditEvent(user.id, 'PASSWORD_RESET_REQUESTED', { email }, req);

    res.status(200).json({
      success: true,
      message: 'Password reset instructions have been sent to your email address.'
    });

  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request'
    });
  }
});

// ============================================================================
// RESET PASSWORD
// ============================================================================

router.post('/reset-password', [
  body('email').isEmail().normalizeEmail(),
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
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

    const { email, token, password } = req.body;

    const userQuery = 'SELECT id FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token'
      });
    }

    const user = userResult.rows[0];

    const tokenQuery = `
      SELECT id, token_hash, expires_at, used
      FROM password_reset_tokens
      WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP AND used = FALSE
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const tokenResult = await pool.query(tokenQuery, [user.id]);

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token'
      });
    }

    const tokenRecord = tokenResult.rows[0];
    const isTokenValid = await bcrypt.compare(token, tokenRecord.token_hash);

    if (!isTokenValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token'
      });
    }

    const saltRounds = config.security.bcryptRounds;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    await pool.query('BEGIN');

    await pool.query(
      'UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, user.id]
    );

    await pool.query(
      'UPDATE password_reset_tokens SET used = TRUE WHERE id = $1',
      [tokenRecord.id]
    );

    await pool.query('COMMIT');

    await logAuditEvent(user.id, 'PASSWORD_RESET_SUCCESSFUL', { email }, req);
    logger.info('Password reset successfully', { userId: user.id, email });

    res.json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    logger.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

// ============================================================================
// REFRESH TOKEN — With Family Rotation & Stolen Token Detection
// ============================================================================

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many refresh attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     summary: Rotate a refresh token and receive a new token pair
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: Tokens refreshed
 *       401:
 *         description: Invalid/expired refresh token or replay detected
 */
router.post('/refresh', refreshLimiter, [
  body('refreshToken').notEmpty()
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

    const { refreshToken } = req.body;

    // Verify with REFRESH secret (not access secret)
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, getRefreshSecret());
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Refresh token expired or invalid'
        });
      }
      throw err;
    }

    // Enforce token type claim — reject access tokens used as refresh tokens
    if (decoded.type !== 'refresh') {
      logger.logSecurityEvent('TOKEN_TYPE_MISMATCH', {
        userId: decoded.id,
        expectedType: 'refresh',
        actualType: decoded.type,
        ip: req.ip
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid token type'
      });
    }

    // Check if this specific token is blacklisted
    const { isTokenBlacklisted, revokeRefreshTokenFamily } = require('../config/redis');
    if (decoded.jti && await isTokenBlacklisted(decoded.jti)) {
      logger.logSecurityEvent('BLACKLISTED_TOKEN_REUSE', {
        userId: decoded.id,
        jti: decoded.jti,
        ip: req.ip
      });

      // Reuse of a consumed token is a replay signal — revoke the whole family
      // so the freshly rotated token dies too (consistent with the family check).
      if (decoded.family) {
        await revokeRefreshTokenFamily(decoded.family);
      }

      require('../utils/audit').audit({
        userId: decoded.id,
        action: 'SECURITY_BLACKLISTED_TOKEN_REUSE',
        resourceType: 'auth',
        details: { jti: decoded.jti, ip: req.ip },
        req
      });

      return res.status(401).json({
        success: false,
        message: 'Token has been revoked'
      });
    }

    // Refresh token family rotation check
    if (decoded.family && decoded.jti) {
      const currentValidJti = await getRefreshTokenFamily(decoded.family);

      if (currentValidJti && currentValidJti !== decoded.jti) {
        // STOLEN TOKEN DETECTED! This JTI was already rotated out.
        // An attacker is replaying an old refresh token.
        // Revoke the entire family to protect the user.
        logger.logSecurityEvent('REFRESH_TOKEN_REPLAY_ATTACK', {
          userId: decoded.id,
          familyId: decoded.family,
          replayedJti: decoded.jti,
          currentValidJti,
          ip: req.ip
        });

        await revokeRefreshTokenFamily(decoded.family);

        require('../utils/audit').audit({
          userId: decoded.id,
          action: 'SECURITY_REFRESH_TOKEN_REPLAY',
          resourceType: 'auth',
          details: { familyId: decoded.family, replayedJti: decoded.jti, ip: req.ip },
          req
        });

        return res.status(401).json({
          success: false,
          message: 'Suspicious token reuse detected. All sessions have been revoked for security.'
        });
      }
    }

    // Verify user still exists
    const userQuery = 'SELECT id, email FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [decoded.id]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User session invalid'
      });
    }

    const user = userResult.rows[0];

    // Blacklist the old refresh token (it's now consumed)
    if (decoded.jti) {
      const ttl = decoded.exp ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000)) : 2592000;
      await blacklistToken(decoded.jti, ttl);
    }

    // Rotate WITHIN the same family: the new refresh token carries the old
    // family ID with a fresh JTI, so replaying the consumed token is detected
    // (getRefreshTokenFamily returns the new JTI != replayed JTI).
    const tokens = generateTokens(user.id, decoded.family);

    res.json({
      success: true,
      message: 'Tokens refreshed successfully',
      data: {
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      }
    });

  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
});

module.exports = router;
module.exports.generateTokens = generateTokens;

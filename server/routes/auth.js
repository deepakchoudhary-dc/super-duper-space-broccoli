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
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiting for auth endpoints (relaxed for development)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 attempts per window (increased for development)
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 20 registrations per hour per IP (increased for development)
  message: {
    success: false,
    message: 'Too many registration attempts, please try again later'
  }
});

// Validation rules
const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
  body('firstName').trim().isLength({ min: 1, max: 100 }),
  body('lastName').trim().isLength({ min: 1, max: 100 })
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
];

// Helper functions
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
  
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  });
  
  return { accessToken, refreshToken };
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

// Register endpoint
router.post('/register', registerLimiter, registerValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
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
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);    // Create user - TEMPORARILY SET EMAIL AS VERIFIED FOR TESTING
    const userQuery = `
      INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified)
      VALUES ($1, $2, $3, $4, TRUE)
      RETURNING id, email, first_name, last_name, created_at
    `;
    
    const userResult = await pool.query(userQuery, [email, passwordHash, firstName, lastName]);
    const user = userResult.rows[0];    // Generate email verification token - TEMPORARILY DISABLED FOR TESTING
    // const verificationToken = uuidv4();
    // const tokenHash = await bcrypt.hash(verificationToken, 10);
    // const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // await pool.query(
    //   'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    //   [user.id, tokenHash, expiresAt]
    // );

    // Send verification email - TEMPORARILY DISABLED FOR TESTING
    // try {
    //   await sendEmail({
    //     to: email,
    //     subject: 'Verify your API Guardian account',
    //     template: 'email-verification',
    //     data: {
    //       firstName,
    //       verificationUrl: `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`
    //     }
    //   });
    // } catch (emailError) {
    //   logger.error('Failed to send verification email:', emailError);
    // }

    // Log audit event
    await logAuditEvent(user.id, 'USER_REGISTERED', { email }, req);

    logger.info('User registered successfully', { userId: user.id, email });    res.status(201).json({
      success: true,
      message: 'User registered successfully. Email verification temporarily disabled for testing.',
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

// Login endpoint
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
    }    // Check email verification - TEMPORARILY DISABLED FOR TESTING
    // if (!user.is_email_verified) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Please verify your email address before logging in'
    //   });
    // }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      // Increment failed attempts
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
      const lockoutTime = parseInt(process.env.LOCKOUT_TIME) || 15 * 60 * 1000; // 15 minutes

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

    // Generate tokens
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

// Email verification endpoint
router.post('/verify-email', async (req, res) => {
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

// Setup 2FA endpoint
router.post('/setup-2fa', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if 2FA is already enabled
    const userQuery = 'SELECT two_fa_enabled FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [userId]);
    
    if (userResult.rows[0].two_fa_enabled) {
      return res.status(400).json({
        success: false,
        message: 'Two-factor authentication is already enabled'
      });
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `API Guardian (${req.user.email})`,
      issuer: process.env.TWO_FA_ISSUER || 'API Guardian'
    });

    // Generate QR code
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

// Enable 2FA endpoint
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

    // Verify the token
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

    // Enable 2FA
    await pool.query(
      'UPDATE users SET two_fa_enabled = TRUE, two_fa_secret = $1 WHERE id = $2',
      [secret, userId]
    );

    // Log audit event
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

// Disable 2FA endpoint
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

    // Get user's secret
    const userQuery = 'SELECT two_fa_secret FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [userId]);
    
    if (!userResult.rows[0].two_fa_secret) {
      return res.status(400).json({
        success: false,
        message: 'Two-factor authentication is not enabled'
      });
    }

    // Verify the token
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

    // Disable 2FA
    await pool.query(
      'UPDATE users SET two_fa_enabled = FALSE, two_fa_secret = NULL WHERE id = $1',
      [userId]
    );

    // Log audit event
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

// Logout endpoint
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Log audit event
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

// Get current user
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

// Forgot password endpoint
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

    // Check if user exists
    const userQuery = 'SELECT id, first_name, email FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      // Return 200/success for security reasons to prevent user enumeration
      return res.status(200).json({
        success: true,
        message: 'If the email exists in our system, password reset instructions have been sent.'
      });
    }

    const user = userResult.rows[0];
    const resetToken = uuidv4();
    const tokenHash = await bcrypt.hash(resetToken, 10);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save token to database
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    // Send reset email
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

    // Log audit event
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

// Reset password endpoint
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

    // Get user
    const userQuery = 'SELECT id FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token'
      });
    }

    const user = userResult.rows[0];

    // Get valid reset token
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

    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Update password and mark token as used
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

    // Log audit event
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

// Refresh token endpoint
router.post('/refresh', [
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

    // Verify token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    // Verify user exists and check if active
    const userQuery = 'SELECT id, email FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [decoded.id]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User session invalid'
      });
    }

    const user = userResult.rows[0];

    // Generate new token pair
    const tokens = generateTokens(user.id);

    res.json({
      success: true,
      message: 'Tokens refreshed successfully',
      data: {
        tokens
      }
    });

  } catch (error) {
    logger.error('Refresh token error:', error);
    
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token expired or invalid'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
});

module.exports = router;

const logger = require('../utils/logger');

/**
 * Global error handler middleware.
 * 
 * Security:
 * - NEVER leaks stack traces or internal error details in production
 * - Logs full error context to Winston for forensic analysis
 * - Returns sanitized, generic error messages to clients
 */
const errorHandler = (err, req, res, next) => {
  // Log full error details for internal forensics
  logger.error('Error Handler:', {
    requestId: req.requestId,
    error: err.message,
    stack: err.stack,
    code: err.code,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  const isProduction = process.env.NODE_ENV === 'production';

  // Determine error response
  let statusCode = err.statusCode || 500;
  let message = 'Internal server error';

  // PostgreSQL errors
  if (err.code === '23505') { // Unique violation
    statusCode = 400;
    message = 'Duplicate entry';
  } else if (err.code === '23503') { // Foreign key violation
    statusCode = 400;
    message = 'Referenced resource not found';
  } else if (err.code === '23502') { // Not null violation
    statusCode = 400;
    message = 'Required field missing';
  } else if (err.code === '42601' || err.code === '42P01') { // Syntax error / undefined table
    statusCode = 500;
    message = 'Internal server error';
  }

  // JWT errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Validation errors
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = isProduction ? 'Validation failed' : err.message;
  }

  // Request size errors
  else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request entity too large';
  }

  // JSON parse errors
  else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON in request body';
  }

  // Known error with explicit message (non-production)
  else if (err.message && !isProduction) {
    message = err.message;
  }

  // Build response
  const response = {
    success: false,
    message
  };

  // In development, include debug info (NEVER in production)
  if (!isProduction) {
    response.error = err.message;
    response.stack = err.stack;
  }

  // Add request ID for correlation
  if (req.requestId) {
    response.requestId = req.requestId;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;

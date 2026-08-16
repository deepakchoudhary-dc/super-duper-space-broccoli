const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');

// Custom format for logs
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create transports
const transports = [];

// Console transport for development
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.LOG_LEVEL || 'info'
    })
  );
}

// File transports for all environments
transports.push(
  // All logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: logFormat,
    level: 'info'
  }),
  
  // Error logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    format: logFormat,
    level: 'error'
  }),
  
  // API usage logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'api-usage-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '100m',
    maxFiles: '90d',
    format: logFormat,
    level: 'info'
  })
);

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports,
  exitOnError: false
});

// Create specialized loggers
const apiUsageLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'api-usage-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '100m',
      maxFiles: '90d',
      format: logFormat
    })
  ],
  exitOnError: false
});

const securityLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'security-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '365d',
      format: logFormat
    })
  ],
  exitOnError: false
});

// Helper functions
const logApiUsage = (data) => {
  apiUsageLogger.info('API_USAGE', data);
};

const logSecurityEvent = (event, data) => {
  securityLogger.warn(`SECURITY_${event}`, data);
  logger.warn(`Security Event - ${event}`, data);
};

const logError = (error, context = {}) => {
  logger.error('Application Error', {
    error: error.message,
    stack: error.stack,
    ...context
  });
};

const logInfo = (message, data = {}) => {
  logger.info(message, data);
};

const logWarn = (message, data = {}) => {
  logger.warn(message, data);
};

const logDebug = (message, data = {}) => {
  logger.debug(message, data);
};

// Handle uncaught exceptions and rejections
logger.exceptions.handle(
  new DailyRotateFile({
    filename: path.join(logsDir, 'exceptions-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    format: logFormat
  })
);

logger.rejections.handle(
  new DailyRotateFile({
    filename: path.join(logsDir, 'rejections-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    format: logFormat
  })
);

// ---------------------------------------------------------------------------
// The main export is the winston logger itself (so `logger.info(...)` works),
// with specialized helper methods attached for API usage + security events.
// ---------------------------------------------------------------------------
module.exports = logger;
module.exports.apiUsageLogger = apiUsageLogger;
module.exports.securityLogger = securityLogger;
module.exports.logApiUsage = logApiUsage;
module.exports.logSecurityEvent = logSecurityEvent;
module.exports.logError = logError;
module.exports.logInfo = logInfo;
module.exports.logWarn = logWarn;
module.exports.logDebug = logDebug;

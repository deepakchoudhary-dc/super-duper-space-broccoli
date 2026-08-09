const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'api_guardian',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const connectDB = async () => {
  try {
    const client = await pool.connect();
    logger.info('PostgreSQL connected successfully');
    client.release();
    
    // Create tables if they don't exist
    await createTables();
  } catch (error) {
    logger.error('PostgreSQL connection failed:', error);
    throw error;
  }
};

const createTables = async () => {
  const schemaStatements = [
    // 1. Core tables
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      is_email_verified BOOLEAN DEFAULT FALSE,
      two_fa_enabled BOOLEAN DEFAULT FALSE,
      two_fa_secret VARCHAR(255),
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until TIMESTAMP,
      last_login TIMESTAMP,
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS apis (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      base_url VARCHAR(255) NOT NULL,
      version VARCHAR(50) DEFAULT '1.0.0',
      status VARCHAR(20) DEFAULT 'active',
      documentation_url VARCHAR(255),
      webhook_url VARCHAR(255),
      is_public BOOLEAN DEFAULT FALSE,
      auth_required BOOLEAN DEFAULT TRUE,
      rate_limit INTEGER DEFAULT 1000,
      rate_limit_window INTEGER DEFAULT 3600,
      category VARCHAR(50) DEFAULT 'REST',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    )`,

    `CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      api_id UUID NOT NULL REFERENCES apis(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key_hash VARCHAR(255) NOT NULL UNIQUE,
      key_prefix VARCHAR(20) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      permissions JSONB DEFAULT '{}',
      rate_limit INTEGER DEFAULT 1000,
      rate_limit_window INTEGER DEFAULT 3600,
      status VARCHAR(20) DEFAULT 'active',
      expires_at TIMESTAMP,
      last_used TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS api_usage_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      api_id UUID REFERENCES apis(id) ON DELETE CASCADE,
      api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      method VARCHAR(10) NOT NULL,
      endpoint VARCHAR(255) NOT NULL,
      status_code INTEGER NOT NULL,
      response_time INTEGER NOT NULL,
      request_size INTEGER DEFAULT 0,
      response_size INTEGER DEFAULT 0,
      ip_address INET,
      user_agent TEXT,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(50) NOT NULL,
      resource_id UUID,
      details JSONB DEFAULT '{}',
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // 2. Schema Migrations (Ensure columns exist for pre-existing tables)
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_enabled BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_secret VARCHAR(255)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP`,
    `ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_hash VARCHAR(255)`,
    `ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(20)`,

    // 3. Performance Indexes
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_apis_user_id ON apis(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_api_id ON api_keys(api_id)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_api_usage_logs_api_id ON api_usage_logs(api_id)`,
    `CREATE INDEX IF NOT EXISTS idx_api_usage_logs_api_key_id ON api_usage_logs(api_key_id)`,
    `CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`,

    // 4. Trigger function
    `CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql'`,

    // 5. Triggers (Drop and recreate to be idempotent)
    `DROP TRIGGER IF EXISTS update_users_updated_at ON users`,
    `CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`,

    `DROP TRIGGER IF EXISTS update_apis_updated_at ON apis`,
    `CREATE TRIGGER update_apis_updated_at BEFORE UPDATE ON apis
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`,

    `DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys`,
    `CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`
  ];

  for (const sql of schemaStatements) {
    try {
      await pool.query(sql);
    } catch (err) {
      logger.warn(`Schema setup note for query [${sql.slice(0, 40)}...]: ${err.message}`);
    }
  }
  logger.info('Database tables and schema verified successfully');
};

module.exports = {
  pool,
  connectDB
};

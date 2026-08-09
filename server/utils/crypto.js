/**
 * Cryptographic Utilities for API Guardian
 * 
 * Provides SHA-256 key hashing, constant-time verification,
 * and secure API key generation with structured prefixes.
 * 
 * Security Design:
 * - API keys are NEVER stored in plaintext
 * - key_hash column stores SHA-256(raw_key) 
 * - key_prefix stores the first visible segment for lookup/display
 * - Verification uses crypto.timingSafeEqual to prevent timing attacks
 */

const crypto = require('crypto');

/**
 * Hash an API key using SHA-256
 * @param {string} rawKey - The plaintext API key
 * @returns {string} Hex-encoded SHA-256 hash
 */
const hashApiKey = (rawKey) => {
  if (!rawKey || typeof rawKey !== 'string') {
    throw new Error('Invalid API key provided for hashing');
  }
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
};

/**
 * Verify an API key against its stored hash using constant-time comparison.
 * Prevents timing side-channel attacks that could leak hash information.
 * 
 * @param {string} rawKey - The plaintext API key from the request
 * @param {string} storedHash - The SHA-256 hash stored in the database
 * @returns {boolean} Whether the key matches
 */
const verifyApiKey = (rawKey, storedHash) => {
  if (!rawKey || !storedHash) {
    return false;
  }

  try {
    const candidateHash = hashApiKey(rawKey);
    const candidateBuffer = Buffer.from(candidateHash, 'hex');
    const storedBuffer = Buffer.from(storedHash, 'hex');

    // Buffers must be same length for timingSafeEqual
    if (candidateBuffer.length !== storedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(candidateBuffer, storedBuffer);
  } catch (error) {
    // Any error in comparison = reject
    return false;
  }
};

/**
 * Generate a cryptographically secure API key with structured format.
 * 
 * Format: ag_<env>_<keyId(8hex)>_<secret(32hex)>
 * 
 * - `ag` = API Guardian namespace prefix
 * - `<env>` = Environment indicator (live/test) from NODE_ENV
 * - `<keyId>` = 8-char hex identifier for prefix-based DB lookup
 * - `<secret>` = 32-char hex random secret (128 bits of entropy)
 * 
 * The prefix (ag_<env>_<keyId>) is stored separately for indexed lookup,
 * while only the SHA-256 hash of the full key is persisted.
 * 
 * @returns {{ apiKey: string, keyPrefix: string, keyHash: string }}
 */
const generateSecureApiKey = () => {
  const env = process.env.NODE_ENV === 'production' ? 'live' : 'test';
  const keyId = crypto.randomBytes(4).toString('hex');       // 8 hex chars
  const secret = crypto.randomBytes(16).toString('hex');     // 32 hex chars (128-bit entropy)

  const apiKey = `ag_${env}_${keyId}_${secret}`;
  const keyPrefix = `ag_${env}_${keyId}`;
  const keyHash = hashApiKey(apiKey);

  return { apiKey, keyPrefix, keyHash };
};

/**
 * Extract the prefix portion from a raw API key.
 * Used for indexed DB lookups before hash verification.
 * 
 * @param {string} rawKey - Full API key string
 * @returns {string|null} The prefix segment or null if invalid format
 */
const extractKeyPrefix = (rawKey) => {
  if (!rawKey || typeof rawKey !== 'string') {
    return null;
  }

  // Expected format: ag_<env>_<keyId>_<secret>
  const parts = rawKey.split('_');
  if (parts.length !== 4 || parts[0] !== 'ag') {
    return null;
  }

  // Prefix = ag_<env>_<keyId>
  return `${parts[0]}_${parts[1]}_${parts[2]}`;
};

/**
 * Validate API key format without checking its hash.
 * Quick reject for malformed keys before any DB lookup.
 * 
 * @param {string} rawKey - The API key to validate
 * @returns {boolean} Whether the key matches the expected format
 */
const isValidKeyFormat = (rawKey) => {
  if (!rawKey || typeof rawKey !== 'string') {
    return false;
  }

  const parts = rawKey.split('_');
  if (parts.length !== 4) return false;
  if (parts[0] !== 'ag') return false;
  if (!['live', 'test'].includes(parts[1])) return false;
  if (!/^[0-9a-f]{8}$/.test(parts[2])) return false;
  if (!/^[0-9a-f]{32}$/.test(parts[3])) return false;

  return true;
};

/**
 * Generate a cryptographically random token for sessions, CSRF, etc.
 * @param {number} bytes - Number of random bytes (default 32 = 256-bit)
 * @returns {string} Hex-encoded random token
 */
const generateSecureToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

module.exports = {
  hashApiKey,
  verifyApiKey,
  generateSecureApiKey,
  extractKeyPrefix,
  isValidKeyFormat,
  generateSecureToken
};

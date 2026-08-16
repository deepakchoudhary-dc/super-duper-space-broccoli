/**
 * Unit tests for server/utils/crypto.js — the zero-trust key cryptography.
 */
const crypto = require('crypto');
const {
  hashApiKey,
  verifyApiKey,
  generateSecureApiKey,
  extractKeyPrefix,
  isValidKeyFormat,
  generateSecureToken
} = require('../../utils/crypto');

describe('crypto utils', () => {
  describe('hashApiKey', () => {
    test('produces a deterministic 64-char hex SHA-256 hash', () => {
      const key = 'ag_test_00112233_aabbccddeeff00112233445566778899';
      const hash = hashApiKey(key);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hashApiKey(key)).toBe(hash); // deterministic
    });

    test('throws on invalid input', () => {
      expect(() => hashApiKey(null)).toThrow();
      expect(() => hashApiKey(123)).toThrow();
      expect(() => hashApiKey('')).toThrow();
    });

    test('never stores plaintext — hash is not reversible to the key', () => {
      const key = 'ag_test_00112233_aabbccddeeff00112233445566778899';
      const hash = hashApiKey(key);
      expect(hash).not.toContain(key);
    });
  });

  describe('verifyApiKey', () => {
    test('verifies a matching key', () => {
      const raw = 'ag_test_00112233_aabbccddeeff00112233445566778899';
      const stored = hashApiKey(raw);
      expect(verifyApiKey(raw, stored)).toBe(true);
    });

    test('rejects a non-matching key', () => {
      const stored = hashApiKey('ag_test_00112233_aabbccddeeff00112233445566778899');
      expect(verifyApiKey('ag_test_00112233_ffffffffffffffffffffffffffffffff', stored)).toBe(false);
    });

    test('rejects malformed inputs without throwing', () => {
      expect(verifyApiKey(null, 'abcd')).toBe(false);
      expect(verifyApiKey('key', null)).toBe(false);
      expect(verifyApiKey('key', 'nothex')).toBe(false);
    });
  });

  describe('generateSecureApiKey', () => {
    test('generates keys with the structured ag_<env>_<id>_<secret> format', () => {
      const { apiKey, keyPrefix, keyHash } = generateSecureApiKey();
      expect(apiKey).toMatch(/^ag_(live|test)_[0-9a-f]{8}_[0-9a-f]{32}$/);
      expect(keyPrefix).toBe(apiKey.split('_').slice(0, 3).join('_'));
      expect(keyHash).toBe(hashApiKey(apiKey)); // hash corresponds to the raw key
    });

    test('generates unique keys', () => {
      const seen = new Set();
      for (let i = 0; i < 100; i++) {
        seen.add(generateSecureApiKey().apiKey);
      }
      expect(seen.size).toBe(100);
    });

    test('key has 128 bits of secret entropy', () => {
      const { apiKey } = generateSecureApiKey();
      const secret = apiKey.split('_')[3];
      expect(secret.length * 4).toBe(128);
    });
  });

  describe('isValidKeyFormat / extractKeyPrefix', () => {
    test('accepts well-formed keys', () => {
      expect(isValidKeyFormat('ag_test_00112233_aabbccddeeff00112233445566778899')).toBe(true);
      expect(isValidKeyFormat('ag_live_00112233_aabbccddeeff00112233445566778899')).toBe(true);
    });

    test('rejects malformed keys', () => {
      expect(isValidKeyFormat('')).toBe(false);
      expect(isValidKeyFormat('bg_test_00112233_aabbccddeeff00112233445566778899')).toBe(false);
      expect(isValidKeyFormat('ag_prod_00112233_aabbccddeeff00112233445566778899')).toBe(false);
      expect(isValidKeyFormat('ag_test_00112233_short')).toBe(false);
      expect(isValidKeyFormat('ag_test_xyz_aabbccddeeff00112233445566778899')).toBe(false);
      expect(isValidKeyFormat(null)).toBe(false);
    });

    test('extracts prefixes correctly', () => {
      const raw = 'ag_test_00112233_aabbccddeeff00112233445566778899';
      expect(extractKeyPrefix(raw)).toBe('ag_test_00112233');
      expect(extractKeyPrefix('not-a-valid-key')).toBeNull();
    });
  });

  describe('generateSecureToken', () => {
    test('generates cryptographically random hex tokens', () => {
      const token = generateSecureToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(generateSecureToken(16)).toMatch(/^[0-9a-f]{32}$/);
      const a = generateSecureToken();
      const b = generateSecureToken();
      expect(a).not.toBe(b);
    });
  });
});

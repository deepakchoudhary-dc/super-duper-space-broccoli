/**
 * Unit tests for server/utils/ssrf.js — SSRF protection.
 */
const dns = require('dns');
const { validateUrl, isPrivateIp, isObviousInternal } = require('../../utils/ssrf');

describe('ssrf protection', () => {
  describe('isPrivateIp', () => {
    test('flags private/reserved ranges', () => {
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('192.168.1.1')).toBe(true);
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('169.254.169.254')).toBe(true); // cloud metadata
      expect(isPrivateIp('::1')).toBe(true);
      expect(isPrivateIp('fc00::1')).toBe(true);
      expect(isPrivateIp('fe80::1')).toBe(true);
    });

    test('allows public IPs', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false);
      expect(isPrivateIp('1.1.1.1')).toBe(false);
      expect(isPrivateIp('93.184.216.34')).toBe(false);
    });
  });

  describe('isObviousInternal', () => {
    test('flags localhost and metadata hosts', () => {
      expect(isObviousInternal('localhost')).toBe(true);
      expect(isObviousInternal('metadata.google.internal')).toBe(true);
      expect(isObviousInternal('169.254.169.254')).toBe(true);
      expect(isObviousInternal('10.0.0.5')).toBe(true);
    });

    test('allows public hosts', () => {
      expect(isObviousInternal('api.example.com')).toBe(false);
      expect(isObviousInternal('example.com')).toBe(false);
    });
  });

  describe('validateUrl', () => {
    test('rejects non-http(s) schemes', async () => {
      const result = await validateUrl('file:///etc/passwd');
      expect(result.ok).toBe(false);
      const ftp = await validateUrl('ftp://example.com/file');
      expect(ftp.ok).toBe(false);
    });

    test('rejects malformed URLs', async () => {
      const result = await validateUrl('not a url');
      expect(result.ok).toBe(false);
      expect(await validateUrl('')).toEqual(expect.objectContaining({ ok: false }));
      expect(await validateUrl(null)).toEqual(expect.objectContaining({ ok: false }));
    });

    test('rejects URLs with embedded credentials', async () => {
      const result = await validateUrl('http://user:pass@example.com/');
      expect(result.ok).toBe(false);
    });

    test('rejects hosts that resolve to private IPs', async () => {
      // Mock DNS to resolve the hostname to a private address.
      // Note: dns.lookup with an options object + no callback returns a Promise.
      const spy = jest.spyOn(dns, 'lookup').mockImplementation((host, opts, cb) => {
        const addresses = [{ address: '10.0.0.5', family: 4 }];
        if (typeof cb === 'function') {
          cb(null, addresses);
          return undefined;
        }
        return Promise.resolve(addresses);
      });

      const result = await validateUrl('http://internal-service.internal/health');
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/private|internal/i);
      spy.mockRestore();
    });

    test('accepts hosts that resolve to public IPs', async () => {
      const spy = jest.spyOn(dns, 'lookup').mockImplementation((host, opts, cb) => {
        const addresses = [{ address: '93.184.216.34', family: 4 }];
        if (typeof cb === 'function') {
          cb(null, addresses);
          return undefined;
        }
        return Promise.resolve(addresses);
      });

      const result = await validateUrl('http://api.example.com/v1');
      expect(result.ok).toBe(true);
      spy.mockRestore();
    });
  });
});

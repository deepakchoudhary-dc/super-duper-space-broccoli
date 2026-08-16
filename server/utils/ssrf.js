/**
 * SSRF Protection
 * ---------------
 * The gateway forwards requests to user-registered upstream base_urls.
 * Without validation, a malicious user could register an internal address
 * (cloud metadata 169.254.169.254, localhost, RFC1918, etc.) and pivot the
 * gateway into the internal network — a classic SSRF.
 *
 * Protection applied:
 *  1. Scheme allowlist — only http/https.
 *  2. DNS-based IP resolution — resolve the hostname, then reject private,
 *     loopback, link-local, and reserved ranges.
 *  3. DNS rebinding mitigation — resolve at validation time AND re-validate
 *     the hostname right before forwarding (the proxy does both).
 *  4. Configurable escape hatch — SSRF_ALLOW_PRIVATE lists hosts allowed to
 *     resolve to private ranges (for legitimate local dev upstreams).
 */

const dns = require('dns');
const { URL } = require('url');
const net = require('net');
const config = require('../config/env');

const PRIVATE_RANGES = [
  // IPv4
  { name: 'loopback', test: (ip) => ip === '127.0.0.1' || ip.startsWith('127.') },
  { name: 'rfc1918-10', test: (ip) => ip.startsWith('10.') },
  { name: 'rfc1918-172', test: (ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip) },
  { name: 'rfc1918-192', test: (ip) => ip.startsWith('192.168.') },
  { name: 'link-local', test: (ip) => ip.startsWith('169.254.') },
  { name: 'carrier-grade-nat', test: (ip) => ip.startsWith('100.64.') },
  { name: 'reserved', test: (ip) => ip.startsWith('0.') || ip.startsWith('240.') || ip.startsWith('255.') || ip === '255.255.255.255' },
  { name: 'multicast', test: (ip) => /^22[4-9]\.|^23[0-9]\./.test(ip) },
  // IPv6
  { name: 'ipv6-loopback', test: (ip) => ip === '::1' || ip === '::' },
  { name: 'ipv6-ula', test: (ip) => ip.startsWith('fc') || ip.startsWith('fd') },
  { name: 'ipv6-link-local', test: (ip) => ip.startsWith('fe80:') },
  { name: 'ipv6-mapped-127', test: (ip) => ip === '::ffff:127.0.0.1' || ip.startsWith('::ffff:127.') },
  { name: 'ipv6-mapped-10', test: (ip) => ip.startsWith('::ffff:10.') },
  { name: 'ipv6-mapped-192', test: (ip) => ip.startsWith('::ffff:192.168.') },
  { name: 'ipv6-mapped-169', test: (ip) => ip.startsWith('::ffff:169.254.') },
  { name: 'ipv6-mapped-172', test: (ip) => ip.startsWith('::ffff:172.') }
];

const isPrivateIp = (ip) => {
  if (!ip) return true;
  // Normalize IPv4-mapped IPv6
  if (ip.includes('::ffff:') && ip.startsWith('::ffff:')) {
    ip = ip.substring('::ffff:'.length);
  }
  return PRIVATE_RANGES.some((r) => r.test(ip));
};

/**
 * Validate a URL string for SSRF safety.
 * @param {string} urlString
 * @param {object} [opts] { allowPrivate: boolean }
 * @returns {Promise<{ok: boolean, reason?: string, url?: URL, ip?: string}>}
 */
const validateUrl = async (urlString, opts = {}) => {
  const allowedPrivate = config.proxy.ssrfAllowPrivate || [];
  const skipPrivateCheck = opts.allowPrivate === true;

  if (!urlString || typeof urlString !== 'string') {
    return { ok: false, reason: 'URL is required' };
  }

  let url;
  try {
    url = new URL(urlString);
  } catch (err) {
    return { ok: false, reason: 'Malformed URL' };
  }

  // Scheme allowlist
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only http/https URLs are allowed' };
  }

  if (!url.hostname) {
    return { ok: false, reason: 'URL must include a hostname' };
  }

  // Credentials in URL are a footgun — reject
  if (url.username || url.password) {
    return { ok: false, reason: 'URLs with embedded credentials are not allowed' };
  }

  // Host allowlist override (dev convenience, opt-in)
  if (allowedPrivate.includes(url.hostname)) {
    return { ok: true, url };
  }

  if (!config.security.ssrfProtection || skipPrivateCheck) {
    return { ok: true, url };
  }

  let addresses = [];

  // IP literals can be validated synchronously without touching the resolver
  if (net.isIP(url.hostname)) {
    addresses = [url.hostname];
  } else {
    // Resolve hostname
    try {
      const resolved = await dns.lookup(url.hostname, { all: true, verbatim: true });
      addresses = Array.isArray(resolved) ? resolved.map((r) => r.address) : [resolved.address];
    } catch (err) {
      return { ok: false, reason: 'DNS resolution failed' };
    }
  }

  if (addresses.length === 0) {
    return { ok: false, reason: 'Hostname did not resolve' };
  }

  for (const address of addresses) {
    if (isPrivateIp(address)) {
      return {
        ok: false,
        reason: 'Target resolves to a private/internal address',
        ip: address
      };
    }
  }

  return { ok: true, url, ip: addresses[0] };
};

/**
 * Synchronous quick-check for obvious internal literals (used before DNS).
 */
const isObviousInternal = (hostname) => {
  if (!hostname) return true;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;
  if (net.isIP(hostname) && isPrivateIp(hostname)) return true;
  // AWS/GCP/Azure metadata hostnames
  if (/metadata\.(google\.internal|compute\.amazonaws\.com)$/.test(hostname)) return true;
  return false;
};

module.exports = { validateUrl, isPrivateIp, isObviousInternal };

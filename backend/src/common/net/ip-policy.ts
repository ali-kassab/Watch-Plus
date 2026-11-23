import ipaddr from 'ipaddr.js';

/**
 * SSRF policy: only globally routable unicast addresses may be contacted.
 * Loopback, private (RFC 1918), link-local (incl. cloud metadata 169.254.169.254),
 * CGNAT, unique-local IPv6, multicast, reserved and unspecified ranges are refused.
 * IPv4-mapped IPv6 addresses (::ffff:10.0.0.1) are unwrapped before the check.
 */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) parsed = v6.toIPv4Address();
  }
  const range = parsed.range();
  if (parsed.kind() === 'ipv4') return range === 'unicast';
  // For IPv6 only global unicast space is allowed
  return range === 'unicast';
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

export type TargetValidation = { ok: true; url: URL } | { ok: false; reason: string };

/** Static validation of a user supplied URL, before any DNS resolution. */
export function validateTargetUrl(raw: string, allowPrivate: boolean): TargetValidation {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'URL is not valid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https URLs are supported' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'Credentials in the URL are not allowed; use a header instead' };
  }
  if (!url.hostname) return { ok: false, reason: 'URL must include a host' };
  if (allowPrivate) return { ok: true, url };

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (ipaddr.isValid(host)) {
    return isPublicAddress(host) ? { ok: true, url } : { ok: false, reason: 'Private, loopback and reserved addresses cannot be monitored' };
  }
  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s)) || !host.includes('.')) {
    return { ok: false, reason: 'Internal host names cannot be monitored' };
  }
  return { ok: true, url };
}

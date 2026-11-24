import { isPublicAddress, validateTargetUrl } from './ip-policy.js';

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'])('allows public %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    '127.0.0.1', '10.0.0.5', '172.16.3.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '255.255.255.255', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', '::',
  ])('blocks non-public %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it('rejects garbage', () => expect(isPublicAddress('not-an-ip')).toBe(false));
});

describe('validateTargetUrl', () => {
  it('accepts public http(s) URLs', () => {
    expect(validateTargetUrl('https://api.example.com/health', false).ok).toBe(true);
    expect(validateTargetUrl('http://93.184.216.34:8080/', false).ok).toBe(true);
  });

  it.each([
    ['ftp://example.com', 'Only http and https'],
    ['file:///etc/passwd', 'Only http and https'],
    ['http://user:pass@example.com', 'Credentials'],
    ['http://localhost:3000', 'Internal host'],
    ['http://app.localhost', 'Internal host'],
    ['http://printer.local', 'Internal host'],
    ['http://intranet', 'Internal host'],
    ['http://127.0.0.1/', 'Private'],
    ['http://[::1]/', 'Private'],
    ['http://169.254.169.254/latest/meta-data', 'Private'],
    ['http://0x7f000001/', 'Private'],
    ['not a url', 'not valid'],
  ])('rejects %s', (url, reason) => {
    const r = validateTargetUrl(url, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(reason);
  });

  it('allows private targets only when explicitly enabled', () => {
    expect(validateTargetUrl('http://127.0.0.1:4000', true).ok).toBe(true);
  });
});

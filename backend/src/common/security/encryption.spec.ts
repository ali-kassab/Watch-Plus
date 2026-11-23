import { randomBytes } from 'node:crypto';
import { decrypt, encrypt } from './encryption.js';

describe('encryption', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips and uses a random IV', () => {
    const a = encrypt('{"secret":"x"}', key);
    const b = encrypt('{"secret":"x"}', key);
    expect(a).not.toEqual(b);
    expect(a.startsWith('v1:')).toBe(true);
    expect(decrypt(a, key)).toBe('{"secret":"x"}');
  });

  it('detects tampering and wrong keys', () => {
    const c = encrypt('hello', key);
    const raw = Buffer.from(c.slice(3), 'base64');
    raw[raw.length - 1] ^= 1;
    expect(() => decrypt(`v1:${raw.toString('base64')}`, key)).toThrow();
    expect(() => decrypt(c, randomBytes(32).toString('base64'))).toThrow();
  });
});

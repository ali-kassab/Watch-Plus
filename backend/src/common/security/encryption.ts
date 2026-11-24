import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM authenticated encryption. Output: base64(iv | tag | ciphertext), versioned with "v1:". */
export function encrypt(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${Buffer.concat([iv, tag, ciphertext]).toString('base64')}`;
}

export function decrypt(payload: string, keyBase64: string): string {
  if (!payload.startsWith('v1:')) throw new Error('Unsupported ciphertext version');
  const raw = Buffer.from(payload.slice(3), 'base64');
  const key = Buffer.from(keyBase64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

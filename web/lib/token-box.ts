import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM for Google refresh tokens kept in the Telegram registry. Stored as base64url of iv (12) | tag (16) | ciphertext.
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  const k = Buffer.from(process.env.TOKEN_ENC_KEY ?? '', 'base64');
  if (k.length !== 32) throw new Error('TOKEN_ENC_KEY must be 32 bytes, base64 (openssl rand -base64 32).');
  return k;
}

export const tokenBoxReady = (): boolean => Buffer.from(process.env.TOKEN_ENC_KEY ?? '', 'base64').length === 32;

// owner: the Google id the token belongs to; a sealed token copied to another row cannot be opened there.
export function seal(plain: string, owner = ''): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(owner));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export function open(sealed: string, owner = ''): string {
  const b = Buffer.from(sealed, 'base64url');
  if (b.length < IV_BYTES + TAG_BYTES) throw new Error('Sealed token is too short.');
  const decipher = createDecipheriv('aes-256-gcm', key(), b.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(owner));
  decipher.setAuthTag(b.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(b.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
}

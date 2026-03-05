import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = 'yello-token-encryption-salt';

let derivedKey: Buffer | null = null;

function getKey(): Buffer {
  if (derivedKey) return derivedKey;

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is required for token encryption');
  }

  derivedKey = scryptSync(secret, SALT, KEY_LENGTH);
  return derivedKey;
}

/**
 * Encrypt a plaintext token.
 * Returns "hex(iv):hex(ciphertext):hex(authTag)"
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

/**
 * Decrypt an encrypted token.
 * Returns plaintext or null if decryption fails.
 */
export function decryptToken(encrypted: string): string | null {
  try {
    const key = getKey();
    const parts = encrypted.split(':');
    if (parts.length !== 3) return null;

    const iv = Buffer.from(parts[0], 'hex');
    const ciphertext = parts[1];
    const authTag = Buffer.from(parts[2], 'hex');

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) return null;

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Check if a value looks like an encrypted token (hex:hex:hex format).
 */
export function isEncryptedToken(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;

  // Check each part is valid hex
  const hexRegex = /^[0-9a-f]+$/i;
  return parts.every(part => hexRegex.test(part));
}

/**
 * Reset the derived key cache (for testing).
 */
export function _resetKeyCache(): void {
  derivedKey = null;
}

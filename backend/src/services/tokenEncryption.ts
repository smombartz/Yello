import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = 'yello-token-encryption-salt';

let derivedKey: Buffer | null = null;
let previousKey: Buffer | null | undefined;

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SALT, KEY_LENGTH);
}

/**
 * The at-rest key comes from TOKEN_ENCRYPTION_KEY. Older deployments derived it
 * from SESSION_SECRET, so that remains the fallback: deploying this code before
 * setting the new variable changes nothing.
 */
function getKey(): Buffer {
  if (derivedKey) return derivedKey;

  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('TOKEN_ENCRYPTION_KEY or SESSION_SECRET is required for token encryption');
  }

  derivedKey = deriveKey(secret);
  return derivedKey;
}

/**
 * The key being rotated away from (TOKEN_ENCRYPTION_KEY_PREVIOUS), or null when
 * no rotation is in progress.
 */
function getPreviousKey(): Buffer | null {
  if (previousKey !== undefined) return previousKey;
  const secret = process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
  previousKey = secret ? deriveKey(secret) : null;
  return previousKey;
}

export function isKeyRotationPending(): boolean {
  return getPreviousKey() !== null;
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

function decryptWithKey(encrypted: string, key: Buffer): string | null {
  try {
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
 * Decrypt an encrypted token.
 * Returns plaintext or null if decryption fails.
 */
export function decryptToken(encrypted: string): string | null {
  try {
    return decryptWithKey(encrypted, getKey());
  } catch {
    return null;
  }
}

export type ReencryptStatus = 'current' | 'rotated' | 'failed';

/**
 * Moves one stored value onto the current key. Values the current key already
 * opens are left alone, so running a rotation twice is harmless. Legacy
 * plaintext values are encrypted. A value neither key opens is reported as
 * failed and returned unchanged, never discarded.
 */
export function reencryptToken(value: string): { status: ReencryptStatus; value: string } {
  if (!isEncryptedToken(value)) {
    return { status: 'rotated', value: encryptToken(value) };
  }

  if (decryptWithKey(value, getKey()) !== null) {
    return { status: 'current', value };
  }

  const previous = getPreviousKey();
  const plaintext = previous ? decryptWithKey(value, previous) : null;
  if (plaintext === null) {
    return { status: 'failed', value };
  }

  return { status: 'rotated', value: encryptToken(plaintext) };
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
 * Reset the derived key caches (for testing).
 */
export function _resetKeyCache(): void {
  derivedKey = null;
  previousKey = undefined;
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptToken, decryptToken, isEncryptedToken, _resetKeyCache } from '../tokenEncryption.js';

describe('tokenEncryption', () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    _resetKeyCache();
    process.env.SESSION_SECRET = 'test-secret-for-encryption';
  });

  afterEach(() => {
    _resetKeyCache();
    if (originalSecret !== undefined) {
      process.env.SESSION_SECRET = originalSecret;
    } else {
      delete process.env.SESSION_SECRET;
    }
  });

  it('should encrypt and decrypt a token roundtrip', () => {
    const token = 'ya29.a0AfH6SMBx1234567890abcdef';
    const encrypted = encryptToken(token);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(token);
  });

  it('should produce different ciphertexts for the same input (random IV)', () => {
    const token = 'ya29.same-token';
    const encrypted1 = encryptToken(token);
    const encrypted2 = encryptToken(token);
    expect(encrypted1).not.toBe(encrypted2);

    // Both should decrypt to the same value
    expect(decryptToken(encrypted1)).toBe(token);
    expect(decryptToken(encrypted2)).toBe(token);
  });

  it('should detect tampered ciphertext', () => {
    const token = 'ya29.test-token';
    const encrypted = encryptToken(token);
    const parts = encrypted.split(':');

    // Tamper with the ciphertext
    const tampered = parts[0] + ':' + 'ff' + parts[1].slice(2) + ':' + parts[2];
    expect(decryptToken(tampered)).toBeNull();
  });

  it('should return null for non-encrypted strings', () => {
    expect(decryptToken('ya29.plaintext-token')).toBeNull();
    expect(decryptToken('not-encrypted')).toBeNull();
    expect(decryptToken('')).toBeNull();
  });

  it('should correctly identify encrypted vs plaintext tokens', () => {
    const token = 'ya29.test-token';
    const encrypted = encryptToken(token);

    expect(isEncryptedToken(encrypted)).toBe(true);
    expect(isEncryptedToken('ya29.plaintext-token')).toBe(false);
    expect(isEncryptedToken('1//0abc-refresh-token')).toBe(false);
    expect(isEncryptedToken('')).toBe(false);
  });

  it('should throw when SESSION_SECRET is missing', () => {
    delete process.env.SESSION_SECRET;
    _resetKeyCache();
    expect(() => encryptToken('test')).toThrow('SESSION_SECRET is required');
  });
});

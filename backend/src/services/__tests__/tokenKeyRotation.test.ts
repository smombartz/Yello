import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { rotateEncryptedTokens } from '../tokenKeyRotation.js';
import { encryptToken, decryptToken, reencryptToken, _resetKeyCache } from '../tokenEncryption.js';
import { getAuthDatabase, closeAuthDatabase } from '../authDatabase.js';
import { getUserDatabase, closeAllUserDatabases } from '../userDatabase.js';

const USER_ID = 42;
const OLD_SECRET = 'old-leaked-session-secret';
const NEW_KEY = 'new-token-encryption-key';

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  silent: vi.fn(),
  level: 'info',
  child: () => log
} as never;

const ENV_KEYS = [
  'SESSION_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'TOKEN_ENCRYPTION_KEY_PREVIOUS',
  'AUTH_DATABASE_PATH',
  'USER_DATA_PATH'
] as const;

/** Encrypts with the pre-rotation setup: only SESSION_SECRET set. */
function encryptWithOldSecret(plaintext: string): string {
  process.env.SESSION_SECRET = OLD_SECRET;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
  _resetKeyCache();
  return encryptToken(plaintext);
}

/** Switches to the rotation setup: new cookie secret, new key, old value as previous. */
function startRotation(previous = OLD_SECRET): void {
  process.env.SESSION_SECRET = 'new-cookie-secret';
  process.env.TOKEN_ENCRYPTION_KEY = NEW_KEY;
  process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = previous;
  _resetKeyCache();
}

function seed(): void {
  const auth = getAuthDatabase();
  auth.exec('DELETE FROM users');
  auth
    .prepare('INSERT INTO users (id, google_id, email, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)')
    .run(USER_ID, 'g-1', 'a@example.com', encryptWithOldSecret('ya29.access'), encryptWithOldSecret('1//refresh'));

  getUserDatabase(USER_ID)
    .prepare('UPDATE user_settings SET apify_api_token = ?, icloud_app_password = ? WHERE id = 1')
    .run(encryptWithOldSecret('apify_api_abc'), encryptWithOldSecret('abcd-efgh-ijkl-mnop'));
}

function readAll() {
  const user = getAuthDatabase().prepare('SELECT access_token, refresh_token FROM users WHERE id = ?').get(USER_ID) as {
    access_token: string;
    refresh_token: string;
  };
  const settings = getUserDatabase(USER_ID)
    .prepare('SELECT apify_api_token, icloud_app_password FROM user_settings WHERE id = 1')
    .get() as { apify_api_token: string; icloud_app_password: string };
  return { ...user, ...settings };
}

describe('rotateEncryptedTokens', () => {
  let tmpDir: string;
  const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeAll(() => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-key-rotation-'));
    process.env.AUTH_DATABASE_PATH = path.join(tmpDir, 'auth.db');
    process.env.USER_DATA_PATH = path.join(tmpDir, 'users');
  });

  afterAll(() => {
    closeAllUserDatabases();
    closeAuthDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    _resetKeyCache();
  });

  beforeEach(() => {
    seed();
    vi.clearAllMocks();
  });

  it('is a no-op without TOKEN_ENCRYPTION_KEY_PREVIOUS', () => {
    const before = readAll();
    process.env.TOKEN_ENCRYPTION_KEY = NEW_KEY;
    _resetKeyCache();

    expect(rotateEncryptedTokens(log)).toBeNull();
    expect(readAll()).toEqual(before);
  });

  it('keeps existing ciphertext readable when only SESSION_SECRET is set', () => {
    const stored = readAll();
    process.env.SESSION_SECRET = OLD_SECRET;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    _resetKeyCache();

    expect(decryptToken(stored.access_token)).toBe('ya29.access');
  });

  it('re-encrypts auth and tenant credentials onto the new key', () => {
    startRotation();
    expect(rotateEncryptedTokens(log)).toEqual({ rotated: 4, current: 0, failed: 0 });

    // Decryptable with only the new key in place
    delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
    _resetKeyCache();
    const after = readAll();
    expect(decryptToken(after.access_token)).toBe('ya29.access');
    expect(decryptToken(after.refresh_token)).toBe('1//refresh');
    expect(decryptToken(after.apify_api_token)).toBe('apify_api_abc');
    expect(decryptToken(after.icloud_app_password)).toBe('abcd-efgh-ijkl-mnop');
  });

  it('is idempotent across restarts', () => {
    startRotation();
    rotateEncryptedTokens(log);
    const once = readAll();

    expect(rotateEncryptedTokens(log)).toEqual({ rotated: 0, current: 4, failed: 0 });
    expect(readAll()).toEqual(once);
  });

  it('leaves values untouched when the previous key is wrong', () => {
    const before = readAll();
    startRotation('not-the-old-secret');

    expect(rotateEncryptedTokens(log)).toEqual({ rotated: 0, current: 0, failed: 4 });
    expect(readAll()).toEqual(before);
  });
});

describe('reencryptToken', () => {
  afterAll(() => _resetKeyCache());

  it('encrypts legacy plaintext values', () => {
    startRotation();
    const result = reencryptToken('ya29.legacy-plaintext');
    expect(result.status).toBe('rotated');
    expect(decryptToken(result.value)).toBe('ya29.legacy-plaintext');
  });
});

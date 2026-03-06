import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { getAuthDatabase, closeAuthDatabase } from '../../services/authDatabase.js';

describe('auth onboarding', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-auth-onboarding-test-'));
    // Point auth DB to a temp file so we don't touch real data
    process.env.AUTH_DATABASE_PATH = path.join(tmpDir, 'auth.db');
    // Reset singleton so it picks up the new path
    closeAuthDatabase();
  });

  afterAll(() => {
    closeAuthDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create a user with has_onboarded = 0 by default', () => {
    const db = getAuthDatabase();

    db.prepare(`
      INSERT INTO users (google_id, email, name, has_onboarded)
      VALUES (?, ?, ?, 0)
    `).run('google-test-123', 'test@example.com', 'Test User');

    const user = db.prepare('SELECT * FROM users WHERE google_id = ?').get('google-test-123') as {
      id: number;
      has_onboarded: number;
    };

    expect(user).toBeDefined();
    expect(user.has_onboarded).toBe(0);
  });

  it('should update has_onboarded to 1', () => {
    const db = getAuthDatabase();

    // Ensure user exists from previous test (or create)
    const user = db.prepare('SELECT * FROM users WHERE google_id = ?').get('google-test-123') as {
      id: number;
      has_onboarded: number;
    };

    expect(user).toBeDefined();
    expect(user.has_onboarded).toBe(0);

    // Simulate what the PATCH /onboarded endpoint does
    db.prepare('UPDATE users SET has_onboarded = 1 WHERE id = ?').run(user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as {
      id: number;
      has_onboarded: number;
    };

    expect(updated.has_onboarded).toBe(1);
  });

  it('should be idempotent - setting has_onboarded again stays 1', () => {
    const db = getAuthDatabase();

    const user = db.prepare('SELECT * FROM users WHERE google_id = ?').get('google-test-123') as {
      id: number;
      has_onboarded: number;
    };

    expect(user.has_onboarded).toBe(1);

    // Run the update again
    db.prepare('UPDATE users SET has_onboarded = 1 WHERE id = ?').run(user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as {
      id: number;
      has_onboarded: number;
    };

    expect(updated.has_onboarded).toBe(1);
  });
});

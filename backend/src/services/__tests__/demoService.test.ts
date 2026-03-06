import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getAuthDatabase, closeAuthDatabase } from '../authDatabase.js';
import { getUserDatabase, closeAllUserDatabases } from '../userDatabase.js';
import { createDemoUser, cleanupExpiredDemoUsers, DEMO_CONTACT_COUNT } from '../demoService.js';

describe('demoService', () => {
  let tmpDir: string;
  const originalAuthDbPath = process.env.AUTH_DATABASE_PATH;
  const originalUserDataPath = process.env.USER_DATA_PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-test-'));
    process.env.AUTH_DATABASE_PATH = path.join(tmpDir, 'auth.db');
    process.env.USER_DATA_PATH = path.join(tmpDir, 'users');
  });

  afterEach(() => {
    closeAllUserDatabases();
    closeAuthDatabase();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    if (originalAuthDbPath !== undefined) {
      process.env.AUTH_DATABASE_PATH = originalAuthDbPath;
    } else {
      delete process.env.AUTH_DATABASE_PATH;
    }
    if (originalUserDataPath !== undefined) {
      process.env.USER_DATA_PATH = originalUserDataPath;
    } else {
      delete process.env.USER_DATA_PATH;
    }
  });

  it('should create a demo user in auth.db with is_demo=1', async () => {
    const result = await createDemoUser();
    const db = getAuthDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.userId) as any;
    expect(user.is_demo).toBe(1);
    expect(user.google_id).toMatch(/^demo-/);
    expect(user.email).toMatch(/@demo\.yello\.app$/);
  });

  it('should create a session that expires in ~2 hours', async () => {
    const result = await createDemoUser();
    const db = getAuthDatabase();
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.sessionId) as any;
    const expiresAt = new Date(session.expires_at).getTime();
    const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;
    // Allow 10 seconds tolerance
    expect(Math.abs(expiresAt - twoHoursFromNow)).toBeLessThan(10000);
  });

  it('should seed the demo user contacts.db with DEMO_CONTACT_COUNT contacts', async () => {
    const result = await createDemoUser();
    const userDb = getUserDatabase(result.userId);
    const count = userDb.prepare('SELECT COUNT(*) as count FROM contacts').get() as any;
    expect(count.count).toBe(DEMO_CONTACT_COUNT);
  });

  it('should seed contacts with emails, phones, and addresses', async () => {
    const result = await createDemoUser();
    const userDb = getUserDatabase(result.userId);
    const emails = userDb.prepare('SELECT COUNT(*) as count FROM contact_emails').get() as any;
    const phones = userDb.prepare('SELECT COUNT(*) as count FROM contact_phones').get() as any;
    const addresses = userDb.prepare('SELECT COUNT(*) as count FROM contact_addresses').get() as any;
    expect(emails.count).toBeGreaterThan(0);
    expect(phones.count).toBeGreaterThan(0);
    expect(addresses.count).toBeGreaterThan(0);
  });

  it('should seed some contacts with LinkedIn enrichment data', async () => {
    const result = await createDemoUser();
    const userDb = getUserDatabase(result.userId);
    const enriched = userDb.prepare('SELECT COUNT(*) as count FROM linkedin_enrichment').get() as any;
    expect(enriched.count).toBeGreaterThanOrEqual(10);
  });

  it('should clean up expired demo users', async () => {
    // Create a demo user
    const result = await createDemoUser();
    const db = getAuthDatabase();

    // Manually expire the session
    db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 hour') WHERE id = ?").run(result.sessionId);

    // Run cleanup
    cleanupExpiredDemoUsers();

    // User should be deleted
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.userId);
    expect(user).toBeUndefined();

    // User data directory should be deleted
    const userDir = path.join(tmpDir, 'users', String(result.userId));
    expect(fs.existsSync(userDir)).toBe(false);
  });

  it('should NOT clean up non-expired demo users', async () => {
    const result = await createDemoUser();
    cleanupExpiredDemoUsers();

    const db = getAuthDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.userId);
    expect(user).toBeDefined();
  });
});

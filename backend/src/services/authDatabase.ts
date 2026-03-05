import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: DatabaseType | null = null;

/**
 * Returns a singleton better-sqlite3 database instance for the shared auth DB.
 * This database stores users, sessions, and profile_images — shared across
 * all tenants in the multi-tenancy architecture.
 */
export function getAuthDatabase(): DatabaseType {
  if (db) return db;

  const dbPath = process.env.AUTH_DATABASE_PATH || './data/auth.db';

  // Ensure parent directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      avatar_url TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('user_uploaded', 'google', 'google_contacts', 'gravatar')),
      original_url TEXT,
      local_hash TEXT,
      is_primary INTEGER DEFAULT 0,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_profile_images_user_id ON profile_images(user_id);
    CREATE INDEX IF NOT EXISTS idx_profile_images_source ON profile_images(source);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_images_user_source ON profile_images(user_id, source);
  `);

  return db;
}

/**
 * Closes the auth database connection and resets the singleton,
 * allowing a new instance to be created on the next call.
 */
export function closeAuthDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

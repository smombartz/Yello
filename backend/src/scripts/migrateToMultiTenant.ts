/**
 * Migration script: converts a single-tenant database into the multi-tenant structure.
 *
 * The old layout has one contacts.db containing ALL tables (auth + contact data).
 * After migration:
 *   - auth.db    contains users, sessions, profile_images
 *   - data/users/{adminId}/contacts.db  contains all contact-related tables
 *   - data/users/{adminId}/photos/      contains photo files
 *   - old contacts.db is renamed to contacts.db.bak
 *
 * Usage:
 *   npx tsx src/scripts/migrateToMultiTenant.ts
 *
 * Or programmatically:
 *   import { migrateToMultiTenant } from './migrateToMultiTenant.js';
 *   migrateToMultiTenant({ oldDbPath, oldPhotosPath, authDbPath, userDataPath });
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface MigrationOptions {
  oldDbPath: string;
  oldPhotosPath: string;
  authDbPath: string;
  userDataPath: string;
}

export interface MigrationResult {
  adminUserId: number;
}

/**
 * Tables that belong in auth.db (shared across all tenants).
 */
const AUTH_TABLES = ['users', 'sessions', 'profile_images'];

/**
 * Recursively copies a directory tree from src to dest.
 */
function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Migrates a single-tenant database to the multi-tenant structure.
 *
 * Steps:
 * 1. Opens the old contacts.db (read-only)
 * 2. Gets the first user from the users table (admin user)
 * 3. Creates auth.db with users/sessions/profile_images data copied from old DB
 * 4. Copies contacts.db to data/users/{adminId}/contacts.db
 * 5. Drops auth tables (users, sessions, profile_images) from the user DB copy
 * 6. Copies photos from old photos dir to data/users/{adminId}/photos/
 * 7. Renames old contacts.db to contacts.db.bak
 */
export function migrateToMultiTenant(options: MigrationOptions): MigrationResult {
  const { oldDbPath, oldPhotosPath, authDbPath, userDataPath } = options;

  // --- Step 1: Validate old DB exists ---
  if (!fs.existsSync(oldDbPath)) {
    throw new Error(`Old database does not exist: ${oldDbPath}`);
  }

  // Open old DB read-only to inspect it
  const oldDb = new Database(oldDbPath, { readonly: true });

  // --- Step 2: Get first (admin) user ---
  let adminUser: { id: number; google_id: string; email: string } | undefined;
  try {
    adminUser = oldDb.prepare('SELECT id, google_id, email FROM users ORDER BY id ASC LIMIT 1').get() as
      | { id: number; google_id: string; email: string }
      | undefined;
  } catch {
    // users table might not exist
  }

  if (!adminUser) {
    oldDb.close();
    throw new Error('No users found in old database. Cannot determine admin user for migration.');
  }

  const adminId = adminUser.id;

  console.log(`Found admin user: id=${adminId}, email=${adminUser.email}`);

  // --- Step 3: Create auth.db with auth tables from old DB ---
  const authDir = path.dirname(authDbPath);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const authDb = new Database(authDbPath);
  authDb.pragma('journal_mode = WAL');
  authDb.pragma('foreign_keys = ON');

  // Create auth tables in auth.db
  authDb.exec(`
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

  // Copy users data
  const oldUsersColumns = oldDb.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const oldUsersCols = oldUsersColumns.map((c) => c.name);
  // Only copy columns that exist in both old and new schema
  const authUsersCols = [
    'id', 'google_id', 'email', 'name', 'avatar_url',
    'access_token', 'refresh_token', 'token_expires_at',
    'created_at', 'updated_at',
  ];
  const commonUserCols = authUsersCols.filter((c) => oldUsersCols.includes(c));
  const colList = commonUserCols.join(', ');

  const users = oldDb.prepare(`SELECT ${colList} FROM users`).all() as Array<Record<string, unknown>>;
  if (users.length > 0) {
    const placeholders = commonUserCols.map(() => '?').join(', ');
    const insertUser = authDb.prepare(
      `INSERT INTO users (${colList}) VALUES (${placeholders})`
    );
    const insertAll = authDb.transaction(() => {
      for (const user of users) {
        insertUser.run(...commonUserCols.map((c) => user[c]));
      }
    });
    insertAll();
    console.log(`Copied ${users.length} user(s) to auth.db`);
  }

  // Copy sessions data
  try {
    const sessions = oldDb.prepare('SELECT id, user_id, expires_at, created_at FROM sessions').all() as Array<{
      id: string;
      user_id: number;
      expires_at: string;
      created_at: string;
    }>;
    if (sessions.length > 0) {
      const insertSession = authDb.prepare(
        'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
      );
      const insertAll = authDb.transaction(() => {
        for (const sess of sessions) {
          insertSession.run(sess.id, sess.user_id, sess.expires_at, sess.created_at);
        }
      });
      insertAll();
      console.log(`Copied ${sessions.length} session(s) to auth.db`);
    }
  } catch {
    console.log('No sessions table or data to copy');
  }

  // Copy profile_images data
  try {
    const images = oldDb.prepare(
      'SELECT id, user_id, source, original_url, local_hash, is_primary, fetched_at, created_at, updated_at FROM profile_images'
    ).all() as Array<Record<string, unknown>>;
    if (images.length > 0) {
      const insertImage = authDb.prepare(
        'INSERT INTO profile_images (id, user_id, source, original_url, local_hash, is_primary, fetched_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      const insertAll = authDb.transaction(() => {
        for (const img of images) {
          insertImage.run(
            img.id, img.user_id, img.source, img.original_url,
            img.local_hash, img.is_primary, img.fetched_at,
            img.created_at, img.updated_at
          );
        }
      });
      insertAll();
      console.log(`Copied ${images.length} profile image(s) to auth.db`);
    }
  } catch {
    console.log('No profile_images table or data to copy');
  }

  authDb.close();
  oldDb.close();

  // --- Step 4: Copy contacts.db to user directory ---
  const userDir = path.join(userDataPath, String(adminId));
  const userDbPath = path.join(userDir, 'contacts.db');

  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  fs.copyFileSync(oldDbPath, userDbPath);
  console.log(`Copied contacts.db to ${userDbPath}`);

  // Also copy WAL/SHM files if they exist (for consistency)
  for (const suffix of ['-wal', '-shm']) {
    const walPath = oldDbPath + suffix;
    if (fs.existsSync(walPath)) {
      fs.copyFileSync(walPath, userDbPath + suffix);
    }
  }

  // --- Step 5: Drop auth tables from user DB copy ---
  const userDb = new Database(userDbPath);
  userDb.pragma('foreign_keys = OFF'); // Temporarily disable to allow dropping

  for (const table of AUTH_TABLES) {
    try {
      userDb.exec(`DROP TABLE IF EXISTS ${table}`);
      console.log(`Dropped auth table '${table}' from user DB`);
    } catch (err) {
      console.warn(`Warning: could not drop table '${table}':`, err);
    }
  }

  // Also drop related indexes that reference auth tables
  const orphanedIndexes = userDb
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND (name LIKE 'idx_users_%' OR name LIKE 'idx_sessions_%' OR name LIKE 'idx_profile_images_%')")
    .all() as Array<{ name: string }>;
  for (const idx of orphanedIndexes) {
    try {
      userDb.exec(`DROP INDEX IF EXISTS "${idx.name}"`);
    } catch {
      // Indexes are auto-dropped with the table, ignore
    }
  }

  userDb.pragma('foreign_keys = ON');
  userDb.close();
  console.log('Cleaned auth tables from user DB');

  // --- Step 6: Copy photos to user directory ---
  if (fs.existsSync(oldPhotosPath)) {
    const userPhotosPath = path.join(userDir, 'photos');
    copyDirRecursive(oldPhotosPath, userPhotosPath);
    console.log(`Copied photos to ${userPhotosPath}`);
  } else {
    console.log('No old photos directory found, skipping photo copy');
  }

  // --- Step 7: Rename old DB to .bak ---
  const bakPath = oldDbPath + '.bak';
  fs.renameSync(oldDbPath, bakPath);
  console.log(`Renamed old database to ${bakPath}`);

  // Also move WAL/SHM files
  for (const suffix of ['-wal', '-shm']) {
    const walPath = oldDbPath + suffix;
    if (fs.existsSync(walPath)) {
      fs.renameSync(walPath, bakPath + suffix);
    }
  }

  console.log('Migration complete!');

  return { adminUserId: adminId };
}

// --- CLI entry point ---
if (process.argv[1] && (process.argv[1].endsWith('migrateToMultiTenant.ts') || process.argv[1].endsWith('migrateToMultiTenant.js'))) {
  const oldDbPath = process.env.DATABASE_PATH || './data/contacts.db';
  const oldPhotosPath = process.env.PHOTOS_PATH || './data/photos';
  const authDbPath = process.env.AUTH_DATABASE_PATH || './data/auth.db';
  const userDataPath = process.env.USER_DATA_PATH || './data/users';

  console.log('=== Multi-Tenant Migration ===');
  console.log(`Old DB:     ${path.resolve(oldDbPath)}`);
  console.log(`Old Photos: ${path.resolve(oldPhotosPath)}`);
  console.log(`Auth DB:    ${path.resolve(authDbPath)}`);
  console.log(`User Data:  ${path.resolve(userDataPath)}`);
  console.log('');

  try {
    const result = migrateToMultiTenant({
      oldDbPath,
      oldPhotosPath,
      authDbPath,
      userDataPath,
    });
    console.log(`\nAdmin user ID: ${result.adminUserId}`);
    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

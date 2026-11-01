import Database from 'better-sqlite3';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import { closeAuthDatabase, getAuthDatabase } from './authDatabase.js';
import { closeAllUserDatabases } from './userDatabase.js';

/**
 * Local data sets: the admin can swap the local server between named data
 * folders (the normal dev data, empty sets, copies of production) for testing.
 *
 * - `dev` is the folder the server booted with (AUTH_DATABASE_PATH,
 *   USER_DATA_PATH, PHOTOS_PATH or their ./data defaults). Its files never move.
 * - Every other set is `<data>/datasets/<name>/` holding `auth.db`, `users/`,
 *   `photos/` and `meta.json`.
 * - The active set is remembered in `<data>/active-dataset.json`.
 *
 * Switching works by pointing the three env vars at another folder and closing
 * the cached connections. Every path is read from the env at call time, so the
 * next query opens the new files. Never available on Railway.
 */

export const DEV_DATASET = 'dev';
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export type DatasetKind = 'dev' | 'empty' | 'production-copy';

export interface DatasetInfo {
  name: string;
  kind: DatasetKind;
  createdAt: string | null;
  userCount: number;
  sizeBytes: number;
  active: boolean;
}

interface DatasetPaths {
  auth: string;
  users: string;
  photos: string;
}

export class DatasetError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
  }
}

let devPaths: DatasetPaths | null = null;
let active = DEV_DATASET;

/** Off whenever the server runs on Railway, so production data never switches. */
export function datasetsEnabled(): boolean {
  return !process.env.RAILWAY_ENVIRONMENT_ID && !process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_PROJECT_ID;
}

/** The paths the server booted with: the `dev` set. Captured once. */
function getDevPaths(): DatasetPaths {
  if (!devPaths) {
    devPaths = {
      auth: process.env.AUTH_DATABASE_PATH || './data/auth.db',
      users: process.env.USER_DATA_PATH || './data/users',
      photos: process.env.PHOTOS_PATH || './data/photos',
    };
  }
  return devPaths;
}

function dataRoot(): string {
  return path.dirname(getDevPaths().auth);
}

function datasetsDir(): string {
  return path.join(dataRoot(), 'datasets');
}

function pointerPath(): string {
  return path.join(dataRoot(), 'active-dataset.json');
}

function datasetDir(name: string): string {
  return path.join(datasetsDir(), name);
}

function pathsFor(name: string): DatasetPaths {
  if (name === DEV_DATASET) return getDevPaths();
  const dir = datasetDir(name);
  return { auth: path.join(dir, 'auth.db'), users: path.join(dir, 'users'), photos: path.join(dir, 'photos') };
}

function datasetExists(name: string): boolean {
  return name === DEV_DATASET || fs.existsSync(path.join(datasetDir(name), 'meta.json'));
}

function assertValidName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name) || name === DEV_DATASET) {
    throw new DatasetError('Use 1 to 40 lowercase letters, digits or dashes, not "dev".');
  }
}

function setEnvFor(name: string): void {
  const paths = pathsFor(name);
  process.env.AUTH_DATABASE_PATH = paths.auth;
  process.env.USER_DATA_PATH = paths.users;
  process.env.PHOTOS_PATH = paths.photos;
}

function writeMeta(name: string, kind: Exclude<DatasetKind, 'dev'>): void {
  fs.writeFileSync(
    path.join(datasetDir(name), 'meta.json'),
    JSON.stringify({ kind, createdAt: new Date().toISOString() }, null, 2)
  );
}

/**
 * Points the env at the remembered data set. Call once at boot, before
 * anything opens a database. Falls back to `dev` if the set is gone.
 */
export function applyActiveDataset(): string {
  getDevPaths();
  active = DEV_DATASET;
  if (!datasetsEnabled()) return active;

  try {
    const { name } = JSON.parse(fs.readFileSync(pointerPath(), 'utf8')) as { name?: string };
    if (typeof name === 'string' && name !== DEV_DATASET && NAME_PATTERN.test(name) && datasetExists(name)) {
      active = name;
      setEnvFor(name);
    }
  } catch {
    // No pointer yet, or unreadable: stay on dev
  }
  return active;
}

export function activeDataset(): string {
  return active;
}

function dirSize(dir: string, skip?: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (skip && path.resolve(full) === path.resolve(skip)) continue;
    try {
      if (entry.isDirectory()) total += dirSize(full, skip);
      else if (entry.isFile()) total += fs.statSync(full).size;
    } catch {
      // Unreadable entry: skip
    }
  }
  return total;
}

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function countUsers(authPath: string): number {
  if (!fs.existsSync(authPath)) return 0;
  try {
    const db = new Database(authPath, { readonly: true, fileMustExist: true });
    try {
      return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

export function listDatasets(): DatasetInfo[] {
  const dev = getDevPaths();
  const sets: DatasetInfo[] = [
    {
      name: DEV_DATASET,
      kind: 'dev',
      createdAt: null,
      userCount: countUsers(dev.auth),
      sizeBytes: fileSize(dev.auth) + dirSize(dev.users),
      active: active === DEV_DATASET,
    },
  ];

  if (!fs.existsSync(datasetsDir())) return sets;

  for (const entry of fs.readdirSync(datasetsDir(), { withFileTypes: true })) {
    if (!entry.isDirectory() || !NAME_PATTERN.test(entry.name) || !datasetExists(entry.name)) continue;
    let meta: { kind?: DatasetKind; createdAt?: string } = {};
    try {
      meta = JSON.parse(fs.readFileSync(path.join(datasetDir(entry.name), 'meta.json'), 'utf8'));
    } catch {
      // Keep defaults
    }
    sets.push({
      name: entry.name,
      kind: meta.kind === 'production-copy' ? 'production-copy' : 'empty',
      createdAt: meta.createdAt ?? null,
      userCount: countUsers(pathsFor(entry.name).auth),
      sizeBytes: dirSize(datasetDir(entry.name)),
      active: active === entry.name,
    });
  }

  return sets.sort((a, b) => (a.name === DEV_DATASET ? -1 : b.name === DEV_DATASET ? 1 : a.name.localeCompare(b.name)));
}

export function createEmptyDataset(name: unknown): void {
  assertValidName(name);
  if (fs.existsSync(datasetDir(name))) throw new DatasetError(`A data set called "${name}" already exists.`, 409);
  fs.mkdirSync(path.join(datasetDir(name), 'users'), { recursive: true });
  writeMeta(name, 'empty');
}

export function deleteDataset(name: unknown): void {
  if (name === DEV_DATASET) throw new DatasetError('The dev data set can\'t be deleted.');
  assertValidName(name);
  if (!datasetExists(name)) throw new DatasetError(`No data set called "${name}".`, 404);
  if (name === active) throw new DatasetError('Switch to another data set before deleting this one.');
  fs.rmSync(datasetDir(name), { recursive: true, force: true });
}

export interface DatasetAdmin {
  googleId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Makes `name` the active data set and signs the admin in to it: their user
 * row is copied in if the set doesn't have it, and a fresh session is created.
 * Returns the new session ID for the caller to set as the cookie.
 */
export function switchDataset(name: unknown, admin: DatasetAdmin): { sessionId: string; userId: number } {
  if (typeof name !== 'string' || !datasetExists(name) || (name !== DEV_DATASET && !NAME_PATTERN.test(name))) {
    throw new DatasetError(`No data set called "${String(name)}".`, 404);
  }

  closeAllUserDatabases();
  closeAuthDatabase();
  setEnvFor(name);
  active = name;
  fs.mkdirSync(dataRoot(), { recursive: true });
  fs.writeFileSync(pointerPath(), JSON.stringify({ name }, null, 2));

  const db = getAuthDatabase();
  let user = db.prepare('SELECT id FROM users WHERE email = ?').get(admin.email) as { id: number } | undefined;
  if (!user) {
    user = db.prepare('SELECT id FROM users WHERE google_id = ?').get(admin.googleId) as { id: number } | undefined;
  }
  if (!user) {
    const result = db
      .prepare('INSERT INTO users (google_id, email, name, avatar_url, has_onboarded) VALUES (?, ?, ?, ?, 1)')
      .run(admin.googleId, admin.email, admin.name, admin.avatarUrl);
    user = { id: Number(result.lastInsertRowid) };
  }

  const sessionId = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    sessionId,
    user.id,
    new Date(Date.now() + SESSION_DURATION_MS).toISOString()
  );

  return { sessionId, userId: user.id };
}

function runTar(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', args, { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `tar exited with ${code}`))));
  });
}

/** Archive entries must stay inside the target folder. */
export function isSafeArchivePath(entry: string): boolean {
  if (!entry || entry.startsWith('/') || entry.includes('\\')) return false;
  return !entry.split('/').includes('..');
}

/**
 * Removes every stored credential from a copied data set, so a production copy
 * can never reach the real Gmail, Google Contacts, iCloud or Apify accounts.
 * Same columns as services/tokenKeyRotation.ts.
 */
function wipeCredentials(paths: DatasetPaths): void {
  const auth = new Database(paths.auth, { fileMustExist: true });
  try {
    auth.prepare('UPDATE users SET access_token = NULL, refresh_token = NULL, token_expires_at = NULL').run();
    auth.prepare('DELETE FROM sessions').run();
  } finally {
    auth.close();
  }

  if (!fs.existsSync(paths.users)) return;
  for (const entry of fs.readdirSync(paths.users, { withFileTypes: true })) {
    const dbPath = path.join(paths.users, entry.name, 'contacts.db');
    if (!entry.isDirectory() || !fs.existsSync(dbPath)) continue;
    const db = new Database(dbPath);
    try {
      db.prepare('UPDATE user_settings SET apify_api_token = NULL, icloud_app_password = NULL').run();
    } catch {
      // Older database without these columns: nothing to wipe
    } finally {
      db.close();
    }
  }
}

/**
 * Creates the data set `name` from a backup archive (GET /api/admin/backup),
 * then wipes its credentials.
 */
export async function importDataset(name: unknown, archive: Readable): Promise<void> {
  assertValidName(name);
  if (fs.existsSync(datasetDir(name))) throw new DatasetError(`A data set called "${name}" already exists.`, 409);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-dataset-'));
  const archivePath = path.join(tmpDir, 'backup.tar.gz');
  const target = datasetDir(name);

  try {
    await pipeline(archive, fs.createWriteStream(archivePath));

    let entries: string[];
    try {
      entries = (await runTar(['-tzf', archivePath])).split('\n').map(line => line.trim()).filter(Boolean);
    } catch {
      throw new DatasetError('That file isn\'t a Yello backup (expected a .tar.gz).');
    }
    if (entries.some(entry => !isSafeArchivePath(entry))) {
      throw new DatasetError('The backup contains unsafe file paths.');
    }

    fs.mkdirSync(target, { recursive: true });
    await runTar(['-xzf', archivePath, '-C', target]);

    const paths = pathsFor(name);
    if (!fs.existsSync(paths.auth)) throw new DatasetError('The backup has no auth.db.');
    fs.mkdirSync(paths.users, { recursive: true });

    wipeCredentials(paths);
    writeMeta(name, 'production-copy');
  } catch (error) {
    fs.rmSync(target, { recursive: true, force: true });
    throw error;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Test hook: forget the captured boot paths. */
export function _resetDatasetsForTests(): void {
  devPaths = null;
  active = DEV_DATASET;
}

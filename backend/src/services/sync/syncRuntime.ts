import crypto from 'crypto';
import type { Database as DatabaseType } from 'better-sqlite3';
import { unfoldLines } from '../vcardParser.js';
import type { SyncProvider } from './syncState.js';

/**
 * Bookkeeping shared by the provider sync engines: the per-user lock, the
 * sync_runs record, provider state, the remote-version log and the
 * mass-change guard.
 */

/** The remote record changed since the version (etag) the engine last saw. */
export class PreconditionFailedError extends Error {
  constructor(readonly url: string) {
    super(`Changed on the server since it was read: ${url}`);
  }
}

/** The provider refused the credentials or the permission; sync pauses. */
export class RemoteAuthError extends Error {}

/** The provider is rate-limiting or briefly unavailable. */
export class RemoteRetryLaterError extends Error {
  constructor(readonly retryAfterSeconds: number | null, message: string) {
    super(message);
  }
}

export type SyncTrigger = 'cutover' | 'scheduled' | 'manual' | 'local_edit';

export interface SyncCounters {
  pulledCreated: number;
  pulledUpdated: number;
  pulledArchived: number;
  pushedCreated: number;
  pushedUpdated: number;
  pushedDeleted: number;
  conflicts: number;
}

export interface SyncRunError {
  contactId: number | null;
  remoteId: string | null;
  message: string;
}

export type SyncRunStatus = 'completed' | 'failed' | 'paused' | 'skipped';

export interface SyncRunResult {
  runId: number | null;
  status: SyncRunStatus;
  /** Why the run was skipped, failed or paused the provider. */
  reason: string | null;
  counters: SyncCounters;
  errors: SyncRunError[];
}

export const emptyCounters = (): SyncCounters => ({
  pulledCreated: 0, pulledUpdated: 0, pulledArchived: 0,
  pushedCreated: 0, pushedUpdated: 0, pushedDeleted: 0, conflicts: 0
});

const MAX_STORED_ERRORS = 100;
const LEASE_MS = 15 * 60 * 1000;

export interface SyncProviderRow {
  provider: SyncProvider;
  enabled: number;
  paused: number;
  collection_url: string | null;
  sync_token: string | null;
  ctag: string | null;
  consecutive_failures: number;
  last_run_at: string | null;
  cutover_completed_at: string | null;
  lock_holder: string | null;
  lock_until: string | null;
}

export function getProviderRow(db: DatabaseType, provider: SyncProvider): SyncProviderRow {
  return db.prepare('SELECT * FROM sync_providers WHERE provider = ?').get(provider) as SyncProviderRow;
}

export function updateProvider(db: DatabaseType, provider: SyncProvider, values: Record<string, unknown>): void {
  const columns = Object.keys(values);
  db.prepare(`UPDATE sync_providers SET ${columns.map(c => `${c} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE provider = ?`)
    .run(...columns.map(c => values[c] ?? null), provider);
}

/** Runs in progress in this process, by `${userId}:${provider}`. */
const inProcess = new Set<string>();
const HOLDER = `${process.pid}-${crypto.randomUUID().slice(0, 8)}`;

/**
 * Takes the per-user, per-provider lock: in memory for this process, and a
 * lease in sync_providers so a second container (a deploy overlap) cannot
 * run the same sync at once. Returns a release function, or null if taken.
 */
export function acquireSyncLock(db: DatabaseType, userId: number, provider: SyncProvider): (() => void) | null {
  const key = `${userId}:${provider}`;
  if (inProcess.has(key)) return null;
  const now = new Date();
  const until = new Date(now.getTime() + LEASE_MS).toISOString();
  const taken = db.prepare(`
    UPDATE sync_providers SET lock_holder = ?, lock_until = ?
    WHERE provider = ? AND (lock_until IS NULL OR lock_until < ? OR lock_holder = ?)
  `).run(HOLDER, until, provider, now.toISOString(), HOLDER);
  if (taken.changes !== 1) return null;
  inProcess.add(key);
  return () => {
    inProcess.delete(key);
    db.prepare('UPDATE sync_providers SET lock_holder = NULL, lock_until = NULL WHERE provider = ? AND lock_holder = ?')
      .run(provider, HOLDER);
  };
}

export function isSyncRunning(userId: number, provider: SyncProvider): boolean {
  return inProcess.has(`${userId}:${provider}`);
}

export function startRun(db: DatabaseType, provider: SyncProvider, trigger: SyncTrigger): number {
  return db.prepare("INSERT INTO sync_runs (provider, trigger, status) VALUES (?, ?, 'running')")
    .run(provider, trigger).lastInsertRowid as number;
}

export function finishRun(
  db: DatabaseType,
  runId: number,
  status: 'completed' | 'failed' | 'paused',
  counters: SyncCounters,
  errors: SyncRunError[]
): void {
  db.prepare(`
    UPDATE sync_runs SET status = ?, finished_at = ?, pulled_created = ?, pulled_updated = ?, pulled_archived = ?,
      pushed_created = ?, pushed_updated = ?, pushed_deleted = ?, conflicts = ?, errors_json = ?
    WHERE id = ?
  `).run(
    status, new Date().toISOString(), counters.pulledCreated, counters.pulledUpdated, counters.pulledArchived,
    counters.pushedCreated, counters.pushedUpdated, counters.pushedDeleted, counters.conflicts,
    errors.length ? JSON.stringify(errors.slice(0, MAX_STORED_ERRORS)) : null, runId
  );
}

export function pushError(errors: SyncRunError[], error: SyncRunError): void {
  if (errors.length < MAX_STORED_ERRORS) errors.push(error);
}

export type RemoteVersionReason = 'conflict_yello_won' | 'remote_delete' | 'pre_update' | 'cutover_conflict' | 'cutover_delete';

/** A vCard without its PHOTO lines: the version log keeps data, not images. */
export function withoutPhoto(card: string): string {
  return unfoldLines(card).split(/\r?\n/).filter(line => !/^(?:[\w-]+\.)?PHOTO[;:]/i.test(line)).join('\r\n');
}

export function logRemoteVersion(
  db: DatabaseType,
  entry: { runId: number | null; contactId: number | null; provider: SyncProvider; remoteId: string; reason: RemoteVersionReason; payload: string }
): void {
  db.prepare(`
    INSERT INTO sync_remote_versions (run_id, contact_id, provider, remote_id, reason, payload) VALUES (?, ?, ?, ?, ?, ?)
  `).run(entry.runId, entry.contactId, entry.provider, entry.remoteId, entry.reason, entry.payload);
}

/** Remote versions are kept this long (restore window). */
export const REMOTE_VERSION_RETENTION_DAYS = 180;

export function pruneRemoteVersions(db: DatabaseType): void {
  db.prepare(`DELETE FROM sync_remote_versions WHERE created_at < datetime('now', ?)`).run(`-${REMOTE_VERSION_RETENTION_DAYS} days`);
}

/**
 * A run that would delete, archive or create more than this many contacts in
 * one go stops and asks first: it is far more likely a wrong address book, a
 * server glitch or a big import than something meant.
 */
export function massChangeThreshold(linkedCount: number): number {
  return Math.max(20, Math.ceil(linkedCount * 0.05));
}
export const MASS_CREATE_THRESHOLD = 300;

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

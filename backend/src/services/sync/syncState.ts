import type { Database as DatabaseType } from 'better-sqlite3';

export type SyncProvider = 'icloud' | 'google';

export interface SyncProviderState {
  provider: SyncProvider;
  enabled: boolean;
  paused: boolean;
  collectionUrl: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  cutoverCompletedAt: string | null;
}

interface SyncProviderRow {
  provider: SyncProvider;
  enabled: number;
  paused: number;
  collection_url: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  cutover_completed_at: string | null;
}

export function getSyncProviders(db: DatabaseType): SyncProviderState[] {
  const rows = db.prepare(`
    SELECT provider, enabled, paused, collection_url, last_run_at, last_success_at, last_error, cutover_completed_at
    FROM sync_providers ORDER BY provider DESC
  `).all() as SyncProviderRow[];
  return rows.map(row => ({
    provider: row.provider,
    enabled: row.enabled === 1,
    paused: row.paused === 1,
    collectionUrl: row.collection_url,
    lastRunAt: row.last_run_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    cutoverCompletedAt: row.cutover_completed_at
  }));
}

/** True while any remote address book is synced from this database. */
export function isSyncEnabled(db: DatabaseType): boolean {
  const row = db.prepare('SELECT 1 FROM sync_providers WHERE enabled = 1 LIMIT 1').get();
  return row !== undefined;
}

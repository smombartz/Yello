import { getUserDatabase, listUserIds } from '../userDatabase.js';
import { runICloudSync } from './icloudSyncEngine.js';
import { runGoogleSync } from './googleSyncEngine.js';
import { getProviderRow, type SyncRunResult, type SyncTrigger } from './syncRuntime.js';
import type { SyncProvider } from './syncState.js';
import type { ICloudRemote } from './icloudRemote.js';
import type { GoogleRemote } from './googleRemote.js';

/**
 * When sync runs on its own: every SYNC_INTERVAL_MINUTES (default 10) for
 * every user with a provider switched on, and SYNC_EDIT_DELAY_SECONDS
 * (default 45) after the last edit made in Yello, so a change reaches the
 * phone without waiting for the next round. Only with SYNC_ENGINE=1.
 *
 * Users are synced one after another, never in parallel, and a round is
 * skipped while the previous one is still going. A provider that keeps
 * failing is tried less often (every `consecutive_failures` rounds, up to
 * an hour apart), so a revoked password does not hammer iCloud.
 */

export const syncIntervalMinutes = () => Math.max(1, Number(process.env.SYNC_INTERVAL_MINUTES) || 10);
const editDelayMs = () => Math.max(5, Number(process.env.SYNC_EDIT_DELAY_SECONDS) || 45) * 1000;

/** Providers in sync order: iCloud first, so a phone edit reaches Google in the same pass. */
const ORDER: SyncProvider[] = ['icloud', 'google'];

/** The providers this user syncs (switched over, on, not paused). */
export function activeProviders(userId: number): SyncProvider[] {
  const db = getUserDatabase(userId);
  return ORDER.filter(provider => {
    const row = getProviderRow(db, provider);
    return row.enabled && !row.paused && row.cutover_completed_at;
  });
}

/** Syncs every active provider of a user, iCloud first. */
export interface SyncRemotes {
  icloud?: ICloudRemote;
  google?: GoogleRemote;
}

export async function runAllSyncs(
  userId: number,
  trigger: SyncTrigger,
  options: { confirmLargeChanges?: boolean; remotes?: SyncRemotes; only?: SyncProvider[] } = {}
): Promise<Partial<Record<SyncProvider, SyncRunResult>>> {
  const { remotes = {}, only, ...runOptions } = options;
  const results: Partial<Record<SyncProvider, SyncRunResult>> = {};
  for (const provider of ORDER) {
    if (only && !only.includes(provider)) continue;
    const row = getProviderRow(getUserDatabase(userId), provider);
    if (!row.enabled || !row.cutover_completed_at) continue;
    results[provider] = provider === 'icloud'
      ? await runICloudSync(userId, { trigger, ...runOptions, remote: remotes.icloud })
      : await runGoogleSync(userId, { trigger, ...runOptions, remote: remotes.google });
  }
  return results;
}

/** A failing provider waits `failures` rounds (capped at an hour) before the next try. */
function dueAfterFailures(lastRunAt: string | null, failures: number, now = Date.now()): boolean {
  if (failures < 2 || !lastRunAt) return true;
  const waitMs = Math.min(failures * syncIntervalMinutes(), 60) * 60_000;
  return now - new Date(lastRunAt).getTime() >= waitMs;
}

let round: Promise<void> | null = null;

/** One scheduled round over every user. Exported for tests. */
export async function runScheduledRound(log: SchedulerLog = console, remotes: SyncRemotes = {}): Promise<void> {
  for (const userId of listUserIds()) {
    let due: SyncProvider[];
    try {
      const db = getUserDatabase(userId);
      due = activeProviders(userId).filter(p => {
        const row = getProviderRow(db, p);
        return dueAfterFailures(row.last_run_at, row.consecutive_failures);
      });
    } catch (error) {
      log.error(error, `Sync scheduler could not read user ${userId}`);
      continue;
    }
    if (!due.length) continue;
    try {
      const results = await runAllSyncs(userId, 'scheduled', { remotes, only: due });
      for (const [provider, result] of Object.entries(results)) {
        if (result && result.status !== 'completed' && result.status !== 'skipped') {
          log.info(`Sync ${provider} for user ${userId}: ${result.status} — ${result.reason}`);
        }
      }
    } catch (error) {
      log.error(error, `Sync failed for user ${userId}`);
    }
  }
}

interface SchedulerLog {
  info: (msg: string) => void;
  error: (err: unknown, msg: string) => void;
}

let timer: NodeJS.Timeout | null = null;

/** Starts the periodic rounds (no-op without SYNC_ENGINE=1). */
export function startSyncScheduler(log: SchedulerLog): void {
  if (process.env.SYNC_ENGINE !== '1' || timer) return;
  timer = setInterval(() => {
    if (round) return; // the previous round is still going
    round = runScheduledRound(log).finally(() => { round = null; });
  }, syncIntervalMinutes() * 60_000);
  timer.unref();
  log.info(`Sync scheduler: every ${syncIntervalMinutes()} minutes`);
}

export function stopSyncScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  for (const pending of editTimers.values()) clearTimeout(pending);
  editTimers.clear();
}

const editTimers = new Map<number, NodeJS.Timeout>();

/**
 * Debounced sync after an edit in Yello: each edit restarts the countdown, so
 * a burst of edits (a merge, a cleanup) becomes one sync.
 */
export function scheduleSyncAfterEdit(userId: number, log: SchedulerLog = console): void {
  if (process.env.SYNC_ENGINE !== '1') return;
  const pending = editTimers.get(userId);
  if (pending) clearTimeout(pending);
  const handle = setTimeout(() => {
    editTimers.delete(userId);
    if (!activeProviders(userId).length) return;
    runAllSyncs(userId, 'local_edit').catch(error => log.error(error, `Sync after edit failed for user ${userId}`));
  }, editDelayMs());
  handle.unref();
  editTimers.set(userId, handle);
}

/** Routes whose successful writes change contacts. */
const EDITING_PREFIXES = ['/api/contacts', '/api/archive', '/api/duplicates', '/api/cleanup', '/api/import', '/api/profile'];

/** Whether a finished request may have changed contacts (and so should trigger a sync). */
export function isContactEdit(method: string, url: string, statusCode: number): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  if (statusCode < 200 || statusCode >= 300) return false;
  const path = url.split('?')[0];
  return EDITING_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

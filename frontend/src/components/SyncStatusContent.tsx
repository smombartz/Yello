import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';
import {
  usePauseSync,
  useRunSync,
  useSyncRuns,
  useSyncStatus,
  type BackupProvider,
  type SyncProviderState,
  type SyncRun,
  type SyncRunResult,
} from '../api/syncHooks';

const NAMES: Record<BackupProvider, { name: string; icon: string }> = {
  icloud: { name: 'Apple iCloud', icon: 'apple' },
  google: { name: 'Google Contacts', icon: 'google' },
};

const TRIGGERS: Record<SyncRun['trigger'], string> = {
  scheduled: 'scheduled', manual: 'by hand', local_edit: 'after an edit', cutover: 'the switch',
};

/** "3 min ago", "yesterday", or a date. */
function ago(iso: string | null): string {
  if (!iso) return 'never';
  const time = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).getTime();
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return new Date(time).toLocaleDateString();
}

function runSummary(run: Pick<SyncRun, 'pulled_created' | 'pulled_updated' | 'pulled_archived' | 'pushed_created' | 'pushed_updated' | 'pushed_deleted' | 'conflicts'>): string {
  const parts = [
    run.pulled_updated && `${run.pulled_updated} changes in`,
    run.pulled_created && `${run.pulled_created} new in`,
    run.pulled_archived && `${run.pulled_archived} archived`,
    run.pushed_updated && `${run.pushed_updated} updated there`,
    run.pushed_created && `${run.pushed_created} created there`,
    run.pushed_deleted && `${run.pushed_deleted} removed there`,
    run.conflicts && `${run.conflicts} kept Yello’s version`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'nothing to change';
}

function resultMessage(provider: BackupProvider, result: SyncRunResult): string {
  const name = NAMES[provider].name;
  if (result.status === 'completed') {
    const c = result.counters;
    return `${name}: ${runSummary({
      pulled_created: c.pulledCreated, pulled_updated: c.pulledUpdated, pulled_archived: c.pulledArchived,
      pushed_created: c.pushedCreated, pushed_updated: c.pushedUpdated, pushed_deleted: c.pushedDeleted, conflicts: c.conflicts,
    })}`;
  }
  return `${name}: ${result.reason ?? result.status}`;
}

function ProviderStatus({ state, running, engineEnabled }: { state: SyncProviderState; running: boolean; engineEnabled: boolean }) {
  const [reviewing, setReviewing] = useState(false);
  const runSync = useRunSync();
  const pause = usePauseSync();
  const { showToast } = useToast();
  const { name, icon } = NAMES[state.provider];

  const switchedOver = !!state.cutoverCompletedAt;
  const heldBack = state.paused && !!state.lastError;
  const badge = !switchedOver
    ? { label: 'Not switched over', variant: 'neutral' as const }
    : !state.enabled
      ? { label: 'Off', variant: 'neutral' as const }
      : state.paused
        ? { label: heldBack ? 'Needs you' : 'Paused', variant: 'warning' as const }
        : { label: 'On', variant: 'success' as const };

  const run = (confirmLargeChanges = false) => runSync.mutate({ provider: state.provider, confirmLargeChanges }, {
    onSuccess: results => {
      const result = results[state.provider];
      if (result) showToast(resultMessage(state.provider, result), { type: result.status === 'completed' ? 'success' : 'error' });
    },
    onError: error => showToast(error.message, { type: 'error' }),
  });

  return (
    <div className="backup-provider">
      <div className="backup-provider-header">
        <Icon name={icon} style="brands" />
        <h3>{name}</h3>
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {switchedOver && state.enabled && engineEnabled && (
          <span className="backup-provider-action sync-actions">
            {state.paused ? (
              heldBack
                ? <Button size="sm" icon="triangle-exclamation" onClick={() => setReviewing(true)}>Review</Button>
                : <Button size="sm" icon="play" loading={pause.isPending} onClick={() => pause.mutate({ provider: state.provider, pause: false })}>Resume</Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" icon="pause" loading={pause.isPending} onClick={() => pause.mutate({ provider: state.provider, pause: true })}>Pause</Button>
                <Button size="sm" icon="rotate" loading={running || runSync.isPending} onClick={() => run()}>Sync now</Button>
              </>
            )}
          </span>
        )}
      </div>
      {switchedOver ? (
        <p className="backup-meta">
          Last synced {ago(state.lastSuccessAt)}{running && ' · syncing now…'}
        </p>
      ) : (
        <p className="backup-meta">Switch this address book over on the <Link to="/migration">Migration</Link> page.</p>
      )}
      {state.lastError && <p className={heldBack ? 'backup-gate' : 'backup-error'}>{state.lastError}</p>}

      {reviewing && (
        <ConfirmDialog
          title={`Continue syncing ${name}?`}
          confirmLabel="Continue"
          danger
          onCancel={() => setReviewing(false)}
          onConfirm={() => { setReviewing(false); run(true); }}
        >
          <p>{state.lastError}</p>
          <p className="backup-meta">
            Sync held back because this is far more than usual. If you expected it (a big cleanup, a large import),
            continue. If not, keep it paused and check {name} first; removing many cards also needs a fresh backup.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/**
 * Sync with iCloud and Google after the switch: per-book status, Sync now,
 * Pause, and the recent runs.
 */
export function SyncStatusContent() {
  const { data } = useSyncStatus();
  const [showRuns, setShowRuns] = useState(false);
  const runs = useSyncRuns(showRuns);
  if (!data) return <p className="backup-meta">Loading…</p>;

  return (
    <>
      <p className="settings-description">
        Yello keeps iCloud and Google up to date: every {data.intervalMinutes} minutes, and shortly after you change
        a contact here. Changes made on your phone or in Gmail come in the same way; where both sides changed the
        same detail, Yello’s version wins and the other one is kept under the contact’s earlier versions.
      </p>
      {!data.engineEnabled && <p className="backup-meta">Sync is not enabled on this server yet (SYNC_ENGINE=1).</p>}
      {data.providers.map(state => (
        <ProviderStatus key={state.provider} state={state} running={data.running.includes(state.provider)} engineEnabled={data.engineEnabled} />
      ))}

      <details className="backup-guide" onToggle={e => setShowRuns((e.target as HTMLDetailsElement).open)}>
        <summary>Recent syncs</summary>
        {runs.data && (
          runs.data.runs.length ? (
            <ul className="sync-runs">
              {runs.data.runs.map(run => (
                <li key={run.id}>
                  <span className="sync-run-when">{ago(run.started_at)}</span>
                  <span>
                    <strong>{NAMES[run.provider].name}</strong> ({TRIGGERS[run.trigger]}) —{' '}
                    {run.status === 'completed' ? runSummary(run) : run.status}
                    {run.errors.length > 0 && <span className="backup-error"> · {run.errors.length} problem{run.errors.length === 1 ? '' : 's'}: {run.errors[0].message}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p>No syncs yet.</p>
        )}
      </details>
    </>
  );
}

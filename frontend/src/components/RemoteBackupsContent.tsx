import { useState } from 'react';
import { Icon } from './Icon';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Badge } from './ui/Badge';
import { useToast } from './ui/Toast';
import {
  backupFileUrl,
  useConfirmBackup,
  useRemoteBackups,
  useRestoreBackup,
  useStartBackup,
  useSyncStatus,
  type BackupManifest,
  type BackupProvider,
  type DeletionGate,
} from '../api/syncHooks';

const PROVIDERS: Array<{ id: BackupProvider; name: string; icon: string }> = [
  { id: 'icloud', name: 'Apple iCloud', icon: 'apple' },
  { id: 'google', name: 'Google Contacts', icon: 'google' },
];

const STATUS_BADGE: Record<BackupManifest['status'], { label: string; variant: 'success' | 'warning' | 'error' | 'info' }> = {
  running: { label: 'Backing up…', variant: 'info' },
  verified: { label: 'Verified', variant: 'success' },
  unverified: { label: 'Incomplete', variant: 'warning' },
  failed: { label: 'Failed', variant: 'error' },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function BackupSummary({ backup }: { backup: BackupManifest }) {
  const parts = [`${backup.remoteCount.toLocaleString()} contacts`];
  if (backup.groupCount > 0) parts.push(`${backup.groupCount} ${backup.provider === 'icloud' ? 'groups' : 'labels'}`);
  if (backup.photosIncluded > 0) parts.push(`${backup.photosIncluded.toLocaleString()} photos`);
  return (
    <p className="backup-meta">
      {formatWhen(backup.createdAt)}
      {backup.account && <> · {backup.account}</>}
      {backup.status !== 'running' && backup.status !== 'failed' && <> · {parts.join(', ')}</>}
    </p>
  );
}

function ProviderBackup({ provider, latest, gate }: {
  provider: typeof PROVIDERS[number];
  latest: BackupManifest | undefined;
  gate: DeletionGate | undefined;
}) {
  const startBackup = useStartBackup();
  const confirmBackup = useConfirmBackup();
  const { showToast } = useToast();
  const isRunning = latest?.status === 'running';

  return (
    <div className="backup-provider">
      <div className="backup-provider-header">
        <Icon name={provider.icon} style="brands" />
        <h3>{provider.name}</h3>
        {latest && <Badge variant={STATUS_BADGE[latest.status].variant}>{STATUS_BADGE[latest.status].label}</Badge>}
        <Button
          size="sm"
          icon="box-archive"
          className="backup-provider-action"
          loading={isRunning || startBackup.isPending}
          onClick={() => startBackup.mutate(provider.id, {
            onError: (error) => showToast(error.message, { type: 'error' }),
          })}
        >
          {latest ? 'Back up again' : 'Back up now'}
        </Button>
      </div>

      {!latest && <p className="backup-meta">No backup yet.</p>}
      {latest && <BackupSummary backup={latest} />}
      {latest?.error && <p className="backup-error">{latest.error}</p>}

      {latest && latest.status !== 'running' && latest.files.length > 0 && (
        <ul className="backup-files">
          {latest.files.map(file => (
            <li key={file.name}>
              <a href={backupFileUrl(latest.id, file.name)} download>
                <Icon name="download" /> {file.name}
              </a>
              <span className="backup-file-size">{formatBytes(file.bytes)}</span>
              <span className="backup-file-description">{file.description}</span>
            </li>
          ))}
        </ul>
      )}

      {latest?.status === 'verified' && (
        <label className="backup-confirm">
          <input
            type="checkbox"
            checked={!!latest.confirmedAt}
            disabled={!!latest.confirmedAt || confirmBackup.isPending}
            onChange={() => confirmBackup.mutate(latest.id, {
              onError: (error) => showToast(error.message, { type: 'error' }),
            })}
          />
          I downloaded this backup (or made my own) and keep it somewhere safe.
        </label>
      )}

      {latest?.status === 'verified' && <RestoreBackup provider={provider} backup={latest} />}

      {gate && (
        <p className={`backup-gate${gate.allowed ? ' backup-gate--open' : ''}`}>
          <Icon name={gate.allowed ? 'lock-open' : 'lock'} />
          {gate.allowed
            ? 'Backed up. Sync may now remove duplicates from this address book (for the next 24 hours).'
            : gate.reason}
        </p>
      )}
    </div>
  );
}

/** Putting a backup back into its address book: the escape hatch after a switch gone wrong. */
function RestoreBackup({ provider, backup }: { provider: typeof PROVIDERS[number]; backup: BackupManifest }) {
  const [asking, setAsking] = useState(false);
  const [mode, setMode] = useState<'missing' | 'all'>('missing');
  const [waitingFor, setWaitingFor] = useState<number | null>(null);
  const restore = useRestoreBackup();
  const status = useSyncStatus();
  const { showToast } = useToast();
  const restores = backup.restores ?? [];
  const restoring = waitingFor !== null && restores.length <= waitingFor;
  useRemoteBackups(restoring);

  const syncOn = status.data?.providers.find(p => p.provider === provider.id)?.enabled ?? false;
  const last = restores[restores.length - 1];
  const where = provider.id === 'icloud' ? 'iCloud' : 'Google';

  return (
    <div className="backup-restore">
      <Button
        size="sm"
        variant="ghost"
        icon="clock-rotate-left"
        loading={restoring || restore.isPending}
        disabled={syncOn}
        onClick={() => setAsking(true)}
      >
        Restore this backup to {where}…
      </Button>
      {syncOn && <span className="backup-meta"> Turn {where} sync off to restore.</span>}
      {last && !restoring && (
        <p className="backup-meta">
          Restored {new Date(last.finishedAt).toLocaleString()}: {last.recreated} put back
          {last.reverted ? `, ${last.reverted} reverted` : ''}{last.failed ? `, ${last.failed} failed` : ''}.
          {last.errors[0] && <span className="backup-error"> {last.errors[0]}</span>}
        </p>
      )}
      {asking && (
        <ConfirmDialog
          title={`Restore to ${where}?`}
          confirmLabel="Restore"
          danger={mode === 'all'}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            setWaitingFor(restores.length);
            restore.mutate({ backupId: backup.id, mode }, {
              onError: error => { setWaitingFor(null); showToast(error.message, { type: 'error' }); },
            });
          }}
        >
          <label className="backup-confirm">
            <input type="radio" name="restore-mode" checked={mode === 'missing'} onChange={() => setMode('missing')} />
            Put back every card from this backup that is no longer in {where}.
          </label>
          <label className="backup-confirm">
            <input type="radio" name="restore-mode" checked={mode === 'all'} onChange={() => setMode('all')} />
            Also undo every change made since: cards that changed get this backup’s version again.
          </label>
          <p className="backup-meta">
            Cards added since the backup are left alone.
            {provider.id === 'google' && ' Google gives re-created contacts a new ID, and their photos are not restored.'}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/**
 * Backups of the Apple and Google address books. Nothing is ever deleted
 * from either until it has a verified, confirmed backup from the last 24 hours.
 */
export function RemoteBackupsContent() {
  const { data, isLoading } = useRemoteBackups();

  return (
    <>
      <p className="settings-description">
        Before Yello syncs, and before anything is removed from iCloud or Google, take a backup of each
        address book and download the files. Each backup holds a <strong>.vcf</strong> file the provider’s
        own app can import again, a full-detail copy, and a snapshot of your Yello database.
      </p>

      {isLoading ? (
        <p className="backup-meta">Loading…</p>
      ) : (
        PROVIDERS.map(provider => (
          <ProviderBackup
            key={provider.id}
            provider={provider}
            latest={data?.backups.find(b => b.provider === provider.id)}
            gate={data?.gates[provider.id]}
          />
        ))
      )}

      <details className="backup-guide">
        <summary>Also make your own backups (recommended)</summary>
        <ol>
          <li>
            <strong>Mac Contacts:</strong> open Contacts, choose File › Export › Contacts Archive…, and save
            the <em>.abbu</em> file. Double-clicking it later restores everything, groups included.
          </li>
          <li>
            <strong>iCloud.com:</strong> go to <a href="https://www.icloud.com/contacts" target="_blank" rel="noopener noreferrer">icloud.com/contacts</a>,
            select all contacts, then use the ⋯ menu › Export vCard.
          </li>
          <li>
            <strong>Google:</strong> go to <a href="https://contacts.google.com" target="_blank" rel="noopener noreferrer">contacts.google.com</a>,
            choose Export › Google CSV › Export. For everything (labels and photos too), use{' '}
            <a href="https://takeout.google.com" target="_blank" rel="noopener noreferrer">Google Takeout</a> with only Contacts selected.
          </li>
        </ol>
        <p>Keep these files until at least 90 days after switching to Yello.</p>
      </details>
    </>
  );
}

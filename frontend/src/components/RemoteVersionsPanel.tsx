import { useState } from 'react';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';
import { useRemoteVersions, useRestoreRemoteVersion, type RemoteVersion } from '../api/syncHooks';

const WHERE: Record<RemoteVersion['provider'], string> = { icloud: 'iCloud', google: 'Google' };

const WHY: Record<RemoteVersion['reason'], string> = {
  conflict_yello_won: 'changed there while Yello changed the same details; Yello’s version was kept',
  remote_delete: 'removed there',
  pre_update: 'replaced by Yello’s version',
  cutover_conflict: 'differed when you switched to Yello; Yello’s version was kept',
  cutover_delete: 'removed when you switched to Yello',
};

/**
 * The iCloud / Google versions of this contact that sync overwrote or
 * removed. Restoring one makes the contact look like it again; the next sync
 * writes it back to both address books. Renders nothing when there are none.
 */
export function RemoteVersionsPanel({ contactId }: { contactId: number }) {
  const { data } = useRemoteVersions(contactId);
  const restore = useRestoreRemoteVersion();
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState<RemoteVersion | null>(null);
  const versions = data?.versions ?? [];
  if (!versions.length) return null;

  return (
    <section className="remote-versions">
      <h3>Earlier versions from iCloud and Google</h3>
      <ul>
        {versions.map(version => (
          <li key={version.id}>
            <div>
              <span className="backup-meta">
                {new Date(`${version.createdAt.replace(' ', 'T')}Z`).toLocaleString()} · {WHERE[version.provider]} · {WHY[version.reason]}
              </span>
              {version.preview && (
                <p>
                  <strong>{version.preview.displayName}</strong>
                  {version.preview.lines.map(line => <span key={line}> · {line}</span>)}
                </p>
              )}
            </div>
            {version.restorable && (
              version.restoredAt
                ? <span className="backup-meta">Restored</span>
                : <Button size="sm" icon="clock-rotate-left" onClick={() => setConfirming(version)}>Restore</Button>
            )}
          </li>
        ))}
      </ul>
      {confirming && (
        <ConfirmDialog
          title="Restore this version?"
          confirmLabel="Restore"
          confirmDisabled={restore.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() => restore.mutate(confirming.id, {
            onSuccess: () => { setConfirming(null); showToast('Restored. The next sync writes it to iCloud and Google.'); },
            onError: error => { setConfirming(null); showToast(error.message, { type: 'error' }); },
          })}
        >
          <p>
            The contact’s details become this {WHERE[confirming.provider]} version again, replacing what Yello has now.
            The next sync writes it to iCloud and Google.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

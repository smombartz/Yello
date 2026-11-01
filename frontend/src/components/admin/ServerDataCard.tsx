import { useEffect, useRef, useState } from 'react';
import {
  BACKUP_URL,
  importDatasetFile,
  switchDataset,
  useCreateDataset,
  useDatasets,
  useDeleteDataset,
  type Dataset,
} from '../../api/adminHooks';
import {
  desktopErrorText,
  getDesktopServer,
  type DesktopServerState,
  type PullProgress,
  type ServerTarget,
} from '../../lib/desktopServer';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';

const KIND_LABEL: Record<Dataset['kind'], string> = {
  dev: 'Dev data',
  empty: 'Empty',
  'production-copy': 'Production copy',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function defaultSetName(): string {
  return `prod-${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Admin testing tool: which server the desktop app opens (Railway or a local
 * backend) and, on a local server, which data set it uses. See
 * electron/src/serverSwitch.ts and backend/src/services/datasets.ts.
 */
export function ServerDataCard() {
  const desktop = getDesktopServer();
  const { showToast } = useToast();
  const { data, isLoading, error, refetch: refetchDatasets } = useDatasets();
  const createDataset = useCreateDataset();
  const deleteDataset = useDeleteDataset();

  const [server, setServer] = useState<DesktopServerState | null>(null);
  const [name, setName] = useState(defaultSetName);
  const [busy, setBusy] = useState<string | null>(null);
  const [pull, setPull] = useState<PullProgress | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!desktop) return;
    void desktop.get().then(setServer).catch(() => setServer(null));
    return desktop.onPullProgress(setPull);
  }, [desktop]);

  const onLocalServer = data?.enabled === true;
  const nameIsValid = /^[a-z0-9][a-z0-9-]{0,39}$/.test(name) && name !== 'dev';

  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    try {
      await task();
    } catch (err) {
      showToast(desktopErrorText(err), { type: 'error', duration: 8000 });
    } finally {
      setBusy(null);
      setPull(null);
    }
  }

  function switchServer(target: ServerTarget) {
    if (!desktop || target === server?.target) return;
    void run('server', async () => {
      await desktop.switch(target, '/admin');
    });
  }

  function activateDataset(setName: string) {
    void run(`switch:${setName}`, async () => {
      await switchDataset(setName);
      // New databases and a new session: start the page over
      window.location.reload();
    });
  }

  function createEmpty() {
    void run('create', async () => {
      await createDataset.mutateAsync(name);
      showToast(`Created empty data set "${name}"`, { type: 'success' });
    });
  }

  function pullProduction() {
    if (!desktop) return;
    void run('pull', async () => {
      await desktop.pullProduction(name);
      showToast(`Copied production into "${name}". Stored passwords and tokens were removed.`, { type: 'success' });
    }).then(() => void refetchDatasets());
  }

  function importFile(file: File) {
    void run('import', async () => {
      await importDatasetFile(name, file);
      showToast(`Imported "${file.name}" as "${name}". Stored passwords and tokens were removed.`, { type: 'success' });
    }).then(() => void refetchDatasets());
  }

  const pullLabel = pull
    ? pull.stage === 'downloading'
      ? `Downloading ${formatBytes(pull.bytes)}…`
      : 'Importing into the local server…'
    : 'Pull production copy';

  return (
    <section className="admin-server-card">
      <div className="admin-server-header">
        <div>
          <h2 className="admin-server-title">Server &amp; data</h2>
          <p className="admin-server-subtitle">
            {server
              ? server.target === 'local'
                ? `This app is on the local server (${new URL(server.url).host}).`
                : 'This app is on Railway.'
              : onLocalServer
                ? 'This page is on a local server.'
                : 'This page is on Railway.'}
            {onLocalServer && data?.active && <> Data set: <strong>{data.active}</strong>.</>}
          </p>
        </div>

        {desktop && server && (
          <div className="admin-server-switch" role="group" aria-label="Server">
            {(['railway', 'local'] as const).map(target => (
              <button
                key={target}
                type="button"
                className={`admin-server-option${server.target === target ? ' is-active' : ''}`}
                aria-pressed={server.target === target}
                disabled={busy !== null || server.override !== null}
                onClick={() => switchServer(target)}
              >
                {target === 'railway' ? 'Railway' : 'Local'}
              </button>
            ))}
          </div>
        )}
      </div>

      {server?.override && (
        <p className="admin-server-note">
          YELLO_URL is set to {server.override} for this run, so the server can&apos;t be switched here.
        </p>
      )}

      {isLoading && <p className="admin-server-note">Loading data sets…</p>}
      {error && <p className="admin-server-note">Couldn&apos;t load data sets: {error.message}</p>}

      {data && !onLocalServer && (
        <div className="admin-server-actions">
          <a className="btn btn--secondary btn--sm" href={BACKUP_URL} download>
            Download backup
          </a>
          <p className="admin-server-note">
            Data sets live on a local server. Switch to Local to test against an empty database or a copy of production.
          </p>
        </div>
      )}

      {onLocalServer && data && (
        <>
          <div className="admin-table-wrapper">
            <table className="admin-table admin-dataset-table">
              <thead>
                <tr>
                  <th>Data set</th>
                  <th>Kind</th>
                  <th className="num">Users</th>
                  <th className="num">Size</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.datasets.map(set => (
                  <tr key={set.name} className={set.active ? 'is-active' : undefined}>
                    <td>
                      <span className="admin-dataset-name">{set.name}</span>
                      {set.active && <Badge variant="brand">Active</Badge>}
                    </td>
                    <td>{KIND_LABEL[set.kind]}</td>
                    <td className="num">{set.userCount}</td>
                    <td className="num">{formatBytes(set.sizeBytes)}</td>
                    <td>{set.createdAt ? new Date(set.createdAt).toLocaleString() : '—'}</td>
                    <td className="admin-dataset-actions">
                      {!set.active && (
                        <Button
                          size="sm"
                          loading={busy === `switch:${set.name}`}
                          disabled={busy !== null}
                          onClick={() => activateDataset(set.name)}
                        >
                          Use
                        </Button>
                      )}
                      {!set.active && set.kind !== 'dev' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="trash"
                          aria-label={`Delete ${set.name}`}
                          disabled={busy !== null}
                          onClick={() => setConfirmDelete(set.name)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-dataset-new">
            <label className="admin-dataset-label" htmlFor="dataset-name">New data set</label>
            <input
              id="dataset-name"
              className="admin-dataset-input"
              value={name}
              onChange={event => setName(event.target.value.toLowerCase())}
              disabled={busy !== null}
              aria-invalid={!nameIsValid}
              spellCheck={false}
            />
            <Button size="sm" disabled={!nameIsValid || busy !== null} loading={busy === 'create'} onClick={createEmpty}>
              Create empty
            </Button>
            {desktop && (
              <Button
                size="sm"
                variant="primary"
                disabled={!nameIsValid || busy !== null}
                loading={busy === 'pull'}
                onClick={pullProduction}
              >
                {pullLabel}
              </Button>
            )}
            <Button
              size="sm"
              disabled={!nameIsValid || busy !== null}
              loading={busy === 'import'}
              onClick={() => fileInput.current?.click()}
            >
              Import backup file…
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".gz,.tgz,application/gzip"
              hidden
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) importFile(file);
              }}
            />
          </div>

          <p className="admin-server-note">
            Names use lowercase letters, digits and dashes. Production copies come from Railway&apos;s
            Download backup, with every stored password and token removed, so they can&apos;t reach your
            real Gmail, Google or iCloud. Switching closes the open databases, so anything importing at
            that moment fails.
          </p>
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete}"?`}
          message="Its databases and photos are removed from this Mac. This can't be undone."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const target = confirmDelete;
            setConfirmDelete(null);
            void run(`delete:${target}`, async () => {
              await deleteDataset.mutateAsync(target);
            });
          }}
        />
      )}
    </section>
  );
}

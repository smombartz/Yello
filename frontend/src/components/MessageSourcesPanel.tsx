import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from './ui/Button';
import { FilePicker } from './ui/FilePicker';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';
import { formatRelativeDay } from '../utils/relativeTime';
import {
  CHANNEL_ICONS, CHANNEL_LABELS, MESSAGE_CHANNELS, uploadActivity, useClearChannel, useInvalidateMessageQueries,
  useMessageSources, useStartGmailScan, type GmailOlderRange, type MessageChannel, type MessageSource,
} from '../api/messageHooks';
import {
  backupErrorText, getDesktopMessages, getLastBackupImport, importWhatsAppBackup, incrementalScanStart, syncDesktopChannel,
  type BackupImportRecord, type DesktopChannel, type DesktopReaderStatus, type IPhoneBackup, type IPhoneBackupList,
} from '../lib/desktopMessages';
import { useDesktopAutoRefresh } from '../hooks/useDesktopMessageSync';

function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function SourceSummary({ source }: { source: MessageSource }) {
  if (!source.messages) return <span className="source-summary muted">Not connected</span>;
  return (
    <span className="source-summary">
      {source.messages.toLocaleString()} messages with {source.handles.toLocaleString()} people
      ({source.matchedHandles.toLocaleString()} matched)
      {source.coveredFrom && source.coveredThrough && <> · {formatDay(source.coveredFrom)} – {formatDay(source.coveredThrough)}</>}
      {source.lastImportedAt && <> · updated {formatRelativeDay(source.lastImportedAt)}</>}
    </span>
  );
}

function SourceCard({ source, children, onClear }: { source: MessageSource; children: ReactNode; onClear: () => void }) {
  const icon = CHANNEL_ICONS[source.channel];
  return (
    <section className="card message-source">
      <div className="message-source-header">
        <span className={`match-channel channel-${source.channel}`}><Icon name={icon.name} style={icon.style} /></span>
        <div className="message-source-title">
          <h2>{CHANNEL_LABELS[source.channel]}</h2>
          <SourceSummary source={source} />
        </div>
        {source.messages > 0 && (
          <Button size="sm" variant="ghost" icon="trash-can" onClick={onClear} title="Remove this channel’s counts and matches">
            Remove
          </Button>
        )}
      </div>
      <div className="message-source-body">{children}</div>
    </section>
  );
}

const OLDER_CHOICES: Array<{ id: GmailOlderRange; label: string; years: number | null }> = [
  { id: '5y', label: '5 years', years: 5 },
  { id: '10y', label: '10 years', years: 10 },
  { id: 'all', label: 'all the way', years: null },
];

/** Whether a "scan older" choice would reach further back than what's covered */
function reachesFurther(choice: { years: number | null }, coveredFrom: string): boolean {
  if (choice.years === null) return coveredFrom > '2004-01-01';
  const target = new Date();
  target.setDate(target.getDate() - Math.round(choice.years * 365.25));
  return target.toISOString().slice(0, 10) < coveredFrom;
}

function GmailSource({ source }: { source: MessageSource }) {
  const scan = useStartGmailScan();
  const scopeMissing = scan.error?.message === 'gmail_scope_required';
  const olderChoices = source.coveredFrom ? OLDER_CHOICES.filter(c => reachesFurther(c, source.coveredFrom!)) : [];
  const errorText = scan.error?.message === 'already_covered'
    ? 'Those emails are already counted.'
    : scan.error?.message === 'already_running' ? 'A scan is already running.' : scan.error?.message;
  if (source.status === 'running') {
    const pct = source.progressTotal ? Math.round(((source.progressDone ?? 0) / source.progressTotal) * 100) : 0;
    return (
      <div className="enrichment-progress">
        <div className="progress-header">
          <span className="progress-status"><Icon name="arrows-rotate" className="spinning" />Counting emails…</span>
          {source.progressTotal != null && (
            <span className="progress-count">{(source.progressDone ?? 0).toLocaleString()} of {source.progressTotal.toLocaleString()}</span>
          )}
        </div>
        <div className="progress-bar-container"><div className="progress-bar-fill" style={{ width: `${pct}%` }} /></div>
        <div className="progress-current">This runs in the background; you can leave this page.</div>
      </div>
    );
  }
  return (
    <>
      <p className="settings-description">
        Counts emails you sent and received, from the sender and recipient lines only. The first scan covers the
        last two years; you can scan older mail after. Newsletters, promotions and no-reply senders are skipped.
      </p>
      {source.status === 'failed' && source.error && <p className="import-error-text">{source.error}</p>}
      {scopeMissing ? (
        <>
          <p className="import-error-text">Yello needs permission to read your Gmail headers.</p>
          <Button variant="primary" icon="google" onClick={() => { window.location.href = '/api/auth/google/gmail'; }}>
            Allow Gmail access
          </Button>
        </>
      ) : (
        <>
          {errorText && <p className="import-error-text">{errorText}</p>}
          <div className="message-source-actions">
            <Button icon="envelope" loading={scan.isPending && !scan.variables} onClick={() => scan.mutate(undefined)}>
              {source.messages ? 'Scan new emails' : 'Scan Gmail'}
            </Button>
          </div>
          {olderChoices.length > 0 && (
            <div className="source-older">
              <span>Scan older emails, back</span>
              {olderChoices.map(c => (
                <Button
                  key={c.id} size="sm" variant="ghost" icon="clock-rotate-left"
                  loading={scan.isPending && scan.variables === c.id} disabled={scan.isPending}
                  onClick={() => scan.mutate(c.id)}
                  title={c.years ? `Count emails from the last ${c.years} years` : 'Count every email, back to your first one'}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          )}
          {olderChoices.length > 0 && (
            <p className="source-summary muted source-older-note">
              Older mail is counted a year at a time and saved as each year finishes. A large mailbox can take a while.
            </p>
          )}
        </>
      )}
    </>
  );
}

function formatIsoDay(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'unknown date';
}

function backupLabel(b: IPhoneBackup): string {
  return `${b.deviceName}, backed up ${formatIsoDay(b.date)}${b.encrypted ? ' (encrypted)' : ''}`;
}

/** What a backup holds, in words */
function BackupDetails({ backup }: { backup: IPhoneBackup }) {
  return (
    <span className="source-summary">
      {backup.hasWhatsApp === true && <><Icon name="circle-check" /> Has WhatsApp data</>}
      {backup.hasWhatsApp === false && <><Icon name="circle-xmark" /> No WhatsApp data in this backup</>}
      {backup.hasWhatsApp == null && backup.encrypted && <><Icon name="lock" /> Encrypted: WhatsApp data shows once it’s unlocked</>}
      {backup.location && <span className="source-backup-location" title={backup.location}> · {backup.location}</span>}
    </span>
  );
}

/**
 * WhatsApp's older history from an iPhone backup Finder made on this Mac.
 * WhatsApp on the Mac only has what the phone sent over when it was linked.
 * Looks for backups as soon as it shows and says which one it reads.
 */
function WhatsAppBackupImport({ coveredFrom }: { coveredFrom: string | null }) {
  const desktop = getDesktopMessages();
  const invalidate = useInvalidateMessageQueries();
  const { showToast } = useToast();
  const [list, setList] = useState<IPhoneBackupList | null>(null);
  const [looking, setLooking] = useState(false);
  const [selected, setSelected] = useState('');
  const [password, setPassword] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<BackupImportRecord | null>(() => getLastBackupImport());

  const backup = list?.backups.find(b => b.id === selected) ?? list?.backups[0] ?? null;
  const canList = !!desktop?.backups;

  const find = useCallback(async () => {
    const bridge = getDesktopMessages();
    if (!bridge?.backups) return;
    setLooking(true);
    setError(null);
    try {
      const found = await bridge.backups();
      setList(found);
      // Default to the newest backup that has (or may have) WhatsApp
      setSelected((found.backups.find(b => b.hasWhatsApp !== false) ?? found.backups[0])?.id ?? '');
    } catch (e) {
      setError(backupErrorText(e));
    } finally {
      setLooking(false);
    }
  }, []);

  // Look for backups as soon as the card shows
  useEffect(() => { void find(); }, [find]);

  const read = async () => {
    if (!backup) return;
    setError(null);
    try {
      const record = await importWhatsAppBackup(backup, backup.encrypted ? password : null, setProgress);
      setPassword('');
      setLastImport(record);
      showToast(record.messages
        ? `Counted ${record.messages.toLocaleString()} WhatsApp messages from ${backup.deviceName}’s backup`
        : 'No WhatsApp messages in this backup');
    } catch (e) {
      setError(backupErrorText(e));
    } finally {
      setProgress(null);
      invalidate();
    }
  };

  return (
    <div className="source-backup">
      <h3>Older history from your iPhone</h3>
      <p className="settings-description">
        WhatsApp on a Mac only has the messages your phone sent over when you linked it
        {coveredFrom ? <> (here: from {formatDay(coveredFrom)})</> : null}. Your iPhone has the rest. Back it up to this
        Mac in Finder (select your iPhone › General › <em>Back up all of the data on your iPhone to this Mac</em> › Back Up
        Now), then read the backup here. Only counts per person are uploaded.
      </p>

      {lastImport && (
        <p className="source-backup-last">
          <Icon name="circle-check" />
          Last read: {lastImport.deviceName}’s backup from {formatIsoDay(lastImport.backupDate)},{' '}
          {lastImport.messages.toLocaleString()} messages
          {lastImport.untilDay && <> through {formatDay(lastImport.untilDay)}</>} (read {formatRelativeDay(lastImport.importedAt)})
        </p>
      )}

      {!canList ? (
        <p className="source-summary muted">Update the Yello desktop app to read iPhone backups.</p>
      ) : !list ? (
        <p className="settings-description"><Icon name="arrows-rotate" className="spinning" /> Looking for iPhone backups on this Mac…</p>
      ) : !list.backups.length ? (
        <div className="message-source-actions">
          <span className="source-summary">
            {list.state === 'needs_full_disk_access'
              ? 'Yello needs Full Disk Access to read iPhone backups.'
              : list.state === 'error' ? list.error : 'No iPhone backups found on this Mac.'}
          </span>
          <Button size="sm" variant="ghost" icon="rotate" loading={looking} onClick={() => void find()}>Look again</Button>
        </div>
      ) : progress ? (
        <p className="settings-description"><Icon name="arrows-rotate" className="spinning" /> {progress}</p>
      ) : (
        <div className="source-backup-pick">
          <span className="source-backup-found">
            Found {list.backups.length === 1 ? 'one backup' : `${list.backups.length} backups`} on this Mac.
            {list.backups.length > 1 ? ' Read from:' : ' Reads from:'}
          </span>
          <div className="source-backup-form">
            {list.backups.length > 1 ? (
              <select className="edit-input" value={backup?.id ?? ''} onChange={(e) => { setSelected(e.target.value); setError(null); }}
                aria-label="iPhone backup to read">
                {list.backups.map(b => <option key={b.id} value={b.id}>{backupLabel(b)}</option>)}
              </select>
            ) : (
              <strong className="source-backup-name">{backup && backupLabel(backup)}</strong>
            )}
            <Button size="sm" variant="ghost" icon="rotate" loading={looking} onClick={() => void find()} title="Look for backups again">
              Refresh
            </Button>
          </div>
          {backup && <BackupDetails backup={backup} />}
          <div className="source-backup-form">
            {backup?.encrypted && (
              <input
                type="password" className="edit-input" autoComplete="off" value={password}
                placeholder="Backup password" aria-label="Backup password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && password) void read(); }}
              />
            )}
            <Button
              icon="clock-rotate-left"
              disabled={(!!backup?.encrypted && !password) || backup?.hasWhatsApp === false}
              onClick={() => void read()}
            >
              Read WhatsApp from this backup
            </Button>
          </div>
          {backup?.encrypted && (
            <span className="source-summary muted">
              The password you set for encrypted backups in Finder. It’s only used on this Mac to unlock the backup and isn’t saved.
            </span>
          )}
        </div>
      )}
      {error && <p className="import-error-text">{error}</p>}
    </div>
  );
}

function DesktopSource({ source, status, onStatusChange }: {
  source: MessageSource;
  status: DesktopReaderStatus | null;
  onStatusChange: () => void;
}) {
  const channel = source.channel as DesktopChannel;
  const desktop = getDesktopMessages();
  const invalidate = useInvalidateMessageQueries();
  const { showToast } = useToast();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useDesktopAutoRefresh(channel);
  const appName = channel === 'imessage' ? 'Messages' : 'WhatsApp';
  const newSince = source.coveredThrough ? formatDay(incrementalScanStart(source.coveredThrough)) : null;

  if (!desktop) {
    return (
      <p className="settings-description">
        {CHANNEL_LABELS[channel]} lives on your Mac, so it’s read by the Yello desktop app. Open Yello on your Mac
        and connect it there; only counts per person are uploaded, never your messages.
      </p>
    );
  }

  const scan = async (full: boolean) => {
    setError(null);
    try {
      const result = await syncDesktopChannel(channel, full ? null : source.coveredThrough, setProgress);
      showToast(result?.messages ? `Counted ${result.messages.toLocaleString()} ${CHANNEL_LABELS[channel]} messages` : 'No new messages');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      onStatusChange();
    } finally {
      setProgress(null);
      invalidate();
    }
  };

  if (status?.state === 'needs_full_disk_access') {
    return (
      <div className="desktop-permission">
        <p className="settings-description">
          macOS protects your {appName} history. To let Yello count it, turn on <strong>Yello</strong> under
          System Settings › Privacy &amp; Security › <strong>Full Disk Access</strong>, then restart Yello.
          Yello only reads who you messaged and when; message text never leaves your Mac.
        </p>
        <div className="message-source-actions">
          <Button variant="primary" icon="lock-open" onClick={() => void desktop.openFullDiskAccessSettings()}>Open System Settings</Button>
          <Button icon="rotate-right" onClick={() => void desktop.relaunch()}>Restart Yello</Button>
        </div>
      </div>
    );
  }
  if (status?.state === 'not_found') {
    return <p className="settings-description">No {appName} history on this Mac.</p>;
  }

  return (
    <>
      <p className="settings-description">
        Reads your {appName} history on this Mac and uploads how many messages you exchanged with each person per day.
        Message text never leaves your Mac.
        {newSince && <> “Scan new messages” only reads what came in since {newSince}, so it’s quick; “Rescan everything” reads
        the whole history again.</>}
      </p>
      {(error || (status?.state === 'error' && status.error)) && <p className="import-error-text">{error || status?.error}</p>}
      {progress ? (
        <p className="settings-description"><Icon name="arrows-rotate" className="spinning" /> {progress}</p>
      ) : (
        <div className="message-source-actions">
          <Button icon="laptop" onClick={() => void scan(false)} disabled={!status}
            title={newSince ? `Reads only messages since ${newSince}` : undefined}>
            {source.coveredThrough ? 'Scan new messages' : 'Scan this Mac'}
          </Button>
          {source.coveredThrough && (
            <Button variant="ghost" icon="rotate" onClick={() => void scan(true)} disabled={!status} title="Reads the whole history again">
              Rescan everything
            </Button>
          )}
        </div>
      )}
      {source.coveredThrough && (
        <label className="source-auto-refresh">
          <span className="toggle-switch">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            <span className="toggle-slider" />
          </span>
          <span>
            Refresh automatically
            <span className="source-summary">Scans new messages every 6 hours while Yello is open on this Mac</span>
          </span>
        </label>
      )}
      {channel === 'whatsapp' && <WhatsAppBackupImport coveredFrom={source.coveredFrom} />}
    </>
  );
}

const EXPORT_HELP: Record<'instagram' | 'linkedin', { url: string; steps: string; accept: string }> = {
  instagram: {
    url: 'https://accountscenter.instagram.com/info_and_permissions/dyi/',
    steps: 'In Instagram’s Accounts Center, choose Download your information › Some of your information › Messages, format JSON, '
      + 'media quality Low. Instagram emails you when the zip is ready (minutes to a day).',
    accept: '.zip,application/zip',
  },
  linkedin: {
    url: 'https://www.linkedin.com/mypreferences/d/download-my-data',
    steps: 'In LinkedIn’s Settings › Data privacy › Get a copy of your data, pick Messages. LinkedIn emails you when the archive is ready '
      + '(usually within minutes). Upload the zip or the messages.csv inside it.',
    accept: '.zip,.csv,application/zip,text/csv',
  },
};

function ExportSource({ source }: { source: MessageSource }) {
  const channel = source.channel as 'instagram' | 'linkedin';
  const help = EXPORT_HELP[channel];
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateMessageQueries();
  const { showToast } = useToast();

  const run = async () => {
    if (!file) return;
    setError(null);
    try {
      setProgress('Reading the export…');
      // The zip reader loads only when someone imports an export
      const { parseInstagramExport, parseLinkedInExport } = await import('../lib/messageExports');
      const parsed = channel === 'instagram'
        ? await parseInstagramExport(file, (done, total) => setProgress(`Reading conversations: ${done} of ${total}`))
        : await parseLinkedInExport(file);
      if (!parsed) throw new Error('No messages found in this file.');
      await uploadActivity(channel, parsed.from, parsed.to, parsed.handles, parsed.activity,
        (done, total) => setProgress(`Uploading ${done} of ${total}…`));
      showToast(`Counted ${parsed.messages.toLocaleString()} messages in ${parsed.conversations.toLocaleString()} conversations`);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      invalidate();
    }
  };

  return (
    <>
      <p className="settings-description">
        {help.steps}{' '}
        <a href={help.url} target="_blank" rel="noopener noreferrer">Request your {CHANNEL_LABELS[channel]} data</a>.
        The file is read in your browser; only counts per person are uploaded.
      </p>
      {error && <p className="import-error-text">{error}</p>}
      {progress ? (
        <p className="settings-description"><Icon name="arrows-rotate" className="spinning" /> {progress}</p>
      ) : (
        <div className="import-controls">
          <FilePicker id={`${channel}-export`} accept={help.accept} file={file} onChange={setFile} prompt="Choose export file" />
          <Button icon="upload" disabled={!file} onClick={() => void run()}>
            {source.messages ? 'Import newer export' : 'Import'}
          </Button>
        </div>
      )}
    </>
  );
}

/** One card per channel: what's imported so far and how to bring in more. */
export function MessageSourcesPanel() {
  const { data } = useMessageSources();
  const clear = useClearChannel();
  const [confirmClear, setConfirmClear] = useState<MessageChannel | null>(null);
  const [desktopStatus, setDesktopStatus] = useState<Record<DesktopChannel, DesktopReaderStatus> | null>(null);
  const [statusTick, setStatusTick] = useState(0);

  useEffect(() => {
    const desktop = getDesktopMessages();
    if (!desktop) return;
    let cancelled = false;
    desktop.status().then(s => { if (!cancelled) setDesktopStatus(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [statusTick]);

  const sources = data?.sources ?? MESSAGE_CHANNELS.map(channel => ({
    channel, status: 'idle', coveredFrom: null, coveredThrough: null, lastImportedAt: null,
    progressDone: null, progressTotal: null, error: null, handles: 0, matchedHandles: 0, messages: 0,
  } satisfies MessageSource));

  return (
    <div className="message-sources">
      {sources.map(source => (
        <SourceCard key={source.channel} source={source} onClear={() => setConfirmClear(source.channel)}>
          {source.channel === 'gmail' && <GmailSource source={source} />}
          {(source.channel === 'imessage' || source.channel === 'whatsapp') && (
            <DesktopSource
              source={source}
              status={desktopStatus?.[source.channel] ?? null}
              onStatusChange={() => setStatusTick(t => t + 1)}
            />
          )}
          {(source.channel === 'instagram' || source.channel === 'linkedin') && <ExportSource source={source} />}
        </SourceCard>
      ))}
      {confirmClear && (
        <ConfirmDialog
          title={`Remove ${CHANNEL_LABELS[confirmClear]} data?`}
          message="Yello forgets this channel’s message counts and matches. Your contacts stay as they are. You can import again any time."
          confirmLabel="Remove"
          danger
          onConfirm={() => { clear.mutate(confirmClear); setConfirmClear(null); }}
          onCancel={() => setConfirmClear(null)}
        />
      )}
    </div>
  );
}

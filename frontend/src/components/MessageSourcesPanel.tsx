import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from './ui/Button';
import { FilePicker } from './ui/FilePicker';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';
import { formatRelativeDay } from '../utils/relativeTime';
import {
  CHANNEL_ICONS, CHANNEL_LABELS, MESSAGE_CHANNELS, uploadActivity, useClearChannel, useInvalidateMessageQueries,
  useMessageSources, useStartGmailScan, type MessageChannel, type MessageSource,
} from '../api/messageHooks';
import { getDesktopMessages, syncDesktopChannel, type DesktopChannel, type DesktopReaderStatus } from '../lib/desktopMessages';

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

function GmailSource({ source }: { source: MessageSource }) {
  const scan = useStartGmailScan();
  const scopeMissing = scan.error?.message === 'gmail_scope_required';
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
        Counts emails you sent and received over the last two years, from the sender and recipient lines only.
        Newsletters, promotions and no-reply senders are skipped.
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
          {scan.error && <p className="import-error-text">{scan.error.message}</p>}
          <Button icon="envelope" loading={scan.isPending} onClick={() => scan.mutate()}>
            {source.messages ? 'Scan new emails' : 'Scan Gmail'}
          </Button>
        </>
      )}
    </>
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
  const appName = channel === 'imessage' ? 'Messages' : 'WhatsApp';

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
        Message text never leaves your Mac. After the first scan it refreshes on its own while Yello is open.
      </p>
      {(error || (status?.state === 'error' && status.error)) && <p className="import-error-text">{error || status?.error}</p>}
      {progress ? (
        <p className="settings-description"><Icon name="arrows-rotate" className="spinning" /> {progress}</p>
      ) : (
        <div className="message-source-actions">
          <Button icon="laptop" onClick={() => void scan(false)} disabled={!status}>
            {source.messages ? 'Scan new messages' : 'Scan this Mac'}
          </Button>
          {source.messages > 0 && <Button variant="ghost" onClick={() => void scan(true)}>Rescan everything</Button>}
        </div>
      )}
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

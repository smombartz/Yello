import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  TO_SEND, useBlast, useDeleteBlast, useRequeueRecipient, useRerunBlast, useSkipRecipients,
  type BlastRecipient, type DesktopProgress,
} from '../../api/textBlastHooks';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { Icon } from '../Icon';
import { BLAST_STATUS, RECIPIENT_STATUS, summarizeCounts } from './statusLabels';

interface BlastDetailProps {
  blastId: number;
  desktop: { start(blastId: number): Promise<unknown>; stop(): Promise<unknown> } | null;
  progress: DesktopProgress | null;
}

const CHECK: BlastRecipient['status'][] = ['pending', 'not_found', 'needs_review'];

function useSecondsUntil(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [at]);
  return at ? Math.max(0, Math.ceil((at - now) / 1000)) : null;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  // created_at comes from SQLite as "YYYY-MM-DD HH:MM:SS" in UTC
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** One blast: live progress while sending, every person's status, resume, run again. */
export function BlastDetail({ blastId, desktop, progress }: BlastDetailProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const thisRunning = !!progress?.running && progress.blastId === blastId;
  const otherRunning = !!progress?.running && progress.blastId !== blastId;
  const { data: blast, isLoading, isError } = useBlast(blastId, thisRunning);
  const skip = useSkipRecipients(blastId);
  const requeue = useRequeueRecipient(blastId);
  const rerun = useRerunBlast(blastId);
  const del = useDeleteBlast();
  const [rerunOpen, setRerunOpen] = useState(false);
  const [rerunText, setRerunText] = useState('');
  const [rerunSimulate, setRerunSimulate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const countdown = useSecondsUntil(thisRunning ? progress!.nextAt : null);

  if (isLoading) return <p className="text-blast-muted">Loading…</p>;
  if (isError || !blast) return <p className="text-blast-warning">This blast couldn't be loaded. <Link to="/tools/text-blast">Back</Link></p>;

  const recipients = blast.recipients ?? [];
  const toSend = recipients.filter((r) => TO_SEND.includes(r.status)).length;
  // The server says "running" but this app isn't sending it: the app was closed mid-blast.
  const interrupted = blast.status === 'running' && !thisRunning;

  const start = async () => {
    try {
      await desktop!.start(blastId);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not start', { type: 'error' });
    }
  };

  const submitRerun = async () => {
    const created = await rerun.mutateAsync({ template: rerunText, simulate: rerunSimulate });
    setRerunOpen(false);
    navigate(`/tools/text-blast/${created.id}`);
  };

  const remove = async () => {
    await del.mutateAsync(blastId);
    navigate('/tools/text-blast');
  };

  return (
    <>
      <section className="settings-section">
        <div className="settings-section-header">
          <Icon name="paper-plane" />
          <h2>{blast.simulate ? 'Simulated blast' : 'Text blast'} · {formatTime(blast.createdAt)}</h2>
          <Badge variant={thisRunning ? 'info' : BLAST_STATUS[interrupted ? 'stopped' : blast.status].variant}>
            {thisRunning ? 'Sending' : BLAST_STATUS[interrupted ? 'stopped' : blast.status].label}
          </Badge>
        </div>
        <div className="settings-section-content text-blast-stack">
          <div className="text-blast-message-preview">{blast.template}</div>
          <p className="text-blast-muted">
            {[...blast.sources.groups.map((g) => `Group "${g}"`), blast.sources.csvName && `CSV ${blast.sources.csvName}`]
              .filter(Boolean).join(' + ') || 'No sources'}
            {' · '}{blast.total} people · {summarizeCounts(blast.counts)}
          </p>

          {thisRunning && progress && (
            <div className="text-blast-progress">
              <progress max={progress.total || 1} value={progress.processed} />
              <div>
                {progress.current
                  ? <>Now: <strong>{progress.current.name || progress.current.phone}</strong></>
                  : countdown !== null ? <>Next text in <strong>{countdown}s</strong></> : 'Working…'}
                {' · '}{progress.sent} sent · {progress.failed} failed · {progress.total - progress.processed} to go
              </div>
            </div>
          )}

          <div className="text-blast-actions">
            {thisRunning ? (
              <Button variant="danger" icon="stop" onClick={() => desktop?.stop()}>Stop</Button>
            ) : desktop ? (
              <Button icon="paper-plane" disabled={!toSend || otherRunning} onClick={start}>
                {blast.status === 'draft' ? `Send ${toSend}` : `Resume (${toSend} left)`}
              </Button>
            ) : (
              toSend > 0 && <span className="text-blast-muted">Open the Yello desktop app on your Mac to send this blast.</span>
            )}
            {!thisRunning && (
              <Button variant="secondary" icon="rotate-right" onClick={() => { setRerunText(blast.template); setRerunSimulate(blast.simulate); setRerunOpen(true); }}>
                Run again with a new message
              </Button>
            )}
            {!thisRunning && blast.status !== 'running' && (
              <Button variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)}>Delete</Button>
            )}
            {otherRunning && <span className="text-blast-muted">Another blast is sending.</span>}
          </div>
          {interrupted && desktop && (
            <p className="text-blast-warning">
              <Icon name="triangle-exclamation" /> This blast was interrupted. Resume to continue. Anyone marked "Sending" is
              checked in Messages first and only texted if nothing went out.
            </p>
          )}

          {rerunOpen && (
            <div className="text-blast-rerun">
              <div className="text-blast-label">New message for the same {recipients.length} people</div>
              <textarea className="text-blast-template" rows={4} value={rerunText} onChange={(e) => setRerunText(e.target.value)} />
              <label className="text-blast-inline">
                <input type="checkbox" checked={rerunSimulate} onChange={(e) => setRerunSimulate(e.target.checked)} />
                <span>Simulate</span>
              </label>
              <div className="text-blast-actions">
                <Button loading={rerun.isPending} disabled={!rerunText.trim()} onClick={submitRerun}>Create new blast</Button>
                <Button variant="ghost" onClick={() => setRerunOpen(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {thisRunning && progress && progress.log.length > 0 && (
        <section className="settings-section">
          <div className="settings-section-header"><Icon name="list" /><h2>Activity</h2></div>
          <ol className="settings-section-content text-blast-log">
            {[...progress.log].reverse().slice(0, 30).map((l, i) => (
              <li key={`${l.at}-${i}`} className={`is-${l.level}`}>
                <time>{new Date(l.at).toLocaleTimeString()}</time> {l.text}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="settings-section">
        <div className="settings-section-header"><Icon name="users" /><h2>People</h2></div>
        <div className="settings-section-content">
          <div className="text-blast-table-wrap">
            <table className="text-blast-table">
              <thead>
                <tr><th aria-label="Send" /><th>Name</th><th>Status</th><th>Text</th></tr>
              </thead>
              <tbody>
                {recipients.map((r) => {
                  const s = RECIPIENT_STATUS[r.status];
                  const tickable = TO_SEND.includes(r.status) && r.status !== 'in_flight' || r.status === 'skipped';
                  return (
                    <tr key={r.id} className={progress?.current?.recipientId === r.id && thisRunning ? 'is-current' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Send to ${r.name || r.phone}`}
                          disabled={!tickable || skip.isPending}
                          checked={r.status !== 'skipped'}
                          onChange={() => skip.mutate({ ids: [r.id], skipped: r.status !== 'skipped' })}
                        />
                      </td>
                      <td>
                        <div className="text-blast-name">{r.name || r.phone}</div>
                        <div className="text-blast-muted text-blast-phone">{r.phone}</div>
                      </td>
                      <td>
                        <Badge variant={s.variant}>{s.label}</Badge>
                        <div className="text-blast-muted" title={s.hint}>
                          {r.note ?? ''}{r.sentAt && DONE_OR_TRIED(r) ? ` · ${formatTime(r.sentAt)}` : ''}
                        </div>
                        {CHECK.includes(r.status) && !thisRunning && (
                          <Button size="sm" variant="ghost" onClick={() => requeue.mutate(r.id)}>Didn't arrive? Queue again</Button>
                        )}
                      </td>
                      <td><div className="text-blast-text">{r.text}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this blast?"
          message="Its history and statuses are removed. Texts already sent stay in Messages."
          confirmLabel="Delete"
          danger
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

function DONE_OR_TRIED(r: BlastRecipient): boolean {
  return r.status !== '' && r.status !== 'skipped';
}

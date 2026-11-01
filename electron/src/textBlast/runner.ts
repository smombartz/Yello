import { classify } from './classify';
import type {
  Blast, BlastRecipient, BlastStatus, LogLine, OutgoingMessage, RecipientStatus, RunnerProgress, SendResult,
} from './types';
import type { MessagesSendOutcome } from './messages';

// The sending loop, ported from TextBlast's _run_queue / deliver / _send_once. Everything
// with side effects comes in through `deps`, so tests run it against a fake Messages.

export interface RunnerApi {
  getBlast(id: number): Promise<Blast>;
  setRecipientStatus(blastId: number, recipientId: number, update: { status: RecipientStatus; service?: string | null; note?: string | null }): Promise<void>;
  setBlastStatus(blastId: number, status: BlastStatus): Promise<void>;
  /** Real send attempts since local midnight, and the daily cap. */
  sentToday(): Promise<{ count: number; cap: number }>;
}

export interface RunnerDeps {
  api: RunnerApi;
  send(handle: string, text: string, service: 'iMessage' | 'SMS'): Promise<MessagesSendOutcome>;
  launchMessages(): Promise<{ ok: boolean; message: string }>;
  /** Throws when the Messages database can't be read. */
  latestOutgoing(handle: string, sinceUnix: number): OutgoingMessage[];
  /** Whether delivery can be checked (Full Disk Access granted). */
  chatDbReadable(): boolean;
  /** false when Messages has no SMS account (no Text Message Forwarding); null when unknown. */
  smsAvailable(): boolean | null;
  sleep(ms: number): Promise<void>;
  now(): number;
  random(): number;
  /** Keep the Mac awake; returns the function that lets it sleep again. */
  keepAwake(): () => void;
}

export interface RunnerOptions {
  delaySeconds: [number, number];
  simulateDelaySeconds: [number, number];
  verifySeconds: number;
  pollMs: number;
}

export const DEFAULT_OPTIONS: RunnerOptions = {
  delaySeconds: [25, 45],
  simulateDelaySeconds: [1, 2],
  verifySeconds: 60,
  pollMs: 3000,
};

/** Already handed to Messages: never sent again. */
const DONE: RecipientStatus[] = ['delivered', 'sent', 'sent_sms', 'dispatched'];
/** Picked up by a run: not sent yet, a retry, or interrupted mid-send (checked first). */
const TO_SEND: RecipientStatus[] = ['', 'failed', 'error', 'simulated', 'in_flight'];
/** Count toward auto-stop. */
const FAILURES: RecipientStatus[] = ['failed', 'error', 'not_found'];

const MAX_LOG = 300;

class StopRun extends Error {}

export class TextBlastRunner {
  private progress: RunnerProgress = TextBlastRunner.idle();
  private stopRequested = false;
  private busy = false; // a test send is running

  constructor(
    private readonly deps: RunnerDeps,
    private readonly onProgress: (p: RunnerProgress) => void = () => {},
    private readonly options: RunnerOptions = DEFAULT_OPTIONS,
  ) {}

  private static idle(): RunnerProgress {
    return { running: false, blastId: null, simulate: false, total: 0, processed: 0, sent: 0, failed: 0, current: null, nextAt: null, log: [] };
  }

  snapshot(): RunnerProgress {
    return { ...this.progress, log: [...this.progress.log] };
  }

  get running(): boolean {
    return this.progress.running;
  }

  private emit(): void {
    this.onProgress(this.snapshot());
  }

  private log(level: LogLine['level'], text: string): void {
    this.progress.log.push({ at: this.deps.now(), level, text });
    if (this.progress.log.length > MAX_LOG) this.progress.log.splice(0, this.progress.log.length - MAX_LOG);
    this.emit();
  }

  stop(): void {
    if (this.progress.running) {
      this.stopRequested = true;
      this.log('info', 'Stopping…');
    }
  }

  /** Start sending a blast. Resolves when the run ends (stopped, finished or failed). */
  async start(blastId: number): Promise<void> {
    if (this.progress.running || this.busy) throw new Error('Already sending.');
    this.stopRequested = false;
    this.progress = { ...TextBlastRunner.idle(), running: true, blastId };
    this.emit();
    let allow: (() => void) | null = null;
    let endStatus: BlastStatus = 'stopped';
    try {
      const blast = await this.deps.api.getBlast(blastId);
      this.progress.simulate = blast.simulate;
      const queue = (blast.recipients ?? []).filter((r) => TO_SEND.includes(r.status)).map((r) => r.id);
      this.progress.total = queue.length;
      if (!queue.length) {
        this.log('info', 'Nobody left to send to in this blast.');
        endStatus = 'finished';
        return;
      }
      await this.deps.api.setBlastStatus(blastId, 'running');
      if (!blast.simulate) {
        allow = this.deps.keepAwake();
        this.log('info', 'Opening Messages…');
        const launched = await this.deps.launchMessages();
        if (!launched.ok) {
          this.log('error', `Couldn't open Messages: ${launched.message}`);
          return;
        }
      }
      endStatus = (await this.runQueue(blastId, blast.simulate, queue)) ? 'finished' : 'stopped';
    } catch (e) {
      this.log('error', e instanceof StopRun ? e.message : `Stopped: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      allow?.();
      try {
        await this.deps.api.setBlastStatus(blastId, endStatus);
      } catch { /* the page shows the run as over either way */ }
      this.progress.running = false;
      this.progress.current = null;
      this.progress.nextAt = null;
      this.emit();
    }
  }

  /** Returns true when every queued person was handled. */
  private async runQueue(blastId: number, simulate: boolean, queue: number[]): Promise<boolean> {
    let consecutive = 0;
    let attempts = 0;
    let failures = 0;
    let first = true;
    const p = this.progress;

    for (const recipientId of queue) {
      if (this.stopRequested) { this.log('info', 'Stopped. Progress is saved.'); return false; }

      // Re-read each time, so people unticked on the page mid-run are skipped.
      const blast = await this.deps.api.getBlast(blastId);
      const r = blast.recipients?.find((x) => x.id === recipientId);
      const label = r ? r.name || r.phone : `#${recipientId}`;
      if (!r || !TO_SEND.includes(r.status)) {
        p.processed++;
        if (r) this.log('info', `${label}: skipped (${r.status || 'removed'})`);
        continue;
      }
      p.current = { recipientId, name: r.name, phone: r.phone };
      this.emit();

      if (r.status === 'in_flight' && await this.alreadyWentOut(blastId, r, simulate, label)) {
        p.processed++;
        continue;
      }
      if (!simulate) {
        const { count, cap } = await this.deps.api.sentToday();
        if (count >= cap) {
          this.log('warn', `Reached today's limit of ${cap} texts, so Yello stopped. Resume tomorrow; people already sent to are skipped.`);
          return false;
        }
      }
      if (!first) {
        const [lo, hi] = simulate ? this.options.simulateDelaySeconds : this.options.delaySeconds;
        if (!(await this.wait((lo + this.deps.random() * (hi - lo)) * 1000))) {
          this.log('info', 'Stopped. Progress is saved.');
          return false;
        }
        // The page shows who's next during the pause, so they may have been unticked meanwhile.
        const again = (await this.deps.api.getBlast(blastId)).recipients?.find((x) => x.id === recipientId);
        if (!again || !TO_SEND.includes(again.status)) {
          p.processed++;
          p.current = null;
          this.log('info', `${label}: skipped (${again?.status || 'removed'})`);
          continue;
        }
      }
      first = false;

      this.log('info', `${label}: sending to ${r.phone}`);
      await this.write(blastId, recipientId, { status: 'in_flight', service: null, note: 'sending' },
        "Couldn't reach Yello to record the send, so nothing was sent. Check your connection and resume.");
      const res = await this.deliver(r.phone, r.text, simulate);
      await this.write(blastId, recipientId, { status: res.status, service: res.service, note: res.note },
        `Couldn't save the result for ${label}. It shows as "sending" and will be checked in Messages when you resume.`);

      p.processed++;
      attempts++;
      if (FAILURES.includes(res.status)) {
        failures++;
        consecutive++;
        p.failed++;
        this.log('error', `${label}: ${res.status} (${res.note})`);
      } else {
        consecutive = 0;
        p.sent++;
        this.log('ok', `${label}: ${res.status} via ${res.service} (${res.note})`);
      }
      if (res.code === '-1743') { this.log('error', "Stopping: macOS isn't letting Yello control Messages."); return false; }
      if (consecutive >= 3) { this.log('error', 'Stopping after 3 failures in a row. Check Messages and the notes.'); return false; }
      if (attempts >= 10 && failures / attempts > 0.2) {
        this.log('error', 'Stopping: more than 1 in 5 texts failed. Check Messages before going on.');
        return false;
      }
    }
    p.current = null;
    this.log('info', `Finished: ${p.sent} sent, ${p.failed} failed, ${p.processed} of ${p.total} handled.`);
    return true;
  }

  private async write(blastId: number, recipientId: number, update: { status: RecipientStatus; service: string | null; note: string }, failMessage: string) {
    try {
      await this.deps.api.setRecipientStatus(blastId, recipientId, update);
    } catch {
      throw new StopRun(failMessage);
    }
  }

  /** Wait between texts; false when Stop was pressed meanwhile. */
  private async wait(ms: number): Promise<boolean> {
    const end = this.deps.now() + ms;
    this.progress.nextAt = end;
    this.emit();
    try {
      while (this.deps.now() < end) {
        if (this.stopRequested) return false;
        await this.deps.sleep(Math.min(250, end - this.deps.now()));
      }
      return !this.stopRequested;
    } finally {
      this.progress.nextAt = null;
    }
  }

  /** For someone interrupted mid-send: true when it went out (or can't be checked, so it's held back). */
  private async alreadyWentOut(blastId: number, r: BlastRecipient, simulate: boolean, label: string): Promise<boolean> {
    if (simulate) return false;
    const since = r.sentAt ? Date.parse(r.sentAt) / 1000 : NaN;
    if (Number.isNaN(since) || !this.deps.chatDbReadable()) {
      await this.write(blastId, r.id, {
        status: 'needs_review', service: null,
        note: "interrupted mid-send and delivery can't be checked; look in Messages, then resend if needed",
      }, `Couldn't save the status for ${label}.`);
      this.log('warn', `${label}: interrupted earlier and can't be checked. Marked "needs review".`);
      return true;
    }
    const found = this.deps.latestOutgoing(r.phone, since - 5);
    if (found.length) {
      const c = classify(found[0], true)!;
      if (c.status !== 'failed') {
        await this.write(blastId, r.id, { status: c.status, service: found[0].service ?? null, note: `${c.note} (found after an interruption)` },
          `Couldn't save the status for ${label}.`);
        this.log('info', `${label}: the interrupted send already went out (${c.status}). Not sending again.`);
        return true;
      }
      this.log('info', `${label}: the interrupted send failed. Sending again.`);
    } else {
      this.log('info', `${label}: the interrupted send never reached Messages. Sending now.`);
    }
    return false;
  }

  /** iMessage first; SMS through the iPhone if iMessage fails. */
  async deliver(handle: string, text: string, simulate: boolean): Promise<SendResult> {
    const r = await this.sendOnce(handle, text, 'iMessage', simulate);
    if ((r.status === 'failed' || r.status === 'error') && !handle.includes('@') && r.code !== '-1743'
      && this.deps.smsAvailable() !== false) {
      this.log('warn', `iMessage didn't work (${r.note}). Trying SMS.`);
      const r2 = await this.sendOnce(handle, text, 'SMS', simulate);
      return { ...r2, note: `iMessage failed first; ${r2.note}` };
    }
    return r;
  }

  private async sendOnce(handle: string, text: string, service: 'iMessage' | 'SMS', simulate: boolean): Promise<SendResult> {
    if (simulate) {
      await this.deps.sleep(600);
      return { status: 'simulated', service, note: 'simulation only; nothing was sent' };
    }
    const t0 = this.deps.now() / 1000;
    const out = await this.deps.send(handle, text, service);
    if (!out.ok && !out.timedOut) return { status: 'error', service, note: out.message, code: out.code };
    if (!this.deps.chatDbReadable()) {
      return out.timedOut
        ? { status: 'pending', service, note: 'Messages was slow to respond; check whether it went out' }
        : { status: 'dispatched', service, note: 'handed to Messages; delivery not checked (Full Disk Access is off)' };
    }
    const deadline = this.deps.now() + this.options.verifySeconds * 1000;
    let last: OutgoingMessage | null = null;
    for (;;) {
      let found: OutgoingMessage[];
      try {
        found = this.deps.latestOutgoing(handle, t0 - 2);
      } catch (e) {
        return { status: 'dispatched', service, note: `handed to Messages; couldn't read the Messages database (${e instanceof Error ? e.message : e})` };
      }
      if (found.length) {
        last = found[0];
        const c = classify(last, false);
        if (c) return { ...c, service: last.service || service };
      }
      if (this.deps.now() >= deadline) break;
      await this.deps.sleep(this.options.pollMs);
    }
    if (!last) {
      return { status: 'not_found', service, note: 'Messages accepted it, but it never showed up in the Messages database; check Messages' };
    }
    const c = classify(last, true)!;
    return { ...c, service: last.service || service };
  }

  /** Send one text to the user's own number; touches no blast. */
  async testSend(handle: string, text: string, simulate: boolean): Promise<SendResult> {
    if (this.progress.running || this.busy) throw new Error('Wait until the current send finishes.');
    this.busy = true;
    try {
      if (!simulate) await this.deps.launchMessages();
      return await this.deliver(handle, text, simulate);
    } finally {
      this.busy = false;
    }
  }
}

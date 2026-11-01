import { describe, it, expect } from 'vitest';
import { TextBlastRunner, RunnerDeps, DEFAULT_OPTIONS } from './runner';
import { classify } from './classify';
import type { Blast, BlastRecipient, BlastStatus, OutgoingMessage, RecipientStatus } from './types';
import type { MessagesSendOutcome } from './messages';

/** A fake Yello backend + Messages + clock. Nothing real is sent. */
function harness(opts: {
  recipients: Partial<BlastRecipient>[];
  simulate?: boolean;
  sentToday?: number;
  chatDb?: boolean;
  sms?: boolean | null;
  /** What Messages does for each send, in order. Default: delivered over iMessage. */
  outcomes?: { send?: Partial<MessagesSendOutcome>; db?: Partial<OutgoingMessage> | null }[];
  /** Messages database rows found for interrupted sends, by phone. */
  existing?: Record<string, Partial<OutgoingMessage>>;
  failWriteOn?: RecipientStatus;
}) {
  let clock = 1_800_000_000_000;
  const blastStatuses: BlastStatus[] = [];
  const writes: { id: number; status: RecipientStatus; note?: string | null; service?: string | null }[] = [];
  const sends: { handle: string; service: string }[] = [];
  const recipients: BlastRecipient[] = opts.recipients.map((r, i) => ({
    id: i + 1, name: `P${i + 1}`, phone: `+1917555010${i}`, text: `Hi P${i + 1}`, status: '', service: null, sentAt: null, note: null, ...r,
  }));
  let sentToday = opts.sentToday ?? 0;
  let pendingRow: Partial<OutgoingMessage> | null = null;
  let pendingHandle = '';
  const outcomes = [...(opts.outcomes ?? [])];

  const deps: RunnerDeps = {
    api: {
      async getBlast(): Promise<Blast> {
        return { id: 7, simulate: !!opts.simulate, status: 'draft', recipients: recipients.map((r) => ({ ...r })) };
      },
      async setRecipientStatus(_b, id, u) {
        if (opts.failWriteOn === u.status) throw new Error('offline');
        writes.push({ id, ...u });
        const r = recipients.find((x) => x.id === id)!;
        r.status = u.status;
        if (u.status === 'in_flight' && !opts.simulate) sentToday++;
      },
      async setBlastStatus(_b, s) { blastStatuses.push(s); },
      async sentToday() { return { count: sentToday, cap: 80 }; },
    },
    async send(handle, _text, service) {
      sends.push({ handle, service });
      const o = outcomes.shift() ?? {};
      pendingHandle = handle;
      pendingRow = o.db === undefined ? { ROWID: sends.length, service, is_sent: 1, is_delivered: 1, error: 0 } : o.db;
      return { ok: true, timedOut: false, code: null, message: 'dispatched', ...o.send };
    },
    async launchMessages() { return { ok: true, message: '' }; },
    latestOutgoing(handle) {
      if (opts.existing?.[handle]) return [{ ROWID: 99, service: 'iMessage', is_sent: 1, is_delivered: 0, error: 0, ...opts.existing[handle] }];
      return pendingRow && handle === pendingHandle ? [{ ROWID: 1, service: 'iMessage', is_sent: 0, is_delivered: 0, error: 0, ...pendingRow }] : [];
    },
    chatDbReadable: () => opts.chatDb ?? true,
    smsAvailable: () => opts.sms ?? true,
    async sleep(ms) { clock += ms; },
    now: () => clock,
    random: () => 0.5,
    keepAwake: () => () => {},
  };
  return { deps, writes, sends, blastStatuses, recipients };
}

describe('classify', () => {
  const row = (o: Partial<OutgoingMessage>): OutgoingMessage => ({ ROWID: 1, service: 'iMessage', is_sent: 0, is_delivered: 0, error: 0, ...o });
  it('maps Messages rows to statuses', () => {
    expect(classify(row({ error: 22 }), false)).toEqual({ status: 'failed', note: 'Messages error 22 (Not Delivered)' });
    expect(classify(row({ is_delivered: 1 }), false)?.status).toBe('delivered');
    expect(classify(row({ is_sent: 1, service: 'SMS' }), false)?.status).toBe('sent_sms');
    expect(classify(row({ is_sent: 1 }), false)).toBeNull();
    expect(classify(row({ is_sent: 1 }), true)?.status).toBe('sent');
    expect(classify(row({}), true)?.status).toBe('pending');
  });
});

describe('TextBlastRunner', () => {
  it('sends in order, writing in_flight before each send and the result after', async () => {
    const h = harness({ recipients: [{}, { status: 'delivered' }, {}] });
    const runner = new TextBlastRunner(h.deps);
    await runner.start(7);
    expect(h.sends.map((s) => s.handle)).toEqual(['+19175550100', '+19175550102']);
    expect(h.writes.map((w) => [w.id, w.status])).toEqual([[1, 'in_flight'], [1, 'delivered'], [3, 'in_flight'], [3, 'delivered']]);
    expect(h.blastStatuses).toEqual(['running', 'finished']);
    expect(runner.snapshot()).toMatchObject({ running: false, sent: 2, failed: 0, total: 2 });
  });

  it('falls back to SMS when iMessage fails, but not for emails or when SMS is unavailable', async () => {
    const h = harness({
      recipients: [{}, { phone: 'ana@example.com' }],
      outcomes: [{ db: { error: 22 } }, { db: { is_sent: 1, service: 'SMS' } }, { db: { error: 22 } }],
    });
    await new TextBlastRunner(h.deps).start(7);
    expect(h.sends.map((s) => s.service)).toEqual(['iMessage', 'SMS', 'iMessage']);
    expect(h.writes.filter((w) => w.status !== 'in_flight').map((w) => w.status)).toEqual(['sent_sms', 'failed']);
    expect(h.writes[1].note).toMatch(/^iMessage failed first/);

    const h2 = harness({ recipients: [{}], sms: false, outcomes: [{ db: { error: 22 } }] });
    await new TextBlastRunner(h2.deps).start(7);
    expect(h2.sends).toHaveLength(1);
  });

  it('stops after 3 failures in a row', async () => {
    const fail = { send: { ok: false, code: '-1728', message: 'no account' } };
    const h = harness({ recipients: [{}, {}, {}, {}, {}], sms: false, outcomes: [fail, fail, fail, fail] });
    const runner = new TextBlastRunner(h.deps);
    await runner.start(7);
    expect(h.sends).toHaveLength(3);
    expect(h.blastStatuses.at(-1)).toBe('stopped');
    expect(runner.snapshot().log.at(-1)?.text).toMatch(/3 failures in a row/);
  });

  it('stops when more than 1 in 5 fail after 10 attempts', async () => {
    const fail = { send: { ok: false, code: '-1700', message: 'rejected' } };
    const ok = {};
    // fail, ok, fail, ok ... never 3 in a row, 50% failure
    const outcomes = Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? fail : ok));
    const h = harness({ recipients: Array.from({ length: 12 }, () => ({})), sms: false, outcomes });
    await new TextBlastRunner(h.deps).start(7);
    expect(h.sends).toHaveLength(10);
  });

  it('stops right away when macOS blocks control of Messages (-1743), without trying SMS', async () => {
    const h = harness({ recipients: [{}, {}], outcomes: [{ send: { ok: false, code: '-1743', message: 'blocked' } }] });
    await new TextBlastRunner(h.deps).start(7);
    expect(h.sends).toHaveLength(1);
    expect(h.writes.at(-1)?.status).toBe('error');
  });

  it('stops at the daily limit before sending', async () => {
    const h = harness({ recipients: [{}, {}], sentToday: 79 });
    await new TextBlastRunner(h.deps).start(7);
    expect(h.sends).toHaveLength(1);
    expect(h.blastStatuses.at(-1)).toBe('stopped');
  });

  it('waits 25–45 s between texts and stops during the wait', async () => {
    const h = harness({ recipients: [{}, {}, {}] });
    let runner!: TextBlastRunner;
    let waited = 0;
    const sleep = h.deps.sleep;
    h.deps.sleep = async (ms) => {
      await sleep(ms);
      waited += ms;
      if (waited > 30_000) runner.stop();
    };
    runner = new TextBlastRunner(h.deps);
    await runner.start(7);
    expect(h.sends).toHaveLength(1);
    expect(h.blastStatuses.at(-1)).toBe('stopped');
  });

  it('skips someone unticked during the pause before their text', async () => {
    const h = harness({ recipients: [{}, {}, {}] });
    const sleep = h.deps.sleep;
    h.deps.sleep = async (ms) => {
      await sleep(ms);
      if (h.sends.length === 1) h.recipients[1].status = 'skipped';
    };
    await new TextBlastRunner(h.deps).start(7);
    expect(h.sends.map((s) => s.handle)).toEqual([h.recipients[0].phone, h.recipients[2].phone]);
    expect(h.writes.some((w) => w.id === 2)).toBe(false);
    expect(h.blastStatuses.at(-1)).toBe('finished');
  });

  it("doesn't resend an interrupted text that Messages shows went out", async () => {
    const sentAt = new Date(1_800_000_000_000 - 60_000).toISOString();
    const h = harness({
      recipients: [{ status: 'in_flight', sentAt }, { status: 'in_flight', sentAt }],
      existing: { '+19175550100': { is_delivered: 1 } },
    });
    await new TextBlastRunner(h.deps).start(7);
    expect(h.sends.map((s) => s.handle)).toEqual(['+19175550101']);
    expect(h.writes[0]).toMatchObject({ id: 1, status: 'delivered' });
    expect(h.writes[0].note).toMatch(/found after an interruption/);
  });

  it('holds back an interrupted text when delivery cannot be checked', async () => {
    const h = harness({ recipients: [{ status: 'in_flight', sentAt: new Date().toISOString() }], chatDb: false });
    await new TextBlastRunner(h.deps).start(7);
    expect(h.sends).toHaveLength(0);
    expect(h.writes[0].status).toBe('needs_review');
  });

  it('marks sends as dispatched without Full Disk Access', async () => {
    const h = harness({ recipients: [{}], chatDb: false });
    await new TextBlastRunner(h.deps).start(7);
    expect(h.writes.at(-1)?.status).toBe('dispatched');
  });

  it('marks not_found when the text never shows up in Messages', async () => {
    const h = harness({ recipients: [{}], outcomes: [{ db: null }] });
    await new TextBlastRunner(h.deps).start(7);
    expect(h.writes.at(-1)).toMatchObject({ status: 'not_found' });
  });

  it('never sends when the in_flight write fails', async () => {
    const h = harness({ recipients: [{}], failWriteOn: 'in_flight' });
    const runner = new TextBlastRunner(h.deps);
    await runner.start(7);
    expect(h.sends).toHaveLength(0);
    expect(runner.snapshot().log.at(-1)?.text).toMatch(/nothing was sent/);
  });

  it('simulates without calling Messages, using short waits', async () => {
    const h = harness({ recipients: [{}, {}], simulate: true });
    let slept = 0;
    const sleep = h.deps.sleep;
    h.deps.sleep = async (ms) => { slept += ms; await sleep(ms); };
    await new TextBlastRunner(h.deps).start(7);
    expect(h.sends).toHaveLength(0);
    expect(h.writes.filter((w) => w.status === 'simulated')).toHaveLength(2);
    expect(slept).toBeLessThan(DEFAULT_OPTIONS.delaySeconds[0] * 1000);
  });

  it('refuses to start twice and test-sends without touching the blast', async () => {
    const h = harness({ recipients: [{}] });
    const runner = new TextBlastRunner(h.deps);
    const run = runner.start(7);
    await expect(runner.start(7)).rejects.toThrow(/Already sending/);
    await run;
    const res = await runner.testSend('+19175550199', 'test', false);
    expect(res.status).toBe('delivered');
    expect(h.writes.every((w) => w.id === 1)).toBe(true);
  });
});

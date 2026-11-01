import type { Database } from 'better-sqlite3';
import type { PreviewRecipient } from './recipients.js';
import { cleanText, renderTemplate } from './template.js';

export const RECIPIENT_STATUSES = ['', 'in_flight', 'delivered', 'sent', 'sent_sms', 'dispatched', 'failed', 'error',
  'pending', 'not_found', 'needs_review', 'skipped', 'simulated'] as const;
export type RecipientStatus = typeof RECIPIENT_STATUSES[number];
export const BLAST_STATUSES = ['draft', 'running', 'stopped', 'finished'] as const;
export type BlastStatus = typeof BLAST_STATUSES[number];

/** Handed to Messages; never sent again. */
export const DONE_STATUSES: RecipientStatus[] = ['delivered', 'sent', 'sent_sms', 'dispatched'];
/** Statuses that count as an attempt toward the daily and hourly limits. */
const ATTEMPT_STATUSES: RecipientStatus[] = ['in_flight', 'delivered', 'sent', 'sent_sms', 'dispatched', 'failed',
  'error', 'pending', 'not_found', 'needs_review'];

/** Send limits, set on the Text Blast page. Defaults match the `user_settings` columns. */
export interface SendLimits { daily: number; hourly: number }
export const DEFAULT_LIMITS: SendLimits = { daily: 80, hourly: 60 };
export const LIMIT_RANGE = { daily: [1, 1000], hourly: [1, 200] } as const;

export interface BlastSources { groups: string[]; csvName: string | null }

export interface BlastRecipient {
  id: number;
  contactId: number | null;
  position: number;
  name: string;
  phone: string;
  text: string;
  isCustom: boolean;
  source: 'group' | 'csv' | 'both';
  status: RecipientStatus;
  service: string | null;
  sentAt: string | null;
  note: string | null;
}

export interface Blast {
  id: number;
  createdAt: string;
  template: string;
  country: string;
  simulate: boolean;
  status: BlastStatus;
  sources: BlastSources;
  total: number;
  counts: Partial<Record<RecipientStatus, number>>;
  recipients?: BlastRecipient[];
}

interface BlastRow {
  id: number; created_at: string; template: string; country: string; simulate: number; status: BlastStatus; sources: string;
}
interface RecipientRow {
  id: number; contact_id: number | null; position: number; name: string; phone: string; text: string; is_custom: number;
  source: 'group' | 'csv' | 'both'; status: RecipientStatus; service: string | null; sent_at: string | null;
  status_note: string | null; values_json: string;
}

function toBlast(db: Database, row: BlastRow): Blast {
  const counts = Object.fromEntries((db.prepare(
    'SELECT status, COUNT(*) AS n FROM text_blast_recipients WHERE blast_id = ? GROUP BY status',
  ).all(row.id) as { status: RecipientStatus; n: number }[]).map((r) => [r.status, r.n]));
  return {
    id: row.id,
    createdAt: row.created_at,
    template: row.template,
    country: row.country,
    simulate: !!row.simulate,
    status: row.status,
    sources: JSON.parse(row.sources || '{}'),
    total: Object.values(counts).reduce((a: number, b) => a + (b as number), 0),
    counts,
  };
}

function toRecipient(r: RecipientRow): BlastRecipient {
  return {
    id: r.id, contactId: r.contact_id, position: r.position, name: r.name, phone: r.phone, text: r.text,
    isCustom: !!r.is_custom, source: r.source, status: r.status, service: r.service, sentAt: r.sent_at, note: r.status_note,
  };
}

/** Store a blast with each person's final text. Only sendable rows (a number, no problems) are kept. */
export function createBlast(db: Database, input: {
  template: string; country: string; simulate: boolean; sources: BlastSources; recipients: PreviewRecipient[];
}): number {
  const sendable = input.recipients.filter((r) => r.phone && !r.problems.length && r.text);
  if (!sendable.length) throw new Error('Nobody on the list can be sent to yet.');
  const insertRecipient = db.prepare(`
    INSERT INTO text_blast_recipients (blast_id, contact_id, position, name, phone, text, is_custom, source, values_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return db.transaction(() => {
    const id = Number(db.prepare('INSERT INTO text_blasts (template, country, simulate, sources) VALUES (?, ?, ?, ?)')
      .run(input.template, input.country, input.simulate ? 1 : 0, JSON.stringify(input.sources)).lastInsertRowid);
    sendable.forEach((r, i) => insertRecipient.run(id, r.contactId, i, r.name, r.phone, r.text, r.isCustom ? 1 : 0,
      r.source, JSON.stringify(r.values)));
    return id;
  })();
}

export function getBlast(db: Database, id: number, withRecipients = true): Blast | null {
  const row = db.prepare('SELECT * FROM text_blasts WHERE id = ?').get(id) as BlastRow | undefined;
  if (!row) return null;
  const blast = toBlast(db, row);
  if (withRecipients) {
    blast.recipients = (db.prepare('SELECT * FROM text_blast_recipients WHERE blast_id = ? ORDER BY position')
      .all(id) as RecipientRow[]).map(toRecipient);
  }
  return blast;
}

export function listBlasts(db: Database): Blast[] {
  return (db.prepare('SELECT * FROM text_blasts ORDER BY id DESC LIMIT 100').all() as BlastRow[]).map((r) => toBlast(db, r));
}

export function deleteBlast(db: Database, id: number): boolean {
  return db.prepare("DELETE FROM text_blasts WHERE id = ? AND status != 'running'").run(id).changes > 0;
}

export function setBlastStatus(db: Database, id: number, status: BlastStatus): boolean {
  return db.prepare('UPDATE text_blasts SET status = ? WHERE id = ?').run(status, id).changes > 0;
}

/**
 * Record a send attempt's progress. `in_flight` stamps `sent_at` (the start of the attempt),
 * which the desktop app uses to look the text up in Messages after an interruption.
 */
export function setRecipientStatus(db: Database, blastId: number, recipientId: number, update: {
  status: RecipientStatus; service?: string | null; note?: string | null;
}): BlastRecipient | null {
  const now = new Date().toISOString();
  const res = db.prepare(`
    UPDATE text_blast_recipients
    SET status = @status, service = @service, status_note = @note, updated_at = @now,
        sent_at = CASE WHEN @status = 'in_flight' THEN @now WHEN @status = '' THEN NULL ELSE sent_at END
    WHERE id = @id AND blast_id = @blastId
  `).run({ status: update.status, service: update.service ?? null, note: update.note ?? null, now, id: recipientId, blastId });
  if (!res.changes) return null;
  return toRecipient(db.prepare('SELECT * FROM text_blast_recipients WHERE id = ?').get(recipientId) as RecipientRow);
}

/** Untick (skip) or re-tick people who haven't been sent to. Done rows are never changed. */
export function setSkipped(db: Database, blastId: number, ids: number[], skipped: boolean): number {
  const stmt = db.prepare(`
    UPDATE text_blast_recipients SET status = ?, status_note = NULL, updated_at = ?
    WHERE id = ? AND blast_id = ? AND status IN (${skipped ? "'', 'failed', 'error', 'simulated'" : "'skipped'"})
  `);
  const now = new Date().toISOString();
  return db.transaction(() => ids.reduce((n, id) => n + stmt.run(skipped ? 'skipped' : '', now, id, blastId).changes, 0))();
}

/** Real (not simulated) send attempts since `sinceIso`, across all blasts. */
export function getLimits(db: Database): SendLimits {
  const row = db.prepare('SELECT text_blast_daily_limit AS daily, text_blast_hourly_limit AS hourly FROM user_settings WHERE id = 1')
    .get() as SendLimits | undefined;
  return row ?? { ...DEFAULT_LIMITS };
}

export function setLimits(db: Database, limits: SendLimits): SendLimits {
  db.prepare(`UPDATE user_settings SET text_blast_daily_limit = ?, text_blast_hourly_limit = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1`).run(limits.daily, limits.hourly);
  return getLimits(db);
}

/**
 * Where the user stands against both limits. The hour is a rolling 60 minutes; `hourResetAt` is when
 * the oldest attempt in it drops out (null when the hour isn't full).
 */
export function sendCounts(db: Database, todaySinceIso: string, now = new Date()) {
  const limits = getLimits(db);
  const hourAgo = new Date(now.getTime() - 3600_000).toISOString();
  const hourCount = sentSince(db, hourAgo);
  let hourResetAt: string | null = null;
  if (hourCount >= limits.hourly) {
    const ph = ATTEMPT_STATUSES.map(() => '?').join(',');
    // The attempt whose expiry brings the count back under the limit.
    const row = db.prepare(`
      SELECT r.sent_at AS at FROM text_blast_recipients r JOIN text_blasts b ON b.id = r.blast_id
      WHERE b.simulate = 0 AND r.sent_at >= ? AND r.status IN (${ph})
      ORDER BY r.sent_at LIMIT 1 OFFSET ?
    `).get(hourAgo, ...ATTEMPT_STATUSES, hourCount - limits.hourly) as { at: string } | undefined;
    if (row) hourResetAt = new Date(new Date(row.at).getTime() + 3600_000).toISOString();
  }
  return {
    count: sentSince(db, todaySinceIso),
    cap: limits.daily,
    hourCount,
    hourCap: limits.hourly,
    hourResetAt,
  };
}

export function sentSince(db: Database, sinceIso: string): number {
  const ph = ATTEMPT_STATUSES.map(() => '?').join(',');
  return (db.prepare(`
    SELECT COUNT(*) AS n FROM text_blast_recipients r JOIN text_blasts b ON b.id = r.blast_id
    WHERE b.simulate = 0 AND r.sent_at >= ? AND r.status IN (${ph})
  `).get(sinceIso, ...ATTEMPT_STATUSES) as { n: number }).n;
}

/**
 * A new draft for the same people with a new message, re-rendered from the stored placeholder
 * values. People whose new text can't be filled in are added as `skipped` with the reason.
 */
export function rerunBlast(db: Database, id: number, template: string, simulate: boolean): number | null {
  const blast = getBlast(db, id, false);
  if (!blast) return null;
  const rows = db.prepare('SELECT * FROM text_blast_recipients WHERE blast_id = ? ORDER BY position').all(id) as RecipientRow[];
  const insert = db.prepare(`
    INSERT INTO text_blast_recipients (blast_id, contact_id, position, name, phone, text, is_custom, source, values_json,
      status, status_note)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `);
  return db.transaction(() => {
    const newId = Number(db.prepare('INSERT INTO text_blasts (template, country, simulate, sources) VALUES (?, ?, ?, ?)')
      .run(template, blast.country, simulate ? 1 : 0, JSON.stringify(blast.sources)).lastInsertRowid);
    rows.forEach((r, i) => {
      const { text, problems } = renderTemplate(template, JSON.parse(r.values_json || '{}'));
      const clean = cleanText(text);
      const problem = problems[0] ?? (clean ? null : 'message is empty');
      insert.run(newId, r.contact_id, i, r.name, r.phone, clean, r.source, r.values_json,
        problem ? 'skipped' : '', problem);
    });
    return newId;
  })();
}

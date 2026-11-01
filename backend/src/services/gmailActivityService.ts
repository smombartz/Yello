import type { Database as DatabaseType } from 'better-sqlite3';
import { getAuthDatabase } from './authDatabase.js';
import { getValidAccessToken } from './googleAuthService.js';
import { gmailFetch, getHeader, type GmailMessage, type GmailMessageListResponse } from './emailSyncService.js';
import { ingestActivity, setSourceStatus, todayString, type IngestActivity, type IngestHandle } from './messageActivityService.js';

/**
 * Gmail's part of Top contacts: counts the user's emails per correspondent
 * and day from message headers only (From/To/Cc, never bodies), then stores
 * them through ingestActivity like every other channel.
 *
 * The first scan covers FIRST_SCAN_DAYS; later scans start a couple of days
 * before the last covered day. Runs in the background; progress lives in
 * message_sources and is polled through GET /api/messages/sources.
 */

export const FIRST_SCAN_DAYS = 730;
const RESCAN_OVERLAP_DAYS = 2;
const PARALLEL_FETCHES = 10;
const PROGRESS_EVERY = 100;
/** More recipients than this make an email a group message */
const GROUP_RECIPIENTS = 2;

const EXCLUDE_QUERY = '-in:chats -in:spam -in:trash -category:promotions -category:social -category:updates -category:forums';

const NO_REPLY_RE = /^(no-?reply|do-?not-?reply|notifications?|mailer-daemon|postmaster|bounce[s]?)([+.\-_@]|$)/i;

interface GmailMetadata extends GmailMessage {
  labelIds?: string[];
}

const running = new Set<number>();

export function isGmailScanRunning(userId: number): boolean {
  return running.has(userId);
}

/** "Ada Lovelace" <ada@x.com>, bob@y.com → [{ email, name }] */
export function parseAddressList(header: string): Array<{ email: string; name: string | null }> {
  const out: Array<{ email: string; name: string | null }> = [];
  if (!header) return out;
  // Split on commas outside quotes
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of header) {
    if (ch === '"') quoted = !quoted;
    if (ch === ',' && !quoted) { parts.push(current); current = ''; } else current += ch;
  }
  parts.push(current);
  for (const part of parts) {
    const angle = part.match(/^(.*)<([^>]+)>\s*$/);
    const email = (angle ? angle[2] : part).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    const name = angle ? angle[1].trim().replace(/^"|"$/g, '').trim() : '';
    out.push({ email, name: name && !name.includes('@') ? name : null });
  }
  return out;
}

/** YYYY-MM-DD of an instant in the user's time zone. */
export function dayIn(timeZone: string, ms: number): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Retries Gmail's rate-limit and transient errors with backoff. */
async function fetchWithRetry<T>(accessToken: string, path: string): Promise<{ data: T | null; scopeError: boolean }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await gmailFetch<T>(accessToken, path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = /Gmail API error: (429|500|502|503)|rateLimitExceeded|userRateLimitExceeded/.test(message);
      if (!retryable || attempt >= 5) throw err;
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

export interface GmailTally {
  handles: Map<string, string | null>;
  /** handle → day → counts */
  activity: Map<string, Map<string, { sent: number; received: number; group: number }>>;
  me: Set<string>;
}

export function newTally(userEmail: string): GmailTally {
  return { handles: new Map(), activity: new Map(), me: new Set([userEmail.toLowerCase()]) };
}

function bump(tally: GmailTally, email: string, name: string | null, day: string, field: 'sent' | 'received' | 'group'): void {
  if (!tally.handles.get(email) && name) tally.handles.set(email, name);
  else if (!tally.handles.has(email)) tally.handles.set(email, null);
  let days = tally.activity.get(email);
  if (!days) { days = new Map(); tally.activity.set(email, days); }
  const counts = days.get(day) ?? { sent: 0, received: 0, group: 0 };
  counts[field]++;
  days.set(day, counts);
}

/**
 * Count one message. Sent mail counts for each recipient; received mail
 * counts for the sender, skipping bulk mail (List-Unsubscribe, Precedence)
 * and no-reply senders. More than GROUP_RECIPIENTS others makes it a group message.
 */
export function tallyMessage(tally: GmailTally, message: GmailMetadata, timeZone: string): void {
  const day = dayIn(timeZone, Number(message.internalDate));
  const from = parseAddressList(getHeader(message, 'From'));
  const recipients = [...parseAddressList(getHeader(message, 'To')), ...parseAddressList(getHeader(message, 'Cc'))];
  const isSent = message.labelIds?.includes('SENT') ?? false;

  if (isSent) {
    for (const f of from) tally.me.add(f.email);
    const others = dedupe(recipients.filter(r => !tally.me.has(r.email)));
    const field = others.length > GROUP_RECIPIENTS ? 'group' : 'sent';
    for (const r of others) bump(tally, r.email, r.name, day, field);
    return;
  }

  if (getHeader(message, 'List-Unsubscribe') || /bulk|list|junk/i.test(getHeader(message, 'Precedence'))) return;
  const sender = from[0];
  if (!sender || tally.me.has(sender.email) || NO_REPLY_RE.test(sender.email)) return;
  const others = dedupe(recipients.filter(r => !tally.me.has(r.email) && r.email !== sender.email));
  bump(tally, sender.email, sender.name, day, others.length >= GROUP_RECIPIENTS ? 'group' : 'received');
}

function dedupe<T extends { email: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter(x => (seen.has(x.email) ? false : (seen.add(x.email), true)));
}

/** Store a finished tally for [from, to], dropping the user's own addresses. */
export function saveTally(db: DatabaseType, tally: GmailTally, from: string, to: string): void {
  const handles: IngestHandle[] = [];
  const activity: IngestActivity[] = [];
  for (const [email, name] of tally.handles) {
    if (tally.me.has(email)) continue;
    handles.push({ handle: email, kind: 'email', displayName: name });
    for (const [day, c] of tally.activity.get(email) ?? []) {
      activity.push({ handle: email, day, sent: c.sent, received: c.received, group: c.group });
    }
  }
  ingestActivity(db, { channel: 'gmail', from, to, handles, activity, final: true });
}

/**
 * Scan Gmail into message activity. Resolves when done; callers normally
 * don't await it. Throws 'gmail_scope_required' / 'no_token' before starting.
 */
export async function startGmailScan(db: DatabaseType, userId: number, timeZone: string): Promise<() => Promise<void>> {
  if (running.has(userId)) throw new Error('already_running');
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) throw new Error('no_token');

  // Check the scope before going to the background, so the UI can ask for it
  const probe = await gmailFetch<GmailMessageListResponse>(accessToken, '/messages?maxResults=1');
  if (probe.scopeError) throw new Error('gmail_scope_required');

  const user = getAuthDatabase().prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!user) throw new Error('user_not_found');

  const source = db.prepare('SELECT covered_through FROM message_sources WHERE channel = ?').get('gmail') as
    { covered_through: string | null } | undefined;
  const today = todayString();
  const from = source?.covered_through
    ? shiftDay(source.covered_through, -RESCAN_OVERLAP_DAYS)
    : shiftDay(today, -FIRST_SCAN_DAYS);

  running.add(userId);
  setSourceStatus(db, 'gmail', { status: 'running', progressDone: 0, progressTotal: null, error: null });

  return async () => {
    try {
      await runScan(db, userId, user.email, from, today, timeZone);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSourceStatus(db, 'gmail', { status: 'failed', error: message.slice(0, 500) });
      throw err;
    } finally {
      running.delete(userId);
    }
  };
}

async function runScan(db: DatabaseType, userId: number, userEmail: string, from: string, to: string, timeZone: string): Promise<void> {
  // Gmail's after: is a day boundary in PST; a day earlier is safe since the range replaces counts
  const after = shiftDay(from, -1).replace(/-/g, '/');
  const query = encodeURIComponent(`after:${after} ${EXCLUDE_QUERY}`);

  // 1. Every message id in the range
  const ids: string[] = [];
  let pageToken: string | undefined;
  let token = await getValidAccessToken(userId);
  do {
    const page = await fetchWithRetry<GmailMessageListResponse>(token!,
      `/messages?maxResults=500&q=${query}${pageToken ? `&pageToken=${pageToken}` : ''}`);
    if (page.scopeError) throw new Error('gmail_scope_required');
    for (const m of page.data?.messages ?? []) ids.push(m.id);
    pageToken = page.data?.nextPageToken;
    setSourceStatus(db, 'gmail', { progressDone: 0, progressTotal: ids.length });
  } while (pageToken);

  // 2. Headers of each, a few at a time
  const tally = newTally(userEmail);
  const headers = ['From', 'To', 'Cc', 'List-Unsubscribe', 'Precedence'].map(h => `metadataHeaders=${h}`).join('&');
  for (let i = 0; i < ids.length; i += PARALLEL_FETCHES) {
    if (i % 1000 === 0) token = await getValidAccessToken(userId); // refresh before the hour runs out
    const batch = ids.slice(i, i + PARALLEL_FETCHES);
    const messages = await Promise.all(batch.map(id =>
      fetchWithRetry<GmailMetadata>(token!, `/messages/${id}?format=metadata&${headers}`).then(r => r.data)));
    for (const message of messages) {
      if (message && Number(message.internalDate) > 0) tallyMessage(tally, message, timeZone);
    }
    if ((i / PARALLEL_FETCHES) % (PROGRESS_EVERY / PARALLEL_FETCHES) === 0) {
      setSourceStatus(db, 'gmail', { progressDone: Math.min(i + PARALLEL_FETCHES, ids.length) });
    }
  }

  // 3. Store, replacing the range's previous counts
  saveTally(db, tally, from, to);
  setSourceStatus(db, 'gmail', { status: 'idle', progressDone: ids.length, progressTotal: ids.length, error: null });
}

/** A scan the server restart interrupted shows as failed instead of running forever. */
export function markStaleGmailScan(db: DatabaseType, userId: number): void {
  if (running.has(userId)) return;
  db.prepare(`
    UPDATE message_sources SET status = 'failed', error = 'Interrupted by a server restart. Scan again.'
    WHERE channel = 'gmail' AND status = 'running'
  `).run();
}

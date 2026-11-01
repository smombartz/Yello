import { BlobReader, TextWriter, ZipReader, type Entry, type FileEntry } from '@zip.js/zip.js';
import type { ActivityUpload } from '../api/messageHooks';

/**
 * Instagram and LinkedIn "download your data" exports, read in the browser.
 * Only the message files are opened (zip.js reads the zip's directory and
 * seeks to them, so a multi-GB export with media is fine), and only daily
 * counts per person leave the browser, never message text.
 */

export interface ParsedExport {
  from: string;
  to: string;
  handles: ActivityUpload['handles'];
  activity: ActivityUpload['activity'];
  /** Conversations read, for the summary */
  conversations: number;
  messages: number;
}

type Counts = { sent: number; received: number; group: number };

class Tally {
  handles = new Map<string, { handle: string; kind?: ActivityUpload['handles'][number]['kind']; displayName?: string | null }>();
  days = new Map<string, Counts>();
  messages = 0;

  handle(handle: string, displayName: string | null, kind?: ActivityUpload['handles'][number]['kind']): void {
    const existing = this.handles.get(handle);
    if (!existing) this.handles.set(handle, { handle, kind, displayName });
    else if (!existing.displayName && displayName) existing.displayName = displayName;
  }

  add(handle: string, day: string, field: keyof Counts): void {
    const key = `${handle}\u0000${day}`;
    const c = this.days.get(key) ?? { sent: 0, received: 0, group: 0 };
    c[field]++;
    this.days.set(key, c);
  }

  result(conversations: number): ParsedExport | null {
    const activity: ActivityUpload['activity'] = [];
    let from = '9999-99-99';
    let to = '0000-00-00';
    for (const [key, c] of this.days) {
      const [handle, day] = key.split('\u0000');
      activity.push({ handle, day, ...c });
      if (day < from) from = day;
      if (day > to) to = day;
    }
    if (!activity.length) return null;
    return { from, to, handles: [...this.handles.values()], activity, conversations, messages: this.messages };
  }
}

/** YYYY-MM-DD in the browser's time zone */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Meta's exports write UTF-8 bytes as Latin-1 escapes ("JosÃ©"); turn them back. */
export function fixMetaText(s: string): string {
  if (![...s].every(ch => ch.charCodeAt(0) < 256)) return s;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(s, ch => ch.charCodeAt(0)));
  } catch {
    return s;
  }
}

async function openZip(file: File): Promise<{ reader: ZipReader<unknown>; entries: FileEntry[] }> {
  const reader = new ZipReader(new BlobReader(file));
  const entries = (await reader.getEntries()).filter((e: Entry): e is FileEntry => !e.directory);
  return { reader, entries };
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

interface InstagramThread {
  participants?: Array<{ name: string }>;
  messages?: Array<{ sender_name?: string; timestamp_ms?: number }>;
}

const INSTAGRAM_THREAD_RE = /(?:^|\/)messages\/inbox\/([^/]+)\/message_\d+\.json$/;

/**
 * Instagram threads, keyed by their export folder. A 1:1 thread counts sent
 * and received for the other person; group threads count each sender's
 * messages as group messages, for people who also have a 1:1 thread.
 * The user is the one participant present in every thread.
 */
export function tallyInstagram(threads: Map<string, InstagramThread[]>): ParsedExport | null {
  const tally = new Tally();

  // Who am I: the name in the most threads
  const seen = new Map<string, number>();
  for (const parts of threads.values()) {
    const names = new Set(parts.flatMap(p => (p.participants ?? []).map(x => fixMetaText(x.name))));
    for (const n of names) seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  const me = [...seen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!me) return null;

  const directByName = new Map<string, string>();
  const groups: InstagramThread[][] = [];
  for (const [folder, parts] of threads) {
    const people = [...new Set(parts.flatMap(p => (p.participants ?? []).map(x => fixMetaText(x.name))))].filter(n => n !== me);
    if (people.length !== 1) { groups.push(parts); continue; }
    const other = people[0];
    const handle = `ig:${folder}`;
    directByName.set(other, handle);
    tally.handle(handle, other, 'opaque');
    for (const part of parts) {
      for (const m of part.messages ?? []) {
        if (!m.timestamp_ms || !m.sender_name) continue;
        tally.messages++;
        tally.add(handle, localDay(m.timestamp_ms), fixMetaText(m.sender_name) === me ? 'sent' : 'received');
      }
    }
  }
  for (const parts of groups) {
    for (const part of parts) {
      for (const m of part.messages ?? []) {
        if (!m.timestamp_ms || !m.sender_name) continue;
        const handle = directByName.get(fixMetaText(m.sender_name));
        if (!handle) continue;
        tally.messages++;
        tally.add(handle, localDay(m.timestamp_ms), 'group');
      }
    }
  }
  return tally.result(threads.size);
}

export async function parseInstagramExport(file: File, onProgress?: (done: number, total: number) => void): Promise<ParsedExport | null> {
  const { reader, entries } = await openZip(file);
  try {
    const threadEntries = entries.filter(e => INSTAGRAM_THREAD_RE.test(e.filename));
    if (!threadEntries.length) {
      throw new Error('No Instagram messages in this file. Request the export in JSON format with Messages included.');
    }
    const threads = new Map<string, InstagramThread[]>();
    let done = 0;
    for (const entry of threadEntries) {
      const folder = entry.filename.match(INSTAGRAM_THREAD_RE)![1];
      const json = JSON.parse(await entry.getData(new TextWriter())) as InstagramThread;
      const list = threads.get(folder) ?? [];
      list.push(json);
      threads.set(folder, list);
      onProgress?.(++done, threadEntries.length);
    }
    return tallyInstagram(threads);
  } finally {
    await reader.close();
  }
}

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim()));
}

function splitList(value: string): string[] {
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

function profileKey(url: string): string {
  return url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
}

/**
 * LinkedIn messages.csv: one row per message with sender and recipient
 * profile URLs. The user is the profile in the most conversations.
 */
export function tallyLinkedIn(csv: string): ParsedExport | null {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ''));
  const header = rows.shift()?.map(h => h.trim().toUpperCase());
  if (!header) return null;
  const col = (name: string) => header.indexOf(name);
  const iConv = col('CONVERSATION ID');
  const iFrom = col('FROM');
  const iFromUrl = col('SENDER PROFILE URL');
  const iTo = col('TO');
  const iToUrls = col('RECIPIENT PROFILE URLS');
  const iDate = col('DATE');
  const iFolder = col('FOLDER');
  const iDraft = col('IS MESSAGE DRAFT');
  if (iFromUrl < 0 || iToUrls < 0 || iDate < 0) {
    throw new Error('This isn’t LinkedIn’s messages.csv (missing the profile URL or date columns).');
  }

  // Who am I: the profile in the most conversations
  const convsByUrl = new Map<string, Set<string>>();
  for (const r of rows) {
    const conv = r[iConv] ?? '';
    for (const url of [r[iFromUrl], ...splitList(r[iToUrls] ?? '')]) {
      if (!url) continue;
      const key = profileKey(url);
      const set = convsByUrl.get(key) ?? new Set();
      set.add(conv);
      convsByUrl.set(key, set);
    }
  }
  const me = [...convsByUrl.entries()].sort((a, b) => b[1].size - a[1].size)[0]?.[0];
  if (!me) return null;

  const tally = new Tally();
  const conversations = new Set<string>();
  for (const r of rows) {
    if (iDraft >= 0 && /^(yes|true)$/i.test(r[iDraft] ?? '')) continue;
    if (iFolder >= 0 && /spam/i.test(r[iFolder] ?? '')) continue;
    const ms = Date.parse((r[iDate] ?? '').replace(' UTC', 'Z').replace(' ', 'T'));
    if (!Number.isFinite(ms)) continue;
    const day = localDay(ms);
    const fromUrl = r[iFromUrl] ?? '';
    const toUrls = splitList(r[iToUrls] ?? '');
    const toNames = iTo >= 0 ? splitList(r[iTo] ?? '') : [];
    const others = toUrls.map((url, i) => ({ url, name: toNames.length === toUrls.length ? toNames[i] : null }))
      .filter(o => profileKey(o.url) !== me);
    tally.messages++;
    conversations.add(r[iConv] ?? '');

    if (profileKey(fromUrl) === me) {
      for (const o of others) {
        tally.handle(o.url, o.name, 'url');
        tally.add(o.url, day, others.length > 1 ? 'group' : 'sent');
      }
    } else if (fromUrl) {
      tally.handle(fromUrl, iFrom >= 0 ? r[iFrom] || null : null, 'url');
      tally.add(fromUrl, day, others.length > 1 ? 'group' : 'received');
    }
  }
  return tally.result(conversations.size);
}

export async function parseLinkedInExport(file: File): Promise<ParsedExport | null> {
  if (file.name.toLowerCase().endsWith('.csv')) return tallyLinkedIn(await file.text());
  const { reader, entries } = await openZip(file);
  try {
    const entry = entries.find(e => /(^|\/)messages\.csv$/i.test(e.filename));
    if (!entry) throw new Error('No messages.csv in this file. Request LinkedIn’s data archive with Messages included.');
    return tallyLinkedIn(await entry.getData(new TextWriter()));
  } finally {
    await reader.close();
  }
}

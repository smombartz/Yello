import type { Database as DatabaseType } from 'better-sqlite3';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Turning the people in message sources (a phone number in iMessage, a
 * WhatsApp JID, an Instagram username, a LinkedIn profile URL) into Yello
 * contacts. Handles are normalized once on the way in so the same person
 * always has the same key, then matched against contact details.
 */

export const MESSAGE_CHANNELS = ['gmail', 'imessage', 'whatsapp', 'instagram', 'linkedin'] as const;
export type MessageChannel = typeof MESSAGE_CHANNELS[number];

export type HandleKind = 'phone' | 'email' | 'username' | 'url' | 'opaque';

export interface NormalizedHandle {
  handle: string;
  kind: HandleKind;
}

/** Region assumed for numbers written without a country code, as elsewhere in Yello. */
const DEFAULT_REGION = 'US';

/** Digits compared when a number matches no contact exactly (drops country and trunk prefixes). */
const PHONE_TAIL_DIGITS = 9;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A phone number as E.164, or null when it isn't one. Accepts 00-prefixed international numbers. */
export function toE164(raw: string, region: string = DEFAULT_REGION): string | null {
  let s = raw.trim();
  if (!s || s.includes('@')) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  const parsed = parsePhoneNumberFromString(s, s.startsWith('+') ? undefined : region as never);
  if (parsed?.isValid()) return parsed.number;
  // Short codes and numbers libphonenumber rejects: keep the digits so they still group
  const digits = s.replace(/[^\d]/g, '');
  if (digits.length < 3) return null;
  return s.startsWith('+') ? `+${digits}` : digits;
}

function phoneTail(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= PHONE_TAIL_DIGITS ? digits.slice(-PHONE_TAIL_DIGITS) : null;
}

/** linkedin.com/in/<slug> (lowercase, no trailing slash) from any form of a profile URL. */
export function normalizeLinkedInUrl(raw: string): string | null {
  const match = raw.trim().toLowerCase().match(/linkedin\.com\/(?:mwlite\/)?in\/([^/?#\s]+)/);
  if (!match) return null;
  let slug = match[1];
  try { slug = decodeURIComponent(slug); } catch { /* keep as is */ }
  return `linkedin.com/in/${slug}`;
}

/** An Instagram username without @ or URL, lowercase. */
export function normalizeInstagramUsername(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  const fromUrl = s.match(/instagram\.com\/([^/?#\s]+)/);
  if (fromUrl) s = fromUrl[1];
  s = s.replace(/^@/, '');
  return /^[a-z0-9._]{1,30}$/.test(s) ? s : null;
}

/**
 * The canonical handle for whatever a source reported. Unrecognizable values
 * come back as `opaque`, prefixed so they never collide with real handles.
 */
export function normalizeHandle(channel: MessageChannel, raw: string, kindHint?: HandleKind): NormalizedHandle | null {
  const value = raw.trim();
  if (!value) return null;

  if (kindHint === 'opaque') return { handle: `opaque:${value}`, kind: 'opaque' };

  switch (channel) {
    case 'gmail': {
      const email = value.toLowerCase();
      return EMAIL_RE.test(email) ? { handle: email, kind: 'email' } : null;
    }
    case 'imessage': {
      if (value.includes('@')) {
        const email = value.toLowerCase();
        return EMAIL_RE.test(email) ? { handle: email, kind: 'email' } : null;
      }
      const phone = toE164(value);
      return phone ? { handle: phone, kind: 'phone' } : { handle: `opaque:${value}`, kind: 'opaque' };
    }
    case 'whatsapp': {
      // JIDs: 4915112345678@s.whatsapp.net carries the number; @lid IDs don't
      const jid = value.match(/^(\d+)@s\.whatsapp\.net$/);
      if (jid) return { handle: `+${jid[1]}`, kind: 'phone' };
      if (value.includes('@')) return { handle: `opaque:${value.toLowerCase()}`, kind: 'opaque' };
      const phone = toE164(value.startsWith('+') ? value : `+${value}`);
      return phone ? { handle: phone, kind: 'phone' } : { handle: `opaque:${value}`, kind: 'opaque' };
    }
    case 'instagram': {
      const username = normalizeInstagramUsername(value);
      return username ? { handle: username, kind: 'username' } : { handle: `opaque:${value}`, kind: 'opaque' };
    }
    case 'linkedin': {
      const url = normalizeLinkedInUrl(value);
      return url ? { handle: url, kind: 'url' } : { handle: `opaque:${value}`, kind: 'opaque' };
    }
  }
}

interface ContactIndex {
  byEmail: Map<string, number>;
  byPhone: Map<string, number>;
  /** Last digits → contact, only where no two contacts share them */
  byPhoneTail: Map<string, number | null>;
  byInstagram: Map<string, number>;
  byLinkedIn: Map<string, number>;
  /** Lowercased display name → contact, null when several contacts share it */
  byName: Map<string, number | null>;
}

function setUnique<K>(map: Map<K, number | null>, key: K, contactId: number): void {
  const existing = map.get(key);
  if (existing === undefined) map.set(key, contactId);
  else if (existing !== contactId) map.set(key, null);
}

/** Lookup tables over the active (non-archived) contacts' details. */
export function buildContactIndex(db: DatabaseType): ContactIndex {
  const index: ContactIndex = {
    byEmail: new Map(), byPhone: new Map(), byPhoneTail: new Map(),
    byInstagram: new Map(), byLinkedIn: new Map(), byName: new Map(),
  };

  const emails = db.prepare(`
    SELECT e.email, e.contact_id FROM contact_emails e
    JOIN contacts c ON c.id = e.contact_id WHERE c.archived_at IS NULL
  `).all() as Array<{ email: string; contact_id: number }>;
  for (const row of emails) {
    const email = row.email.trim().toLowerCase();
    if (!index.byEmail.has(email)) index.byEmail.set(email, row.contact_id);
  }

  const phones = db.prepare(`
    SELECT p.phone, p.contact_id FROM contact_phones p
    JOIN contacts c ON c.id = p.contact_id WHERE c.archived_at IS NULL
  `).all() as Array<{ phone: string; contact_id: number }>;
  for (const row of phones) {
    const phone = toE164(row.phone);
    if (!phone) continue;
    if (!index.byPhone.has(phone)) index.byPhone.set(phone, row.contact_id);
    const tail = phoneTail(phone);
    if (tail) setUnique(index.byPhoneTail, tail, row.contact_id);
  }

  const socials = db.prepare(`
    SELECT s.platform, s.username, s.profile_url, s.contact_id FROM contact_social_profiles s
    JOIN contacts c ON c.id = s.contact_id
    WHERE c.archived_at IS NULL AND lower(s.platform) IN ('instagram', 'linkedin')
  `).all() as Array<{ platform: string; username: string; profile_url: string | null; contact_id: number }>;
  for (const row of socials) {
    if (row.platform.toLowerCase() === 'instagram') {
      for (const value of [row.username, row.profile_url]) {
        const username = value ? normalizeInstagramUsername(value) : null;
        if (username && !index.byInstagram.has(username)) index.byInstagram.set(username, row.contact_id);
      }
    } else {
      for (const value of [row.profile_url, row.username]) {
        if (!value) continue;
        const url = normalizeLinkedInUrl(value) ?? normalizeLinkedInUrl(`linkedin.com/in/${value}`);
        if (url && !index.byLinkedIn.has(url)) index.byLinkedIn.set(url, row.contact_id);
      }
    }
  }

  const names = db.prepare(`
    SELECT id, display_name FROM contacts WHERE archived_at IS NULL AND display_name IS NOT NULL AND display_name != ''
  `).all() as Array<{ id: number; display_name: string }>;
  for (const row of names) setUnique(index.byName, nameKey(row.display_name), row.id);

  return index;
}

function nameKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

type AutoSource = 'auto_phone' | 'auto_email' | 'auto_profile';

/** The contact a handle belongs to by its phone, email or profile, if any. */
export function matchHandle(
  index: ContactIndex,
  handle: string,
  kind: HandleKind
): { contactId: number; source: AutoSource } | null {
  switch (kind) {
    case 'email': {
      const id = index.byEmail.get(handle);
      return id ? { contactId: id, source: 'auto_email' } : null;
    }
    case 'phone': {
      const exact = index.byPhone.get(handle);
      if (exact) return { contactId: exact, source: 'auto_phone' };
      const tail = phoneTail(handle);
      const byTail = tail ? index.byPhoneTail.get(tail) : undefined;
      return byTail ? { contactId: byTail, source: 'auto_phone' } : null;
    }
    case 'username': {
      const id = index.byInstagram.get(handle);
      return id ? { contactId: id, source: 'auto_profile' } : null;
    }
    case 'url': {
      const id = index.byLinkedIn.get(handle);
      return id ? { contactId: id, source: 'auto_profile' } : null;
    }
    case 'opaque':
      return null;
  }
}

/** A contact whose name is exactly the handle's display name, when exactly one has it. */
export function suggestByName(index: ContactIndex, displayName: string | null): number | null {
  if (!displayName) return null;
  return index.byName.get(nameKey(displayName)) ?? null;
}

interface HandleRow {
  channel: MessageChannel;
  handle: string;
  handle_kind: HandleKind;
  display_name: string | null;
  contact_id: number | null;
  match_source: string | null;
  suggested_contact_id: number | null;
}

/**
 * Re-match every handle the user hasn't decided on: automatic links follow
 * the contacts' current details (a removed number unlinks), manual links,
 * ignores and unlinks stay. Unmatched handles get a name suggestion.
 * Returns how many handles changed.
 */
export function autoMatchHandles(db: DatabaseType): number {
  const index = buildContactIndex(db);
  const rows = db.prepare(`
    SELECT channel, handle, handle_kind, display_name, contact_id, match_source, suggested_contact_id
    FROM message_handles
    WHERE match_source IS NULL OR match_source LIKE 'auto_%' OR (match_source = 'manual' AND contact_id IS NULL)
  `).all() as HandleRow[];

  const update = db.prepare(`
    UPDATE message_handles SET contact_id = ?, match_source = ?, suggested_contact_id = ?, updated_at = datetime('now')
    WHERE channel = ? AND handle = ?
  `);

  let changed = 0;
  db.transaction(() => {
    for (const row of rows) {
      const match = matchHandle(index, row.handle, row.handle_kind);
      const contactId = match?.contactId ?? null;
      const source = match?.source ?? null;
      const suggestion = match ? null : suggestByName(index, row.display_name);
      if (contactId === row.contact_id && source === row.match_source && suggestion === row.suggested_contact_id) continue;
      update.run(contactId, source, suggestion, row.channel, row.handle);
      changed++;
    }
  })();
  return changed;
}

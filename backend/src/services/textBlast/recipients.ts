import type { Database } from 'better-sqlite3';
import { parseCsv } from './csv.js';
import { normalizePhone } from './phone.js';
import { cleanText, normKey, renderTemplate } from './template.js';

export interface BuildInput {
  groups: string[];
  csv?: { name: string; text: string } | null;
  template: string;
  /** Region for numbers written without a +country code. */
  country: string;
  /** contactId → E.164: the number picked in the preview for contacts with several. */
  phoneOverrides?: Record<string, string>;
}

export interface PreviewRecipient {
  /** Stable across re-previews: `c<contactId>` for contacts, `r<csvRow>` for CSV-only rows. */
  key: string;
  contactId: number | null;
  name: string;
  source: 'group' | 'csv' | 'both';
  /** Spreadsheet row number (header is row 1), when the person came from the CSV. */
  csvRow: number | null;
  /** E.164 number or iMessage email; null when there's no usable number. */
  phone: string | null;
  /** A contact's usable numbers, for the number picker. */
  phones: { e164: string; label: string }[];
  text: string;
  isCustom: boolean;
  problems: string[];
  /** Placeholder values (normKey → value), kept so a blast can be re-rendered later. */
  values: Record<string, string>;
}

export interface BuildResult {
  recipients: PreviewRecipient[];
  /** Placeholder names available to the template. */
  fields: string[];
  csv: { name: string; rows: number; phoneColumn: string | null; overrideColumn: string | null } | null;
}

interface ContactRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  company: string | null;
  display_name: string | null;
}

interface PhoneRow {
  contact_id: number;
  phone: string;
  country_code: string | null;
  type: string | null;
  label: string | null;
  is_primary: number;
}

const CONTACT_FIELDS = ['first_name', 'last_name', 'nickname', 'company', 'full_name'];
const MOBILE_TYPES = /\b(cell|mobile|iphone)\b/i;

function contactValues(c: ContactRow): Record<string, string> {
  return {
    first_name: c.first_name ?? '',
    last_name: c.last_name ?? '',
    nickname: c.nickname ?? '',
    company: c.company ?? '',
    full_name: c.display_name ?? '',
  };
}

/** Run `fn` over `items` in chunks small enough for SQLite's bound-parameter limit. */
function inChunks<T, R>(items: T[], fn: (chunk: T[], placeholders: string) => R[]): R[] {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += 500) {
    const chunk = items.slice(i, i + 500);
    out.push(...fn(chunk, chunk.map(() => '?').join(',')));
  }
  return out;
}

function loadContacts(db: Database, ids: number[]): Map<number, ContactRow> {
  const rows = inChunks(ids, (chunk, ph) => db.prepare(`
    SELECT id, first_name, last_name, nickname, company, display_name
    FROM contacts WHERE id IN (${ph}) AND archived_at IS NULL
  `).all(...chunk) as ContactRow[]);
  return new Map(rows.map((r) => [r.id, r]));
}

/** Usable numbers per contact, normalised, best first: mobile, then primary, then stored order. */
function loadPhones(db: Database, ids: number[], country: string): Map<number, { e164: string; label: string }[]> {
  const rows = inChunks(ids, (chunk, ph) => db.prepare(`
    SELECT contact_id, phone, country_code, type, label, is_primary FROM contact_phones
    WHERE contact_id IN (${ph}) AND detail_archived_at IS NULL ORDER BY id
  `).all(...chunk) as PhoneRow[]);
  const rank = (p: PhoneRow) => (MOBILE_TYPES.test(`${p.type ?? ''} ${p.label ?? ''}`) ? 0 : p.is_primary ? 1 : 2);
  const byContact = new Map<number, { e164: string; label: string; rank: number }[]>();
  for (const p of rows) {
    const n = normalizePhone(p.phone, p.country_code || country);
    if (!('e164' in n)) continue;
    const list = byContact.get(p.contact_id) ?? [];
    if (list.some((x) => x.e164 === n.e164)) continue;
    list.push({ e164: n.e164, label: (p.label || p.type || 'phone').toLowerCase(), rank: rank(p) });
    byContact.set(p.contact_id, list);
  }
  const out = new Map<number, { e164: string; label: string }[]>();
  for (const [id, list] of byContact) {
    out.set(id, [...list].sort((a, b) => a.rank - b.rank).map(({ e164, label }) => ({ e164, label })));
  }
  return out;
}

/** Contacts (not archived) owning each of the given E.164 numbers. */
function contactsByNumber(db: Database, numbers: string[]): Map<string, number> {
  const rows = inChunks(numbers, (chunk, ph) => db.prepare(`
    SELECT cp.phone, cp.contact_id FROM contact_phones cp
    JOIN contacts c ON c.id = cp.contact_id
    WHERE cp.phone IN (${ph}) AND c.archived_at IS NULL AND cp.detail_archived_at IS NULL
    ORDER BY cp.contact_id
  `).all(...chunk) as { phone: string; contact_id: number }[]);
  const out = new Map<string, number>();
  for (const r of rows) if (!out.has(r.phone)) out.set(r.phone, r.contact_id);
  return out;
}

/**
 * Build the recipient list for a blast from Yello groups and/or a CSV: one row per person,
 * merged by number, each with the exact text they'd get and anything that holds them back.
 */
export function buildRecipients(db: Database, input: BuildInput): BuildResult {
  const overrides = input.phoneOverrides ?? {};
  const list: PreviewRecipient[] = [];
  const byContact = new Map<number, PreviewRecipient>();

  // 1. Group members
  const groups = [...new Set(input.groups.filter(Boolean))];
  const groupIds = groups.length
    ? inChunks(groups, (chunk, ph) => db.prepare(`
        SELECT DISTINCT cc.contact_id AS id FROM contact_categories cc
        JOIN contacts c ON c.id = cc.contact_id
        WHERE cc.category IN (${ph}) AND c.archived_at IS NULL
      `).all(...chunk) as { id: number }[]).map((r) => r.id)
    : [];

  // 2. CSV rows, and the contacts their numbers belong to
  const parsed = input.csv?.text ? parseCsv(input.csv.text) : null;
  const csvNumbers = parsed?.rows.map((row) =>
    parsed.phoneColumn ? normalizePhone(row[parsed.phoneColumn], input.country)
      : { problem: "no phone column (name one 'phone')" }) ?? [];
  const numberOwners = contactsByNumber(db,
    [...new Set(csvNumbers.flatMap((n) => ('e164' in n ? [n.e164] : [])))]);

  const allIds = [...new Set([...groupIds, ...numberOwners.values()])];
  const contacts = loadContacts(db, allIds);
  const phones = loadPhones(db, allIds, input.country);

  const contactRecipient = (id: number, source: 'group' | 'csv'): PreviewRecipient | null => {
    const c = contacts.get(id);
    if (!c) return null;
    const options = phones.get(id) ?? [];
    const picked = options.find((p) => p.e164 === overrides[String(id)]) ?? options[0];
    return {
      key: `c${id}`, contactId: id, name: c.display_name || [c.first_name, c.last_name].filter(Boolean).join(' '),
      source, csvRow: null, phone: picked?.e164 ?? null, phones: options, text: '', isCustom: false,
      problems: picked ? [] : ['no phone number'], values: contactValues(c),
    };
  };

  const sortedGroupIds = [...groupIds].sort((a, b) =>
    (contacts.get(a)?.display_name ?? '').localeCompare(contacts.get(b)?.display_name ?? ''));
  for (const id of sortedGroupIds) {
    const r = contactRecipient(id, 'group');
    if (r) { list.push(r); byContact.set(id, r); }
  }

  // 3. Merge CSV rows in
  const csvKeys = parsed ? parsed.header.map(normKey) : [];
  const overrideTexts = new Map<PreviewRecipient, string>();
  parsed?.rows.forEach((row, i) => {
    const csvRow = i + 2;
    const num = csvNumbers[i];
    const csvValues = Object.fromEntries(parsed.header.map((h) => [normKey(h), row[h] ?? '']));
    const ownerId = 'e164' in num ? numberOwners.get(num.e164) : undefined;
    let r = ownerId !== undefined ? byContact.get(ownerId) : undefined;

    if (r && r.csvRow === null) {
      // A group member (or a contact already reached by an earlier row): the CSV row adds its columns.
      r.source = r.source === 'group' ? 'both' : r.source;
      if ('e164' in num) r.phone = num.e164;
      r.problems = r.problems.filter((p) => p !== 'no phone number');
    } else {
      r = (ownerId !== undefined ? contactRecipient(ownerId, 'csv') : null) ?? {
        key: `r${csvRow}`, contactId: null, name: '', source: 'csv', csvRow: null, phone: null, phones: [],
        text: '', isCustom: false, problems: [], values: {},
      };
      if (r.contactId !== null && byContact.has(r.contactId)) r.key = `r${csvRow}`; // second row for one contact
      r.phone = 'e164' in num ? num.e164 : null;
      r.problems = 'problem' in num ? [num.problem] : [];
      list.push(r);
      if (r.contactId !== null && !byContact.has(r.contactId)) byContact.set(r.contactId, r);
    }
    r.csvRow = csvRow;
    // Non-empty CSV cells win over contact fields.
    for (const [k, v] of Object.entries(csvValues)) {
      if (v.trim() || !(k in r.values)) r.values[k] = v;
    }
    if (!r.name) {
      const v = r.values;
      r.name = [v.first_name || v.firstname || v.first || v.name || v.full_name, v.last_name || v.lastname || v.surname]
        .filter(Boolean).join(' ');
    }
    const custom = parsed.overrideColumn ? (row[parsed.overrideColumn] ?? '').trim() : '';
    if (custom) overrideTexts.set(r, custom);
  });

  // 4. Render texts and flag duplicates
  const fields = [...new Set([...(groupIds.length || numberOwners.size ? CONTACT_FIELDS : []), ...csvKeys])]
    .filter((k) => k !== (parsed?.overrideColumn ? normKey(parsed.overrideColumn) : ''));
  const seen = new Map<string, PreviewRecipient>();
  for (const r of list) {
    for (const k of fields) if (!(k in r.values)) r.values[k] = '';
    const custom = overrideTexts.get(r);
    const template = custom ?? input.template;
    r.isCustom = custom !== undefined;
    if (template.trim()) {
      const { text, problems } = renderTemplate(template, r.values);
      r.text = cleanText(text);
      r.problems.push(...problems);
      if (!r.text && !problems.length) r.problems.push('message is empty');
    } else {
      r.problems.push('no message yet: write the template');
    }
    if (r.phone) {
      const first = seen.get(r.phone);
      if (first) r.problems.push(`same number as ${first.csvRow ? `row ${first.csvRow}` : first.name || 'another person'}`);
      else seen.set(r.phone, r);
    }
  }

  return {
    recipients: list,
    fields,
    csv: parsed && input.csv
      ? { name: input.csv.name, rows: parsed.rows.length, phoneColumn: parsed.phoneColumn, overrideColumn: parsed.overrideColumn }
      : null,
  };
}

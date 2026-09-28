/**
 * Compares a user's archived original vCards (written when raw_vcard was
 * retired) with what the database exports today, and counts every value of
 * an original card that the database no longer holds.
 *
 *   npx tsx scripts/checkVcardResidual.ts <userId> [archive.vcf.gz]
 *
 * USER_DATA_PATH defaults to ./data/users. The database is opened read-only.
 *
 * A non-zero count is not necessarily a loss: edits and cleanups made in the
 * app (removed URLs, normalised addresses, cleaned notes) show up here too.
 * It is the tool for telling the two apart — see docs/database.md.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import Database from 'better-sqlite3';
import { exportContactsAsVcf } from '../src/services/vcardExportService.js';
import { parseSingleVcard, parseVcf, type ParsedContact } from '../src/services/vcardParser.js';

const userId = Number(process.argv[2]);
if (!Number.isInteger(userId)) {
  console.error('usage: npx tsx scripts/checkVcardResidual.ts <userId> [archive.vcf.gz]');
  process.exit(1);
}

const userDir = path.join(process.env.USER_DATA_PATH ?? './data/users', String(userId));
const archiveDir = path.join(userDir, 'archive');
const archivePath = process.argv[3] ?? (fs.existsSync(archiveDir)
  ? path.join(archiveDir, fs.readdirSync(archiveDir).filter(f => f.startsWith('original-cards-')).sort().at(-1) ?? '')
  : '');
if (!archivePath || !fs.existsSync(archivePath)) {
  console.error(`no archive of original cards found in ${archiveDir}`);
  process.exit(1);
}

const db = new Database(path.join(userDir, 'contacts.db'), { readonly: true });

// Current state of every contact, archived ones included, keyed by id
const current = new Map<number, ParsedContact>();
for (const archived of [false, true]) {
  const ids = (db.prepare(`
    SELECT id FROM contacts WHERE archived_at IS ${archived ? 'NOT NULL' : 'NULL'}
    ORDER BY ${archived ? 'archived_at DESC, id' : 'id'}
  `).all() as Array<{ id: number }>).map(row => row.id);
  const exported = parseVcf(exportContactsAsVcf(db, () => null, { archived })).contacts;
  ids.forEach((id, i) => current.set(id, exported[i]));
}

const lower = (value: unknown) => JSON.stringify(value ?? null).toLowerCase();
const counts: Record<string, number> = {};
const examples: Record<string, string> = {};
const miss = (key: string, example: string) => {
  counts[key] = (counts[key] ?? 0) + 1;
  examples[key] ??= example;
};

type Entry = Record<string, unknown>;
function compareRows(key: string, original: Entry[], now: Entry[], fields: string[], same: (a: Entry, b: Entry) => boolean) {
  for (const entry of original) {
    const matches = now.filter(row => same(entry, row));
    if (matches.length === 0) {
      miss(`${key} row`, JSON.stringify(entry).slice(0, 120));
      continue;
    }
    for (const field of fields) {
      if (entry[field] && !matches.some(row => lower(row[field]) === lower(entry[field]))) {
        miss(`${key}.${field}`, `${JSON.stringify(entry[field])} -> ${JSON.stringify(matches.map(row => row[field]))}`);
      }
    }
  }
}

const text = zlib.gunzipSync(fs.readFileSync(archivePath)).toString('utf-8');
const cards = text.split(/(?=BEGIN:VCARD\r?\nX-YELLO-CONTACT-ID:)/).filter(card => card.trim());
let compared = 0;
for (const card of cards) {
  const id = Number(card.match(/X-YELLO-CONTACT-ID:(\d+)/)?.[1]);
  const now = current.get(id);
  if (!now) {
    miss('contact deleted since', String(id));
    continue;
  }
  let original: ParsedContact | null;
  try {
    original = parseSingleVcard(card);
  } catch {
    miss('unparseable original', String(id));
    continue;
  }
  if (!original) continue;
  compared++;

  for (const field of ['middleName', 'namePrefix', 'nameSuffix', 'nickname', 'gender', 'department',
    'title', 'notes', 'birthday', 'company', 'vcardParams'] as const) {
    if (original[field] && lower(original[field]) !== lower(now[field])) {
      miss(field, `${JSON.stringify(original[field]).slice(0, 60)} -> ${JSON.stringify(now[field]).slice(0, 60)}`);
    }
  }
  const e = (x: unknown) => x as Entry[];
  compareRows('email', e(original.emails), e(now.emails), ['label', 'extraTypes', 'params'], (a, b) => lower(a.email) === lower(b.email));
  compareRows('phone', e(original.phones), e(now.phones), ['label', 'extraTypes', 'params'], (a, b) => a.phone === b.phone);
  compareRows('address', e(original.addresses), e(now.addresses), ['label', 'params', 'countryCode', 'poBox'],
    (a, b) => lower(a.street) === lower(b.street) && lower(a.city) === lower(b.city));
  compareRows('url', e(original.urls), e(now.urls), ['label', 'params'], (a, b) => a.url === b.url);
  compareRows('impp', e(original.instantMessages), e(now.instantMessages), ['params'], (a, b) => a.handle === b.handle);
  compareRows('social', e(original.socialProfiles), e(now.socialProfiles), ['params'], (a, b) => a.url === b.url);
  compareRows('related', e(original.relatedPeople), e(now.relatedPeople), ['params'], (a, b) => lower(a.name) === lower(b.name));
  compareRows('date', e(original.dates ?? []), e(now.dates ?? []), ['label', 'params'], (a, b) => a.date === b.date);
  for (const category of original.categories) {
    if (!now.categories.some(c => lower(c) === lower(category))) miss('category', category);
  }
  for (const property of original.extraProperties ?? []) {
    const kept = (now.extraProperties ?? []).some(p =>
      p.name === property.name && p.value === property.value && lower(p.params) === lower(property.params));
    if (!kept) miss(`generic ${property.name}`, property.value.slice(0, 60));
  }
}

console.log(`${archivePath}: ${cards.length} original cards, ${compared} compared`);
for (const [key, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`${String(count).padStart(7)}  ${key.padEnd(24)} e.g. ${examples[key]}`);
}
if (Object.keys(counts).length === 0) console.log('nothing from the original cards is missing');

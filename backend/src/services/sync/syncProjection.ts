import crypto from 'crypto';
import { activeOnly } from '../archivedDetails.js';
import type { ContactForVcard } from '../vcardGenerator.js';
import type { ParsedContact } from '../vcardParser.js';
import type { SyncProvider } from './syncState.js';

/**
 * The canonical, provider-specific view of a contact that sync compares.
 *
 * A contact changed on one side when its projection no longer hashes to what
 * it hashed to at the last sync. Only fields the provider can hold are in its
 * projection, and every value is normalised (case, whitespace, phone format,
 * type vocabulary, order of multi-value lists) so that a server reformatting a
 * card, or the lossy trip through Google's fields, is not mistaken for an
 * edit. contacts.updated_at is not used: many writers never bump it.
 */

export interface ProjectedName {
  display: string | null;
  first: string | null;
  last: string | null;
  middle: string | null;
  prefix: string | null;
  suffix: string | null;
}

export interface SyncProjection {
  name: ProjectedName;
  nickname: string | null;
  org: { company: string | null; title: string | null; department: string | null };
  notes: string | null;
  birthday: string | null;
  gender: string | null;
  isCompany: boolean;
  emails: Array<{ value: string; type: string | null }>;
  phones: Array<{ value: string; type: string | null }>;
  addresses: Array<{
    street: string | null; extended: string | null; poBox: string | null; city: string | null;
    region: string | null; postalCode: string | null; country: string | null; type: string | null;
  }>;
  urls: Array<{ value: string; type: string | null }>;
  socials: Array<{ platform: string; value: string }>;
  ims: Array<{ service: string; handle: string }>;
  related: Array<{ name: string; relation: string | null }>;
  dates: Array<{ date: string; label: string | null }>;
  categories: string[];
}

/** The field families sync diffs and merges one at a time. */
export const SYNC_FIELDS = [
  'name', 'nickname', 'org', 'notes', 'birthday', 'gender', 'isCompany',
  'emails', 'phones', 'addresses', 'urls', 'socials', 'ims', 'related', 'dates', 'categories'
] as const;
export type SyncField = typeof SYNC_FIELDS[number];

export const MULTI_VALUE_FIELDS = new Set<SyncField>(['emails', 'phones', 'addresses', 'urls', 'socials', 'ims', 'related', 'dates', 'categories']);

// ─── Normalisers ────────────────────────────────────────────────────────────

function text(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
  return trimmed === '' ? null : trimmed;
}

function lower(value: string | null | undefined): string | null {
  return text(value)?.toLowerCase() ?? null;
}

/** Apple's built-in labels look like `_$!<Mobile>!$_`; this returns `mobile`. */
export function appleLabelName(label: string | null | undefined): string | null {
  const match = label?.match(/^_\$!<(.+)>!\$_$/);
  return match ? match[1].toLowerCase() : null;
}

/** `+1 (212) 555-0101` and `+12125550101` are the same number. */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/** Apple writes a birthday without a year as 1604-MM-DD (X-APPLE-OMIT-YEAR). */
export function normalizeDate(value: string | null | undefined): string | null {
  const date = text(value);
  if (!date) return null;
  const omitted = date.match(/^1604-?(\d{2})-?(\d{2})/);
  if (omitted) return `--${omitted[1]}-${omitted[2]}`;
  const full = date.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (full) return `${full[1]}-${full[2]}-${full[3]}`;
  const noYear = date.match(/^--(\d{2})-?(\d{2})/);
  if (noYear) return `--${noYear[1]}-${noYear[2]}`;
  return date;
}

const IGNORED_TYPES = new Set(['pref', 'internet', 'voice', 'x400', 'x-internet']);

interface TypedInput {
  type?: string | null;
  extraTypes?: string | null;
  label?: string | null;
}

function typeSet(entry: TypedInput): Set<string> {
  return new Set(
    [entry.type, ...(entry.extraTypes ?? '').split(',')]
      .map(t => t?.trim().toLowerCase())
      .filter((t): t is string => !!t && !IGNORED_TYPES.has(t))
  );
}

/** A custom label wins over TYPE; Apple's built-in labels map back to a type. */
function labelType(entry: TypedInput, builtIns: Record<string, string>): string | null | undefined {
  if (!entry.label) return undefined;
  const builtIn = appleLabelName(entry.label);
  if (builtIn) return builtIns[builtIn] ?? builtIn;
  return `label:${entry.label.trim().toLowerCase()}`;
}

const EMAIL_LABELS: Record<string, string> = { home: 'home', work: 'work', other: 'other' };
function emailType(entry: TypedInput): string | null {
  const fromLabel = labelType(entry, EMAIL_LABELS);
  if (fromLabel !== undefined) return fromLabel;
  const types = typeSet(entry);
  for (const t of ['home', 'work', 'other']) if (types.has(t)) return t;
  return types.size ? [...types].sort()[0] : null;
}

const PHONE_LABELS: Record<string, string> = {
  mobile: 'cell', iphone: 'iphone', home: 'home', work: 'work', main: 'main', other: 'other',
  homefax: 'fax', workfax: 'fax', otherfax: 'fax', pager: 'pager'
};
function phoneType(entry: TypedInput, provider: SyncProvider): string | null {
  const fromLabel = labelType(entry, PHONE_LABELS);
  const resolved = fromLabel !== undefined ? fromLabel : (() => {
    const types = typeSet(entry);
    if (types.has('fax')) return 'fax';
    if (types.has('iphone')) return 'iphone';
    if (types.has('cell') || types.has('mobile')) return 'cell';
    for (const t of ['main', 'pager', 'home', 'work', 'other']) if (types.has(t)) return t;
    return types.size ? [...types].sort()[0] : null;
  })();
  // Google has no iPhone type; a pushed iPhone number comes back as mobile.
  return provider === 'google' && resolved === 'iphone' ? 'cell' : resolved;
}

const ADDRESS_LABELS: Record<string, string> = { home: 'home', work: 'work', other: 'other' };
function addressType(entry: TypedInput): string | null {
  const fromLabel = labelType(entry, ADDRESS_LABELS);
  if (fromLabel !== undefined) return fromLabel;
  const types = typeSet(entry);
  for (const t of ['home', 'work', 'other']) if (types.has(t)) return t;
  return null;
}

const URL_LABELS: Record<string, string> = { homepage: 'homepage', home: 'home', work: 'work', other: 'other' };
function urlType(entry: TypedInput): string | null {
  const fromLabel = labelType(entry, URL_LABELS);
  if (fromLabel !== undefined) return fromLabel;
  const types = typeSet(entry);
  return types.size ? [...types].sort()[0] : null;
}

function relationName(value: string | null | undefined): string | null {
  return appleLabelName(value) ?? lower(value);
}

function sortUnique<T>(items: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const item of items) byKey.set(JSON.stringify(item), item);
  return [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, item]) => item);
}

// ─── Projection ─────────────────────────────────────────────────────────────

/** URL of a social profile, built from the username when only that is known. */
function socialUrl(profile: { platform: string; username: string | null; profileUrl: string | null }): string | null {
  return text(profile.profileUrl) ?? (profile.username ? `${profile.platform.toLowerCase()}:${profile.username}` : null);
}

/**
 * Projects a contact for a provider. Google holds neither categories (labels
 * are left alone) nor the company flag, and has no social-profile field:
 * Yello sends social profiles as typed URLs, so they project as URLs there.
 */
export function projectContact(contact: ContactForVcard, provider: SyncProvider): SyncProjection {
  // Archived details are never synced, so they are no part of what is compared.
  // Google gets only the profiles that have a URL (see contactDataToPerson).
  const socials = activeOnly(contact.socialProfiles)
    .filter(profile => provider !== 'google' || text(profile.profileUrl))
    .map(profile => ({ platform: profile.platform.trim().toLowerCase(), value: socialUrl(profile) }))
    .filter((s): s is { platform: string; value: string } => !!s.value)
    .map(s => ({ platform: s.platform, value: s.value.toLowerCase().replace(/\/+$/, '') }));

  const urls = activeOnly(contact.urls ?? [])
    .map(u => ({ value: text(u.url)?.toLowerCase().replace(/\/+$/, '') ?? '', type: urlType(u) }))
    .filter(u => u.value);

  const projection: SyncProjection = {
    name: {
      display: provider === 'icloud' ? text(contact.displayName) : null,
      first: text(contact.firstName),
      last: text(contact.lastName),
      middle: text(contact.middleName),
      prefix: text(contact.namePrefix),
      suffix: text(contact.nameSuffix)
    },
    nickname: text(contact.nickname),
    org: { company: text(contact.company), title: text(contact.title), department: text(contact.department) },
    notes: text(contact.notes),
    birthday: normalizeDate(contact.birthday),
    gender: lower(contact.gender),
    isCompany: provider === 'icloud' ? !!contact.isCompany : false,
    emails: sortUnique(activeOnly(contact.emails)
      .map(e => ({ value: e.email.trim().toLowerCase(), type: emailType(e) }))
      .filter(e => e.value)),
    phones: sortUnique(activeOnly(contact.phones)
      .map(p => ({ value: normalizePhone(p.phone), type: phoneType(p, provider) }))
      .filter(p => p.value)),
    addresses: sortUnique(activeOnly(contact.addresses).map(a => ({
      street: text(a.street), extended: text(a.extended), poBox: text(a.poBox), city: text(a.city),
      region: text(a.state), postalCode: text(a.postalCode), country: text(a.country), type: addressType(a)
    })).filter(a => a.street || a.city || a.region || a.postalCode || a.country || a.poBox)),
    urls: sortUnique(provider === 'google'
      ? [...urls, ...socials.map(s => ({ value: s.value, type: s.platform }))]
      : urls),
    socials: provider === 'google' ? [] : sortUnique(socials),
    ims: sortUnique(activeOnly(contact.instantMessages ?? [])
      .map(im => ({ service: im.service.trim().toLowerCase(), handle: im.handle.trim().toLowerCase() }))
      .filter(im => im.handle)),
    related: sortUnique((contact.relatedPeople ?? [])
      .map(r => ({ name: text(r.name) ?? '', relation: relationName(r.relationship) }))
      .filter(r => r.name)),
    dates: sortUnique((contact.dates ?? [])
      .map(d => ({ date: normalizeDate(d.date) ?? '', label: relationName(d.label) }))
      .filter(d => d.date)),
    categories: provider === 'google' ? [] : sortUnique(contact.categories.map(c => c.trim()).filter(Boolean))
  };
  return projection;
}

export function hashProjection(projection: SyncProjection): string {
  return crypto.createHash('sha256').update(JSON.stringify(projection)).digest('hex');
}

/** The families whose values differ between two projections. */
export function diffProjections(a: SyncProjection, b: SyncProjection): SyncField[] {
  return SYNC_FIELDS.filter(field => JSON.stringify(a[field]) !== JSON.stringify(b[field]));
}

/** What identifies an entry of a multi-value family, ignoring its type/label. */
export function entryKey(field: SyncField, entry: unknown): string {
  const e = entry as Record<string, string | null>;
  switch (field) {
    case 'emails':
    case 'phones':
    case 'urls': return String(e.value);
    case 'addresses': return [e.street, e.city, e.postalCode].map(v => (v ?? '').toLowerCase()).join('|');
    case 'socials': return `${e.platform}:${e.value}`;
    case 'ims': return `${e.service}:${e.handle}`;
    case 'related': return String(e.name).toLowerCase();
    case 'dates': return `${e.date}|${e.label ?? ''}`;
    case 'categories': return String(entry).toLowerCase();
    default: return JSON.stringify(entry);
  }
}

/** Entries of `incoming[field]` that `base[field]` lacks (by entryKey). */
export function entriesMissingFrom(field: SyncField, base: SyncProjection, incoming: SyncProjection): unknown[] {
  const have = new Set((base[field] as unknown[]).map(entry => entryKey(field, entry)));
  return (incoming[field] as unknown[]).filter(entry => !have.has(entryKey(field, entry)));
}

/** True when a family holds nothing (empty list, null scalar, all-null object). */
export function isEmptyField(projection: SyncProjection, field: SyncField): boolean {
  const value = projection[field];
  if (Array.isArray(value)) return value.length === 0;
  if (value === null || value === false) return true;
  if (typeof value === 'object') return Object.values(value).every(v => v === null);
  return false;
}

// ─── Adapters ───────────────────────────────────────────────────────────────

/** A parsed remote card in the shape projectContact and generateVcard take. */
export function parsedToContactData(contact: ParsedContact): ContactForVcard {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    displayName: contact.displayName,
    company: contact.company,
    title: contact.title,
    notes: contact.notes,
    birthday: contact.birthday,
    middleName: contact.middleName ?? null,
    namePrefix: contact.namePrefix ?? null,
    nameSuffix: contact.nameSuffix ?? null,
    nickname: contact.nickname ?? null,
    gender: contact.gender ?? null,
    department: contact.department ?? null,
    isCompany: !!contact.isCompany,
    uid: contact.uid,
    emails: contact.emails.map(e => ({ ...e, isPrimary: !!e.isPrimary })),
    phones: contact.phones.map(p => ({ ...p, phoneDisplay: p.phoneDisplay ?? p.phone, isPrimary: !!p.isPrimary })),
    addresses: contact.addresses,
    socialProfiles: contact.socialProfiles.map(s => ({
      platform: s.platform, username: s.username, profileUrl: s.url, params: s.params, archivedAt: s.archivedAt ?? null
    })),
    categories: contact.categories,
    urls: contact.urls,
    instantMessages: contact.instantMessages,
    relatedPeople: contact.relatedPeople,
    dates: contact.dates ?? [],
    extraProperties: contact.extraProperties ?? [],
    vcardParams: contact.vcardParams ?? null,
    ...(contact.photoBase64 ? { photoBase64: contact.photoBase64 } : {})
  };
}

/** Contact data back in the parser's shape (for matching and for writing into Yello). */
export function contactDataToParsed(data: ContactForVcard): ParsedContact {
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    displayName: data.displayName,
    company: data.company,
    title: data.title,
    notes: data.notes,
    birthday: data.birthday,
    middleName: data.middleName ?? null,
    namePrefix: data.namePrefix ?? null,
    nameSuffix: data.nameSuffix ?? null,
    nickname: data.nickname ?? null,
    gender: data.gender ?? null,
    department: data.department ?? null,
    isCompany: !!data.isCompany,
    emails: data.emails.map(e => ({
      email: e.email, type: e.type, extraTypes: e.extraTypes ?? null, label: e.label ?? null,
      params: e.params ?? null, isPrimary: e.isPrimary, archivedAt: e.archivedAt ?? null
    })),
    phones: data.phones.map(p => ({
      phone: normalizePhone(p.phone) || p.phone, phoneDisplay: p.phoneDisplay, countryCode: null, type: p.type,
      extraTypes: p.extraTypes ?? null, label: p.label ?? null, params: p.params ?? null, isPrimary: p.isPrimary,
      archivedAt: p.archivedAt ?? null
    })),
    addresses: data.addresses.map(a => ({
      street: a.street, city: a.city, state: a.state, postalCode: a.postalCode, country: a.country,
      type: a.type, extraTypes: a.extraTypes ?? null, label: a.label ?? null, poBox: a.poBox ?? null,
      extended: a.extended ?? null, sublocality: a.sublocality ?? null,
      subadministrativeArea: a.subadministrativeArea ?? null, countryCode: a.countryCode ?? null,
      params: a.params ?? null, latitude: a.latitude ?? null, longitude: a.longitude ?? null,
      archivedAt: a.archivedAt ?? null
    })),
    categories: data.categories,
    instantMessages: (data.instantMessages ?? []).map(im => ({ ...im })),
    urls: (data.urls ?? []).map(u => ({ ...u })),
    relatedPeople: (data.relatedPeople ?? []).map(r => ({ ...r })),
    socialProfiles: data.socialProfiles
      .filter(s => s.profileUrl || s.username)
      .map(s => ({ platform: s.platform, username: s.username, url: s.profileUrl ?? '', params: s.params ?? null, archivedAt: s.archivedAt ?? null })),
    dates: data.dates ?? [],
    photoBase64: data.photoBase64 ?? null,
    rawVcard: '',
    uid: data.uid ?? null
  };
}

/**
 * The three-way, per-family merge both sync engines use. `baseRemote` /
 * `baseLocal` are the projections stored at the last sync. A family changed
 * only on the remote side is taken; one changed on both sides to different
 * values is a conflict, which Yello wins.
 *
 * Without a local snapshot, the remote snapshot stands in for it; without
 * either, every difference counts as changed on both sides (Yello wins).
 */
export function planFieldMerge(
  baseRemote: SyncProjection | null,
  baseLocal: SyncProjection | null,
  local: SyncProjection,
  remote: SyncProjection
): { take: SyncField[]; conflicts: SyncField[] } {
  const localBase = baseLocal ?? baseRemote;
  const remoteChanged = diffProjections(baseRemote ?? local, remote);
  const localChanged = localBase ? diffProjections(localBase, local) : remoteChanged;
  return {
    take: remoteChanged.filter(f => !localChanged.includes(f)),
    conflicts: remoteChanged.filter(f => localChanged.includes(f) && JSON.stringify(local[f]) !== JSON.stringify(remote[f]))
  };
}

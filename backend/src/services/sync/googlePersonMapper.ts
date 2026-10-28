import type { ContactForVcard } from '../vcardGenerator.js';
import { activeOnly } from '../archivedDetails.js';
import { appleLabelName } from './syncProjection.js';
import type { GooglePersonRaw } from './googlePeople.js';

/**
 * Google People API Person ↔ Yello contact data (the generateVcard shape).
 *
 * Both directions use the same type tables, so a contact pushed to Google and
 * read back projects to the same hash. Fields Google has no home for (Apple
 * labels it cannot store, categories, the company flag) are left out of what
 * Yello writes, and `memberships` (Google labels) are never written at all.
 */

/** clientData key under which Yello stores its contact UID on a Google contact. */
export const YELLO_UID_CLIENT_KEY = 'yelloUid';

/** Every field Yello writes; used as updatePersonFields / readMask. */
export const MAPPED_PERSON_FIELDS = [
  'names', 'nicknames', 'organizations', 'biographies', 'birthdays', 'genders', 'emailAddresses',
  'phoneNumbers', 'addresses', 'urls', 'imClients', 'relations', 'events', 'clientData'
] as const;

// ─── Type tables ────────────────────────────────────────────────────────────

/** Google type → vCard TYPE values (comma-separated). */
const EMAIL_FROM_GOOGLE: Record<string, string> = { home: 'home', work: 'work', other: 'other' };
const PHONE_FROM_GOOGLE: Record<string, string> = {
  home: 'home', work: 'work', mobile: 'cell', main: 'main', homeFax: 'home,fax', workFax: 'work,fax',
  otherFax: 'fax', pager: 'pager', workMobile: 'work,cell', workPager: 'work,pager', other: 'other',
  googleVoice: 'other'
};
const ADDRESS_FROM_GOOGLE: Record<string, string> = { home: 'home', work: 'work', other: 'other' };
const URL_FROM_GOOGLE: Record<string, string> = {
  homePage: 'homepage', home: 'home', work: 'work', blog: 'blog', profile: 'profile', other: 'other'
};

/** Social platforms Yello sends as typed URLs; recognised again on the way back. */
const SOCIAL_HOSTS: Record<string, string> = {
  'twitter.com': 'twitter', 'x.com': 'twitter', 'linkedin.com': 'linkedin', 'facebook.com': 'facebook',
  'instagram.com': 'instagram', 'github.com': 'github', 'mastodon.social': 'mastodon',
  'youtube.com': 'youtube', 'tiktok.com': 'tiktok', 'threads.net': 'threads', 'bsky.app': 'bluesky'
};
const SOCIAL_PLATFORMS = new Set(Object.values(SOCIAL_HOSTS));

interface Typed {
  type: string | null;
  extraTypes: string | null;
  label: string | null;
}

function fromGoogleType(type: string | undefined, formattedType: string | undefined, table: Record<string, string>): Typed {
  if (!type) return { type: null, extraTypes: null, label: null };
  const mapped = table[type];
  if (!mapped) return { type: null, extraTypes: null, label: formattedType || type };
  const [first, ...rest] = mapped.split(',');
  return { type: first, extraTypes: rest.length ? rest.join(',') : null, label: null };
}

function types(entry: { type?: string | null; extraTypes?: string | null }): Set<string> {
  return new Set([entry.type, ...(entry.extraTypes ?? '').split(',')]
    .map(t => t?.trim().toLowerCase())
    .filter((t): t is string => !!t && t !== 'pref' && t !== 'internet' && t !== 'voice'));
}

/** A custom (non-Apple) label is sent to Google as a custom type. */
function customLabel(label: string | null | undefined): string | null {
  return label && !appleLabelName(label) ? label : null;
}

function emailToGoogle(entry: { type?: string | null; extraTypes?: string | null; label?: string | null }): string | undefined {
  const custom = customLabel(entry.label);
  if (custom) return custom;
  const builtIn = appleLabelName(entry.label);
  const t = types(entry);
  for (const candidate of ['home', 'work', 'other']) if (builtIn === candidate || t.has(candidate)) return candidate;
  return undefined;
}

function phoneToGoogle(entry: { type?: string | null; extraTypes?: string | null; label?: string | null }): string | undefined {
  const custom = customLabel(entry.label);
  if (custom) return custom;
  const builtIn = appleLabelName(entry.label);
  const t = types(entry);
  if (builtIn === 'homefax' || (t.has('fax') && t.has('home'))) return 'homeFax';
  if (builtIn === 'workfax' || (t.has('fax') && t.has('work'))) return 'workFax';
  if (builtIn === 'otherfax' || t.has('fax')) return 'otherFax';
  if (t.has('work') && t.has('cell')) return 'workMobile';
  if (builtIn === 'mobile' || builtIn === 'iphone' || t.has('cell') || t.has('iphone') || t.has('mobile')) return 'mobile';
  if (builtIn === 'main' || t.has('main')) return 'main';
  if (builtIn === 'pager' || t.has('pager')) return 'pager';
  for (const candidate of ['home', 'work', 'other']) if (builtIn === candidate || t.has(candidate)) return candidate;
  return undefined;
}

function addressToGoogle(entry: { type?: string | null; extraTypes?: string | null; label?: string | null }): string | undefined {
  return emailToGoogle(entry);
}

function urlToGoogle(entry: { type?: string | null; label?: string | null }): string | undefined {
  const custom = customLabel(entry.label);
  if (custom) return custom;
  const builtIn = appleLabelName(entry.label);
  const t = (entry.type ?? '').toLowerCase();
  if (builtIn === 'homepage' || t === 'homepage') return 'homePage';
  if (t === 'home' || t === 'work' || t === 'blog' || t === 'profile' || t === 'other') return t;
  return t || undefined;
}

/** Apple relation / date labels become Google's plain words (`_$!<Spouse>!$_` → spouse). */
function plainLabel(label: string | null | undefined): string | undefined {
  return appleLabelName(label) ?? (label?.trim() || undefined);
}

// ─── Dates ──────────────────────────────────────────────────────────────────

interface GoogleDate { year?: number; month?: number; day?: number }

function dateToGoogle(value: string | null | undefined): GoogleDate | null {
  if (!value) return null;
  const full = value.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (full) {
    const year = Number(full[1]);
    // 1604 is Apple's "no year" marker.
    return { ...(year === 1604 ? {} : { year }), month: Number(full[2]), day: Number(full[3]) };
  }
  const noYear = value.match(/^--(\d{2})-?(\d{2})/);
  return noYear ? { month: Number(noYear[1]), day: Number(noYear[2]) } : null;
}

function dateFromGoogle(date: GoogleDate | undefined): string | null {
  if (!date?.month || !date?.day) return null;
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return date.year ? `${String(date.year).padStart(4, '0')}-${mm}-${dd}` : `--${mm}-${dd}`;
}

// ─── Person → contact ───────────────────────────────────────────────────────

interface FieldWithSource { metadata?: { source?: { type?: string } } }

/**
 * Keeps the values that belong to the contact card itself. A Person also
 * carries values from the person's own Google profile, which cannot be
 * edited and must not be pulled into Yello as if the user had typed them.
 */
function contactValues<T extends FieldWithSource>(values: T[] | undefined, allSources: boolean): T[] {
  if (!values) return [];
  if (allSources) return values;
  return values.filter(v => !v.metadata?.source?.type || v.metadata.source.type === 'CONTACT');
}

function socialPlatformOf(url: string, type: string | undefined): string | null {
  if (type && SOCIAL_PLATFORMS.has(type.toLowerCase())) return type.toLowerCase();
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return SOCIAL_HOSTS[host] ?? null;
  } catch {
    return null;
  }
}

export interface PersonToContactOptions {
  /** Contact-group resource name → label name, for categories (backups only). */
  groupNames?: Map<string, string>;
  /** Include values from the person's Google profile too (backups only). */
  allSources?: boolean;
  /** Recognise social profiles among the URLs (sync); a backup keeps plain URLs. */
  socialsFromUrls?: boolean;
  photoBase64?: string | null;
}

export function personToContactData(person: GooglePersonRaw, options: PersonToContactOptions = {}): ContactForVcard {
  const all = !!options.allSources;
  const name = contactValues(person.names as Array<NonNullable<GooglePersonRaw['names']>[number] & FieldWithSource>, all)[0];
  const org = contactValues(person.organizations, all)[0];
  const emails = contactValues(person.emailAddresses, all).filter(e => e.value);
  const firstName = name?.givenName || null;
  const lastName = name?.familyName || null;
  const displayName = name?.displayName
    || [firstName, lastName].filter(Boolean).join(' ')
    || org?.name
    || emails[0]?.value
    || 'Unknown';

  const urls: NonNullable<ContactForVcard['urls']> = [];
  const socialProfiles: ContactForVcard['socialProfiles'] = [];
  for (const u of (person.urls ?? []).filter(u => u.value)) {
    const platform = options.socialsFromUrls ? socialPlatformOf(u.value!, u.type) : null;
    if (platform) {
      const username = u.value!.replace(/\/+$/, '').split('/').pop() || null;
      socialProfiles.push({ platform, username, profileUrl: u.value! });
    } else {
      const t = fromGoogleType(u.type, u.formattedType, URL_FROM_GOOGLE);
      urls.push({ url: u.value!, type: t.type, label: t.label });
    }
  }

  const categories = options.groupNames
    ? (person.memberships ?? [])
      .map(m => m.contactGroupMembership?.contactGroupResourceName)
      .map(resource => (resource ? options.groupNames!.get(resource) : undefined))
      .filter((group): group is string => !!group)
    : [];

  const clientUid = (person.clientData as Array<{ key?: string; value?: string }> | undefined)
    ?.find(entry => entry.key === YELLO_UID_CLIENT_KEY)?.value ?? null;

  return {
    firstName,
    lastName,
    displayName,
    middleName: name?.middleName || null,
    namePrefix: name?.honorificPrefix || null,
    nameSuffix: name?.honorificSuffix || null,
    nickname: person.nicknames?.[0]?.value || null,
    company: org?.name || null,
    title: org?.title || null,
    department: org?.department || null,
    notes: person.biographies?.[0]?.value || null,
    birthday: dateFromGoogle(person.birthdays?.[0]?.date),
    gender: person.genders?.[0]?.value || null,
    emails: emails.map((e, i) => ({
      email: e.value!,
      isPrimary: e.metadata?.primary ?? i === 0,
      ...fromGoogleType(e.type, e.formattedType, EMAIL_FROM_GOOGLE)
    })),
    phones: contactValues(person.phoneNumbers, all).filter(p => p.value).map((p, i) => ({
      phone: p.canonicalForm || p.value!,
      phoneDisplay: p.value!,
      isPrimary: p.metadata?.primary ?? i === 0,
      ...fromGoogleType(p.type, p.formattedType, PHONE_FROM_GOOGLE)
    })),
    addresses: (person.addresses ?? []).map(a => ({
      street: a.streetAddress || null,
      extended: a.extendedAddress || null,
      poBox: a.poBox || null,
      city: a.city || null,
      state: a.region || null,
      postalCode: a.postalCode || null,
      country: a.country || null,
      countryCode: a.countryCode || null,
      ...fromGoogleType(a.type, a.formattedType, ADDRESS_FROM_GOOGLE)
    })),
    urls,
    socialProfiles,
    instantMessages: (person.imClients ?? []).filter(im => im.username).map(im => ({
      service: im.formattedProtocol || im.protocol || 'other',
      handle: im.username!,
      type: null
    })),
    relatedPeople: (person.relations ?? []).filter(r => r.person).map(r => ({
      name: r.person!,
      relationship: r.formattedType || r.type || null
    })),
    dates: (person.events ?? [])
      .map(e => ({ date: dateFromGoogle(e.date), label: e.formattedType || e.type || null }))
      .filter((d): d is { date: string; label: string | null } => d.date !== null),
    categories: [...new Set(categories)],
    uid: clientUid,
    ...(options.photoBase64 ? { photoBase64: options.photoBase64 } : {})
  };
}

// ─── Contact → Person ───────────────────────────────────────────────────────

export type GooglePersonBody = Record<string, unknown>;

const nonEmpty = <T>(items: T[]): T[] | undefined => (items.length ? items : undefined);

/**
 * The Person body Yello writes for a contact (createContact /
 * updateContact with updatePersonFields = MAPPED_PERSON_FIELDS). An empty
 * field is sent as an empty list so an update clears it on Google too.
 * Archived details are never sent (see archivedDetails.ts).
 */
export function contactDataToPerson(contact: ContactForVcard): GooglePersonBody {
  const name = {
    givenName: contact.firstName || undefined,
    familyName: contact.lastName || undefined,
    middleName: contact.middleName || undefined,
    honorificPrefix: contact.namePrefix || undefined,
    honorificSuffix: contact.nameSuffix || undefined
  };
  const hasName = Object.values(name).some(Boolean);
  const birthday = dateToGoogle(contact.birthday);

  const socialUrls = activeOnly(contact.socialProfiles)
    .filter(s => s.profileUrl)
    .map(s => ({ value: s.profileUrl!, type: s.platform.toLowerCase() }));

  return {
    names: hasName ? [name] : (contact.displayName ? [{ unstructuredName: contact.displayName }] : []),
    nicknames: contact.nickname ? [{ value: contact.nickname }] : [],
    organizations: contact.company || contact.title || contact.department
      ? [{ name: contact.company || undefined, title: contact.title || undefined, department: contact.department || undefined }]
      : [],
    biographies: contact.notes ? [{ value: contact.notes, contentType: 'TEXT_PLAIN' }] : [],
    birthdays: birthday ? [{ date: birthday }] : [],
    genders: contact.gender ? [{ value: contact.gender.toLowerCase() }] : [],
    emailAddresses: activeOnly(contact.emails).filter(e => e.email).map(e => ({ value: e.email, type: emailToGoogle(e) })),
    phoneNumbers: activeOnly(contact.phones).filter(p => p.phone).map(p => ({ value: p.phoneDisplay || p.phone, type: phoneToGoogle(p) })),
    addresses: activeOnly(contact.addresses).map(a => ({
      streetAddress: a.street || undefined,
      extendedAddress: a.extended || undefined,
      poBox: a.poBox || undefined,
      city: a.city || undefined,
      region: a.state || undefined,
      postalCode: a.postalCode || undefined,
      country: a.country || undefined,
      countryCode: a.countryCode || undefined,
      type: addressToGoogle(a)
    })),
    urls: [
      ...activeOnly(contact.urls ?? []).filter(u => u.url).map(u => ({ value: u.url, type: urlToGoogle(u) })),
      ...socialUrls
    ],
    imClients: activeOnly(contact.instantMessages ?? []).filter(im => im.handle).map(im => ({ username: im.handle, protocol: im.service })),
    relations: (contact.relatedPeople ?? []).filter(r => r.name).map(r => ({ person: r.name, type: plainLabel(r.relationship) })),
    events: (contact.dates ?? [])
      .map(d => ({ date: dateToGoogle(d.date), type: plainLabel(d.label) }))
      .filter(e => e.date !== null),
    clientData: nonEmpty(contact.uid ? [{ key: YELLO_UID_CLIENT_KEY, value: contact.uid }] : []) ?? []
  };
}

import type { ContactForVcard } from '../vcardGenerator.js';

/**
 * Raw access to the People API for backup and sync: every person field, kept
 * as Google returns it, plus the contact groups (labels) it references.
 * The import path in googlePeopleService.ts maps a thin subset instead.
 */

/** Every personField people.connections.list accepts. */
export const ALL_PERSON_FIELDS = [
  'addresses', 'ageRanges', 'biographies', 'birthdays', 'calendarUrls', 'clientData', 'coverPhotos',
  'emailAddresses', 'events', 'externalIds', 'genders', 'imClients', 'interests', 'locales', 'locations',
  'memberships', 'metadata', 'miscKeywords', 'names', 'nicknames', 'occupations', 'organizations',
  'phoneNumbers', 'photos', 'relations', 'sipAddresses', 'skills', 'urls', 'userDefined'
].join(',');

interface FieldMetadata {
  primary?: boolean;
  source?: { type?: string; id?: string };
}

interface GoogleDate { year?: number; month?: number; day?: number }

/** The subset of a Person this code reads; the rest is kept opaque. */
export interface GooglePersonRaw {
  resourceName: string;
  etag?: string;
  metadata?: { sources?: Array<{ type?: string; id?: string; etag?: string; updateTime?: string }>; deleted?: boolean };
  names?: Array<{
    displayName?: string; givenName?: string; familyName?: string; middleName?: string;
    honorificPrefix?: string; honorificSuffix?: string; metadata?: FieldMetadata;
  }>;
  nicknames?: Array<{ value?: string }>;
  organizations?: Array<{ name?: string; title?: string; department?: string; metadata?: FieldMetadata }>;
  biographies?: Array<{ value?: string }>;
  birthdays?: Array<{ date?: GoogleDate; text?: string }>;
  events?: Array<{ date?: GoogleDate; type?: string; formattedType?: string }>;
  emailAddresses?: Array<{ value?: string; type?: string; formattedType?: string; metadata?: FieldMetadata }>;
  phoneNumbers?: Array<{ value?: string; canonicalForm?: string; type?: string; formattedType?: string; metadata?: FieldMetadata }>;
  addresses?: Array<{
    streetAddress?: string; extendedAddress?: string; poBox?: string; city?: string; region?: string;
    postalCode?: string; country?: string; countryCode?: string; type?: string; formattedType?: string;
  }>;
  urls?: Array<{ value?: string; type?: string; formattedType?: string }>;
  imClients?: Array<{ username?: string; protocol?: string; formattedProtocol?: string; type?: string }>;
  relations?: Array<{ person?: string; type?: string; formattedType?: string }>;
  genders?: Array<{ value?: string }>;
  memberships?: Array<{ contactGroupMembership?: { contactGroupResourceName?: string } }>;
  photos?: Array<{ url: string; default?: boolean; metadata?: FieldMetadata }>;
  [field: string]: unknown;
}

export interface GoogleContactGroupRaw {
  resourceName: string;
  name?: string;
  formattedName?: string;
  groupType?: 'USER_CONTACT_GROUP' | 'SYSTEM_CONTACT_GROUP' | string;
  memberCount?: number;
  [field: string]: unknown;
}

export class GoogleApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function getJson<T>(url: URL, accessToken: string): Promise<T> {
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new GoogleApiError(response.status, `Google People API ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

/** Every contact in the user's Google "Contacts", all fields, as returned. */
export async function fetchAllGooglePeople(accessToken: string): Promise<GooglePersonRaw[]> {
  const people: GooglePersonRaw[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL('https://people.googleapis.com/v1/people/me/connections');
    url.searchParams.set('personFields', ALL_PERSON_FIELDS);
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await getJson<{ connections?: GooglePersonRaw[]; nextPageToken?: string }>(url, accessToken);
    people.push(...(page.connections ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return people;
}

/** All contact groups (labels), user-created and system. */
export async function fetchAllGoogleContactGroups(accessToken: string): Promise<GoogleContactGroupRaw[]> {
  const groups: GoogleContactGroupRaw[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL('https://people.googleapis.com/v1/contactGroups');
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('groupFields', 'name,groupType,memberCount,metadata,clientData');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await getJson<{ contactGroups?: GoogleContactGroupRaw[]; nextPageToken?: string }>(url, accessToken);
    groups.push(...(page.contactGroups ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return groups;
}

/** The photo a person's own contact card carries (not a profile or default silhouette). */
export function contactPhotoUrl(person: GooglePersonRaw): string | null {
  const photo = person.photos?.find(p => !p.default && p.metadata?.source?.type === 'CONTACT');
  return photo?.url ?? null;
}

// ─── Person → vCard (for backup files) ──────────────────────────────────────

/** Google's standard types → vCard TYPE values. Anything else becomes an X-ABLabel. */
const EMAIL_TYPES: Record<string, string> = { home: 'HOME', work: 'WORK', other: 'OTHER' };
const PHONE_TYPES: Record<string, string> = {
  home: 'HOME', work: 'WORK', mobile: 'CELL', main: 'MAIN', homeFax: 'HOME,FAX', workFax: 'WORK,FAX',
  otherFax: 'FAX', pager: 'PAGER', workMobile: 'WORK,CELL', workPager: 'WORK,PAGER', other: 'OTHER',
  googleVoice: 'OTHER'
};
const ADDRESS_TYPES: Record<string, string> = { home: 'HOME', work: 'WORK', other: 'OTHER' };
const URL_TYPES: Record<string, string> = { homePage: 'HOME', home: 'HOME', work: 'WORK', blog: 'OTHER', profile: 'OTHER', other: 'OTHER' };

function typed(type: string | undefined, formattedType: string | undefined, table: Record<string, string>) {
  if (!type) return { type: null, extraTypes: null, label: null };
  const mapped = table[type];
  if (!mapped) return { type: null, extraTypes: null, label: formattedType || type };
  const [first, ...rest] = mapped.split(',');
  return { type: first, extraTypes: rest.length ? rest.join(',') : null, label: null };
}

function formatDate(date: GoogleDate | undefined): string | null {
  if (!date?.month || !date?.day) return null;
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return date.year ? `${String(date.year).padStart(4, '0')}-${mm}-${dd}` : `--${mm}-${dd}`;
}

/**
 * Maps a raw Person to the vCard generator's input. Lossy by nature (a
 * vCard has no home for every People field); the JSON in the same backup is
 * the full-fidelity copy.
 */
export function googlePersonToVcardInput(
  person: GooglePersonRaw,
  groupNames: Map<string, string>,
  photoBase64: string | null
): ContactForVcard {
  const name = person.names?.[0];
  const org = person.organizations?.[0];
  const emails = (person.emailAddresses ?? []).filter(e => e.value);
  const firstName = name?.givenName || null;
  const lastName = name?.familyName || null;
  const displayName = name?.displayName
    || [firstName, lastName].filter(Boolean).join(' ')
    || org?.name
    || emails[0]?.value
    || 'Unknown';

  const categories = (person.memberships ?? [])
    .map(m => m.contactGroupMembership?.contactGroupResourceName)
    .map(resource => (resource ? groupNames.get(resource) : undefined))
    .filter((group): group is string => !!group);

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
    birthday: formatDate(person.birthdays?.[0]?.date),
    gender: person.genders?.[0]?.value || null,
    emails: emails.map((e, i) => ({
      email: e.value!,
      isPrimary: e.metadata?.primary ?? i === 0,
      ...typed(e.type, e.formattedType, EMAIL_TYPES)
    })),
    phones: (person.phoneNumbers ?? []).filter(p => p.value).map((p, i) => ({
      phone: p.canonicalForm || p.value!,
      phoneDisplay: p.value!,
      isPrimary: p.metadata?.primary ?? i === 0,
      ...typed(p.type, p.formattedType, PHONE_TYPES)
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
      ...typed(a.type, a.formattedType, ADDRESS_TYPES)
    })),
    urls: (person.urls ?? []).filter(u => u.value).map(u => {
      const t = typed(u.type, u.formattedType, URL_TYPES);
      return { url: u.value!, type: t.type, label: t.label };
    }),
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
      .map(e => ({ date: formatDate(e.date), label: e.formattedType || e.type || null }))
      .filter((d): d is { date: string; label: string | null } => d.date !== null),
    socialProfiles: [],
    categories: [...new Set(categories)],
    photoBase64: photoBase64 ?? undefined,
    uid: null
  };
}

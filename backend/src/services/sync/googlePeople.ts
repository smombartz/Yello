import type { ContactForVcard } from '../vcardGenerator.js';
import { personToContactData } from './googlePersonMapper.js';

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
  nicknames?: Array<{ value?: string; metadata?: FieldMetadata }>;
  organizations?: Array<{ name?: string; title?: string; department?: string; metadata?: FieldMetadata }>;
  biographies?: Array<{ value?: string }>;
  birthdays?: Array<{ date?: GoogleDate; text?: string }>;
  events?: Array<{ date?: GoogleDate; type?: string; formattedType?: string }>;
  emailAddresses?: Array<{ value?: string; type?: string; formattedType?: string; metadata?: FieldMetadata }>;
  phoneNumbers?: Array<{ value?: string; canonicalForm?: string; type?: string; formattedType?: string; metadata?: FieldMetadata }>;
  addresses?: Array<{
    metadata?: FieldMetadata;
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

/**
 * Maps a raw Person to the vCard generator's input, keeping every value
 * (profile-sourced ones too) and labels as categories. Lossy by nature (a
 * vCard has no home for every People field); the JSON in the same backup is
 * the full-fidelity copy.
 */
export function googlePersonToVcardInput(
  person: GooglePersonRaw,
  groupNames: Map<string, string>,
  photoBase64: string | null
): ContactForVcard {
  return { ...personToContactData(person, { groupNames, allSources: true, photoBase64 }), uid: null };
}

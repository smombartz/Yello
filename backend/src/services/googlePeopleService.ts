import { parsePhoneNumber } from 'libphonenumber-js';
import type {
  ParsedEmail,
  ParsedPhone,
  ParsedAddress,
  ParsedUrl,
} from './vcardParser.js';

// ─── Types for Google People API ────────────────────────────────────────────

export interface GoogleParsedContact {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  birthday: string | null;
  emails: ParsedEmail[];
  phones: ParsedPhone[];
  addresses: ParsedAddress[];
  categories: string[];
  instantMessages: never[];
  urls: ParsedUrl[];
  relatedPeople: never[];
  socialProfiles: never[];
  photoBase64: string | null;
  rawVcard: string;
  photoUrl: string | null;
  googleResourceName: string;
}

interface GooglePerson {
  resourceName: string;
  names?: Array<{
    givenName?: string;
    familyName?: string;
    displayName?: string;
  }>;
  emailAddresses?: Array<{ value: string; type?: string }>;
  phoneNumbers?: Array<{ value: string; type?: string }>;
  addresses?: Array<{
    streetAddress?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    type?: string;
  }>;
  organizations?: Array<{ name?: string; title?: string }>;
  biographies?: Array<{ value: string }>;
  birthdays?: Array<{
    date?: { year?: number; month?: number; day?: number };
  }>;
  urls?: Array<{ value: string; type?: string }>;
  photos?: Array<{
    url: string;
    metadata?: {
      primary?: boolean;
      source?: { type?: string };
    };
  }>;
}

interface ConnectionsResponse {
  connections?: GooglePerson[];
  nextPageToken?: string;
  totalItems?: number;
}

// ─── Contact mapping ────────────────────────────────────────────────────────

export function mapGooglePersonToParsedContact(person: GooglePerson): GoogleParsedContact {
  const name = person.names?.[0];
  const firstName = name?.givenName || null;
  const lastName = name?.familyName || null;

  // Build displayName: prefer Google's displayName, then construct from parts, fall back to email
  let displayName = name?.displayName || '';
  if (!displayName) {
    const parts = [firstName, lastName].filter(Boolean);
    displayName = parts.length > 0 ? parts.join(' ') : '';
  }
  if (!displayName && person.emailAddresses?.length) {
    displayName = person.emailAddresses[0].value;
  }
  if (!displayName) {
    displayName = 'Unknown';
  }

  // Emails
  const emails: ParsedEmail[] = (person.emailAddresses || []).map((e, i) => ({
    email: e.value,
    type: e.type || null,
    isPrimary: i === 0,
  }));

  // Phones (normalize with libphonenumber-js)
  const phones: ParsedPhone[] = (person.phoneNumbers || []).map((p, i) => {
    const parsed = parsePhoneNumber(p.value, 'US');
    return {
      phone: parsed ? parsed.format('E.164') : p.value,
      phoneDisplay: parsed ? parsed.formatInternational() : p.value,
      countryCode: parsed?.country || null,
      type: p.type || null,
      isPrimary: i === 0,
    };
  });

  // Addresses
  const addresses: ParsedAddress[] = (person.addresses || []).map((a) => ({
    street: a.streetAddress || null,
    city: a.city || null,
    state: a.region || null,
    postalCode: a.postalCode || null,
    country: a.country || null,
    type: a.type || null,
  }));

  // URLs
  const urls: ParsedUrl[] = (person.urls || []).map((u) => ({
    url: u.value,
    label: null,
    type: u.type || null,
  }));

  // Birthday
  let birthday: string | null = null;
  const bday = person.birthdays?.[0]?.date;
  if (bday && bday.month && bday.day) {
    const mm = String(bday.month).padStart(2, '0');
    const dd = String(bday.day).padStart(2, '0');
    if (bday.year) {
      birthday = `${bday.year}-${mm}-${dd}`;
    } else {
      birthday = `--${mm}-${dd}`;
    }
  }

  // Organization
  const org = person.organizations?.[0];

  // Photo — skip default silhouettes and domain profile photos
  let photoUrl: string | null = null;
  const photo = person.photos?.find((p) => p.metadata?.primary) || person.photos?.[0];
  if (photo) {
    const sourceType = photo.metadata?.source?.type;
    const isDefault = photo.url.includes('default-user');
    const isDomainProfile = sourceType === 'DOMAIN_PROFILE';
    if (!isDefault && !isDomainProfile) {
      photoUrl = photo.url;
    }
  }

  return {
    firstName,
    lastName,
    displayName,
    company: org?.name || null,
    title: org?.title || null,
    notes: person.biographies?.[0]?.value || null,
    birthday,
    emails,
    phones,
    addresses,
    categories: [],
    instantMessages: [],
    urls,
    relatedPeople: [],
    socialProfiles: [],
    photoBase64: null,
    rawVcard: '',
    photoUrl,
    googleResourceName: person.resourceName,
  };
}

// ─── Fetch all contacts ─────────────────────────────────────────────────────

const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,addresses,organizations,biographies,birthdays,urls,photos';

export async function fetchGoogleContacts(accessToken: string): Promise<GoogleParsedContact[]> {
  const contacts: GoogleParsedContact[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://people.googleapis.com/v1/people/me/connections');
    url.searchParams.set('personFields', PERSON_FIELDS);
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('sortOrder', 'LAST_MODIFIED_DESCENDING');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw 'GOOGLE_TOKEN_EXPIRED';
      }
      if (response.status === 403) {
        throw 'GOOGLE_CONTACTS_SCOPE_REQUIRED';
      }
      throw new Error(`Google People API error: ${response.status}`);
    }

    const data = (await response.json()) as ConnectionsResponse;

    if (data.connections) {
      for (const person of data.connections) {
        contacts.push(mapGooglePersonToParsedContact(person));
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return contacts;
}

// ─── Download a single Google photo ─────────────────────────────────────────

export async function downloadGooglePhoto(
  photoUrl: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const response = await fetch(photoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error(`[GooglePeople] Photo download failed: ${response.status}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  } catch (error) {
    console.error('[GooglePeople] Error downloading photo:', error);
    return null;
  }
}

// ─── Existing: fetch photos from otherContacts (for enrichment) ─────────────

interface GoogleContact {
  email: string;
  photoUrl: string | null;
}

interface OtherContactsResponse {
  otherContacts?: Array<{
    resourceName: string;
    emailAddresses?: Array<{ value: string }>;
    photos?: Array<{ url: string; metadata?: { primary?: boolean } }>;
  }>;
  nextPageToken?: string;
}

export async function fetchGoogleContactsPhotos(accessToken: string): Promise<GoogleContact[]> {
  const contacts: GoogleContact[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const url = new URL('https://people.googleapis.com/v1/otherContacts');
      url.searchParams.set('readMask', 'emailAddresses,photos');
      url.searchParams.set('pageSize', '1000');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          console.log('User has not granted contacts permission');
          return [];
        }
        throw new Error(`Google People API error: ${response.status}`);
      }

      const data = (await response.json()) as OtherContactsResponse;
      console.log(`[GooglePeople] API response otherContacts count: ${data.otherContacts?.length || 0}`);

      if (data.otherContacts) {
        for (const contact of data.otherContacts) {
          const email = contact.emailAddresses?.[0]?.value;
          const photo = contact.photos?.find(p => p.metadata?.primary)?.url || contact.photos?.[0]?.url;

          if (email) {
            console.log(`[GooglePeople] Found: ${email} -> ${photo ? 'has photo' : 'no photo'}`);
          }

          if (email && photo) {
            contacts.push({ email: email.toLowerCase(), photoUrl: photo });
          }
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    console.log(`[GooglePeople] Total contacts with photos returned: ${contacts.length}`);
    return contacts;
  } catch (error) {
    console.error('[GooglePeople] Error fetching Google contacts:', error);
    return [];
  }
}

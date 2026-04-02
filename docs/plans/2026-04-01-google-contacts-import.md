# Google Contacts Import — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Import contacts from Google Contacts via the People API, with a UI flow matching the existing iCloud import (fetch → preview duplicates → user decides merge/skip/import → execute).

**Architecture:** Reuse the existing import infrastructure — `icloudMatchingService` (rename-worthy but functionally source-agnostic), the same `ParsedContact` type, and the same import/merge logic from `icloud.ts` routes. Google auth tokens are already stored encrypted in the auth DB. The key new work is: (1) a Google People API service that fetches contacts and maps them to `ParsedContact`, (2) backend routes at `/api/google-contacts/*`, (3) a frontend `GoogleContactsImportView` mirroring `ICloudImportView`, and (4) a scope-upgrade OAuth flow similar to the existing Gmail re-auth pattern.

**Tech Stack:** Google People API v1 (REST, no SDK needed — just `fetch`), existing `@fastify/oauth2` + manual token exchange, `libphonenumber-js` for phone normalization, existing `tokenEncryption` for token storage.

**Future two-way sync consideration:** This plan stores the Google `resourceName` (e.g. `people/c123456`) for each imported contact in a new `google_resource_name` column on `contacts`. This is the stable identifier needed for future write-back via `people.updateContact`. The import also stores a `google_contacts_last_synced` timestamp in `user_settings`. These fields are inert for now but will be the foundation for bidirectional sync.

---

## Task 1: Extend Google People API Service

**Files:**
- Modify: `backend/src/services/googlePeopleService.ts`
- Test: `backend/src/__tests__/googlePeopleService.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/__tests__/googlePeopleService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapGooglePersonToParsedContact } from '../services/googlePeopleService.js';

describe('mapGooglePersonToParsedContact', () => {
  it('maps a full Google person to ParsedContact', () => {
    const person = {
      resourceName: 'people/c123456',
      names: [{ displayName: 'John Smith', givenName: 'John', familyName: 'Smith' }],
      emailAddresses: [
        { value: 'john@example.com', type: 'work', metadata: { primary: true } },
        { value: 'john.personal@gmail.com', type: 'home' },
      ],
      phoneNumbers: [
        { value: '+1 (555) 123-4567', type: 'mobile' },
      ],
      addresses: [{
        streetAddress: '123 Main St',
        city: 'Springfield',
        region: 'IL',
        postalCode: '62701',
        country: 'US',
        type: 'home',
      }],
      organizations: [{ name: 'Acme Corp', title: 'Engineer' }],
      biographies: [{ value: 'Some notes about John' }],
      birthdays: [{ date: { year: 1990, month: 3, day: 15 } }],
      urls: [{ value: 'https://john.dev', type: 'blog' }],
      photos: [{ url: 'https://lh3.googleusercontent.com/photo123' }],
    };

    const result = mapGooglePersonToParsedContact(person);

    expect(result.firstName).toBe('John');
    expect(result.lastName).toBe('Smith');
    expect(result.displayName).toBe('John Smith');
    expect(result.company).toBe('Acme Corp');
    expect(result.title).toBe('Engineer');
    expect(result.notes).toBe('Some notes about John');
    expect(result.birthday).toBe('1990-03-15');
    expect(result.emails).toHaveLength(2);
    expect(result.emails[0]).toEqual({ email: 'john@example.com', type: 'work', isPrimary: true });
    expect(result.phones).toHaveLength(1);
    expect(result.phones[0].type).toBe('mobile');
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0].city).toBe('Springfield');
    expect(result.urls).toHaveLength(1);
    expect(result.urls[0]).toEqual({ url: 'https://john.dev', label: 'blog', type: 'blog' });
    expect(result.googleResourceName).toBe('people/c123456');
    // photoBase64 is null — photos are URLs that get downloaded separately
    expect(result.photoUrl).toBe('https://lh3.googleusercontent.com/photo123');
    expect(result.rawVcard).toBe('');
  });

  it('handles minimal contact (name only)', () => {
    const person = {
      resourceName: 'people/c999',
      names: [{ displayName: 'Jane', givenName: 'Jane' }],
    };

    const result = mapGooglePersonToParsedContact(person);

    expect(result.displayName).toBe('Jane');
    expect(result.firstName).toBe('Jane');
    expect(result.lastName).toBeNull();
    expect(result.emails).toEqual([]);
    expect(result.phones).toEqual([]);
  });

  it('skips contacts with no name', () => {
    const person = {
      resourceName: 'people/c000',
      emailAddresses: [{ value: 'noname@test.com' }],
    };

    const result = mapGooglePersonToParsedContact(person);
    expect(result.displayName).toBe('noname@test.com');
  });

  it('formats birthday without year', () => {
    const person = {
      resourceName: 'people/c111',
      names: [{ displayName: 'Test' }],
      birthdays: [{ date: { month: 12, day: 25 } }],
    };

    const result = mapGooglePersonToParsedContact(person);
    expect(result.birthday).toBe('--12-25');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/__tests__/googlePeopleService.test.ts`
Expected: FAIL — `mapGooglePersonToParsedContact` not exported

**Step 3: Write the implementation**

Add to `backend/src/services/googlePeopleService.ts` — keep the existing `fetchGoogleContactsPhotos` function, add new types and functions:

```typescript
import { parsePhoneNumberFromString } from 'libphonenumber-js';

// --- Types for Google People API responses ---

interface GooglePerson {
  resourceName: string;
  names?: Array<{ displayName?: string; givenName?: string; familyName?: string }>;
  emailAddresses?: Array<{ value: string; type?: string; metadata?: { primary?: boolean } }>;
  phoneNumbers?: Array<{ value: string; type?: string; metadata?: { primary?: boolean } }>;
  addresses?: Array<{
    streetAddress?: string; city?: string; region?: string;
    postalCode?: string; country?: string; type?: string;
  }>;
  organizations?: Array<{ name?: string; title?: string }>;
  biographies?: Array<{ value: string }>;
  birthdays?: Array<{ date?: { year?: number; month?: number; day?: number } }>;
  urls?: Array<{ value: string; type?: string }>;
  photos?: Array<{ url: string; metadata?: { primary?: boolean; source?: { type?: string } } }>;
}

interface GoogleConnectionsResponse {
  connections?: GooglePerson[];
  nextPageToken?: string;
  totalPeople?: number;
  totalItems?: number;
}

// Extended ParsedContact with Google-specific fields
export interface GoogleParsedContact {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  birthday: string | null;
  emails: Array<{ email: string; type: string | null; isPrimary: boolean }>;
  phones: Array<{ phone: string; phoneDisplay: string | null; countryCode: string | null; type: string | null; isPrimary: boolean }>;
  addresses: Array<{ street: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null; type: string | null }>;
  categories: string[];
  instantMessages: Array<{ service: string; handle: string; type: string | null }>;
  urls: Array<{ url: string; label: string | null; type: string | null }>;
  relatedPeople: Array<{ name: string; relationship: string | null }>;
  socialProfiles: Array<{ platform: string; username: string | null; url: string | null }>;
  photoBase64: string | null;
  photoUrl: string | null; // Google photo URL to download
  rawVcard: string;
  googleResourceName: string; // For future two-way sync
}

/**
 * Map a Google People API person object to our ParsedContact-compatible structure.
 */
export function mapGooglePersonToParsedContact(person: GooglePerson): GoogleParsedContact {
  const name = person.names?.[0];
  const org = person.organizations?.[0];
  const bio = person.biographies?.[0];
  const bday = person.birthdays?.[0]?.date;

  // Build display name fallback
  let displayName = name?.displayName || '';
  if (!displayName && name) {
    displayName = [name.givenName, name.familyName].filter(Boolean).join(' ');
  }
  if (!displayName) {
    displayName = person.emailAddresses?.[0]?.value || person.phoneNumbers?.[0]?.value || 'Unknown';
  }

  // Format birthday
  let birthday: string | null = null;
  if (bday) {
    if (bday.year) {
      birthday = `${bday.year}-${String(bday.month).padStart(2, '0')}-${String(bday.day).padStart(2, '0')}`;
    } else if (bday.month && bday.day) {
      birthday = `--${String(bday.month).padStart(2, '0')}-${String(bday.day).padStart(2, '0')}`;
    }
  }

  // Map emails
  const emails = (person.emailAddresses || []).map((e, i) => ({
    email: e.value,
    type: e.type || null,
    isPrimary: e.metadata?.primary || i === 0,
  }));

  // Map phones with libphonenumber normalization
  const phones = (person.phoneNumbers || []).map((p, i) => {
    const parsed = parsePhoneNumberFromString(p.value);
    return {
      phone: parsed?.format('E.164') || p.value,
      phoneDisplay: parsed?.formatInternational() || p.value,
      countryCode: parsed?.country || null,
      type: p.type || null,
      isPrimary: p.metadata?.primary || i === 0,
    };
  });

  // Map addresses
  const addresses = (person.addresses || []).map(a => ({
    street: a.streetAddress || null,
    city: a.city || null,
    state: a.region || null,
    postalCode: a.postalCode || null,
    country: a.country || null,
    type: a.type || null,
  }));

  // Map URLs
  const urls = (person.urls || []).map(u => ({
    url: u.value,
    label: u.type || null,
    type: u.type || null,
  }));

  // Get primary photo URL (skip default silhouette photos)
  const photo = person.photos?.find(p =>
    p.metadata?.source?.type !== 'DOMAIN_PROFILE' &&
    !p.url?.includes('default-user')
  ) || person.photos?.[0];
  const photoUrl = photo?.url || null;

  return {
    firstName: name?.givenName || null,
    lastName: name?.familyName || null,
    displayName,
    company: org?.name || null,
    title: org?.title || null,
    notes: bio?.value || null,
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
    photoUrl,
    rawVcard: '',
    googleResourceName: person.resourceName,
  };
}

/**
 * Fetch all contacts from Google People API using the user's access token.
 * Uses the `connections` endpoint (user's "My Contacts") instead of `otherContacts`.
 */
export async function fetchGoogleContacts(accessToken: string): Promise<{
  contacts: GoogleParsedContact[];
  total: number;
}> {
  const contacts: GoogleParsedContact[] = [];
  let pageToken: string | undefined;

  const readMask = [
    'names', 'emailAddresses', 'phoneNumbers', 'addresses',
    'organizations', 'biographies', 'birthdays', 'urls', 'photos',
  ].join(',');

  do {
    const url = new URL('https://people.googleapis.com/v1/people/me/connections');
    url.searchParams.set('personFields', readMask);
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('sortOrder', 'FIRST_NAME_ASCENDING');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        throw new Error('GOOGLE_TOKEN_EXPIRED');
      }
      if (response.status === 403) {
        throw new Error('GOOGLE_CONTACTS_SCOPE_REQUIRED');
      }
      throw new Error(`Google People API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as GoogleConnectionsResponse;

    if (data.connections) {
      for (const person of data.connections) {
        contacts.push(mapGooglePersonToParsedContact(person));
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return { contacts, total: contacts.length };
}

/**
 * Download a Google profile photo and return as base64.
 * Google photo URLs require the access token for private contacts.
 */
export async function downloadGooglePhoto(photoUrl: string, accessToken: string): Promise<string | null> {
  try {
    // Request a larger size by appending size parameter
    const sizedUrl = photoUrl.includes('=') ? photoUrl : `${photoUrl}=s400`;
    const response = await fetch(sizedUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  } catch {
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/__tests__/googlePeopleService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/googlePeopleService.ts backend/src/__tests__/googlePeopleService.test.ts
git commit -m "feat: add Google People API contact mapping and fetch service"
```

---

## Task 2: Add OAuth Scope Upgrade for Google Contacts

**Files:**
- Modify: `backend/src/routes/auth.ts`

The app currently requests `contacts.other.readonly` which only accesses "Other Contacts" (auto-saved). For the full contact list we need `contacts.readonly`. We'll add a re-auth flow similar to the existing Gmail re-auth.

**Step 1: Add the Google Contacts re-auth endpoint**

After the existing `/google/gmail` endpoint (around line 420), add:

```typescript
// Google Contacts re-auth: redirect to Google OAuth with contacts.readonly scope
fastify.get('/google/contacts', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request: FastifyRequest, reply: FastifyReply) => {
  if (!googleClientId || !googleClientSecret) {
    return reply.status(503).send({ error: 'Google OAuth not configured' });
  }

  const scopes = [
    'profile',
    'email',
    'https://www.googleapis.com/auth/contacts.other.readonly',
    'https://www.googleapis.com/auth/contacts.readonly',
  ].join(' ');

  const state = randomBytes(16).toString('hex');
  reply.setCookie('google_contacts_oauth_state', state, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
  });

  reply.setCookie('google_contacts_oauth_flow', '1', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: `${appUrl}/api/auth/google/callback`,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});
```

**Step 2: Handle the contacts flow in the shared callback**

In the `/google/callback` handler, add a check for `google_contacts_oauth_flow` cookie, similar to how `gmail_oauth_flow` is handled. The logic is identical to the Gmail re-auth flow — exchange the code for tokens, upsert the user, create a session, and redirect. Add this check right after the `isGmailFlow` block:

```typescript
const isGoogleContactsFlow = request.cookies.google_contacts_oauth_flow === '1';

if (isGoogleContactsFlow) {
  reply.clearCookie('google_contacts_oauth_flow', { path: '/' });

  const { code, state, error: oauthError } = request.query;
  if (oauthError || !code) {
    return reply.redirect(`${frontendUrl}/?error=auth_failed`);
  }

  const savedState = request.cookies.google_contacts_oauth_state;
  if (!savedState || savedState !== state) {
    return reply.redirect(`${frontendUrl}/?error=auth_failed`);
  }
  reply.clearCookie('google_contacts_oauth_state', { path: '/' });

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: `${appUrl}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    fastify.log.error(`Google Contacts token exchange failed: ${errorBody}`);
    return reply.redirect(`${frontendUrl}/?error=auth_failed`);
  }

  const tokenData = await tokenResponse.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userInfoResponse.ok) {
    throw new Error('Failed to fetch user info from Google');
  }

  const userInfo = await userInfoResponse.json() as GoogleUserInfo;

  const user = upsertUser(
    userInfo.id, userInfo.email, userInfo.name || null, userInfo.picture || null,
    { accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token, expiresIn: tokenData.expires_in }
  );

  const sessionId = createSession(user.id);
  reply.setCookie('session_id', sessionId, {
    path: '/', httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', maxAge: 30 * 24 * 60 * 60,
  });

  return reply.redirect(`${frontendUrl}/google-contacts-import`);
}
```

**Step 3: Add a helper endpoint to check if the user has the contacts scope**

```typescript
// GET /api/auth/google/contacts-status — check if user has contacts.readonly scope
fastify.get('/google/contacts-status', async (request, reply) => {
  if (!request.user) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }

  const db = getAuthDatabase();
  const user = db.prepare('SELECT access_token, refresh_token, token_expires_at FROM users WHERE id = ?').get(request.user.id) as {
    access_token: string | null;
    refresh_token: string | null;
    token_expires_at: string | null;
  } | undefined;

  if (!user?.access_token) {
    return { hasContactsScope: false, needsReauth: true };
  }

  const accessToken = decryptToken(user.access_token);
  if (!accessToken) {
    return { hasContactsScope: false, needsReauth: true };
  }

  // Test if we can access the contacts API
  try {
    const response = await fetch('https://people.googleapis.com/v1/people/me/connections?personFields=names&pageSize=1', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 403) {
      return { hasContactsScope: false, needsReauth: true };
    }
    if (response.status === 401) {
      // Token expired — try refresh
      return { hasContactsScope: false, needsReauth: true, reason: 'token_expired' };
    }

    return { hasContactsScope: response.ok, needsReauth: !response.ok };
  } catch {
    return { hasContactsScope: false, needsReauth: true };
  }
});
```

**Step 4: Commit**

```bash
git add backend/src/routes/auth.ts
git commit -m "feat: add Google Contacts OAuth scope upgrade flow"
```

---

## Task 3: Add Token Refresh Helper

**Files:**
- Modify: `backend/src/routes/auth.ts` (add a reusable `getValidAccessToken` helper)

**Step 1: Add the helper function** near the top of the auth routes file, after `upsertUser`:

```typescript
/**
 * Get a valid Google access token for a user, refreshing if expired.
 * Returns null if no tokens are stored or refresh fails.
 */
async function getValidAccessToken(userId: number): Promise<string | null> {
  const db = getAuthDatabase();
  const user = db.prepare(
    'SELECT access_token, refresh_token, token_expires_at FROM users WHERE id = ?'
  ).get(userId) as { access_token: string | null; refresh_token: string | null; token_expires_at: string | null } | undefined;

  if (!user?.access_token) return null;

  const accessToken = decryptToken(user.access_token);
  if (!accessToken) return null;

  // Check if token is still valid (with 5-minute buffer)
  if (user.token_expires_at) {
    const expiresAt = new Date(user.token_expires_at).getTime();
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return accessToken;
    }
  }

  // Token expired — try to refresh
  if (!user.refresh_token) return null;
  const refreshToken = decryptToken(user.refresh_token);
  if (!refreshToken) return null;

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) return null;

    const data = await response.json() as { access_token: string; expires_in?: number };
    const newExpiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;

    db.prepare(
      'UPDATE users SET access_token = ?, token_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(encryptToken(data.access_token), newExpiresAt, userId);

    return data.access_token;
  } catch {
    return null;
  }
}
```

**Step 2: Export the helper** so the google contacts routes can use it. Since auth routes register as a Fastify plugin, we'll expose it via `fastify.decorate`:

```typescript
// Inside the auth routes plugin, after defining getValidAccessToken:
fastify.decorate('getValidAccessToken', getValidAccessToken);
```

And add the type declaration at the top of the file:

```typescript
declare module 'fastify' {
  interface FastifyInstance {
    getValidAccessToken: (userId: number) => Promise<string | null>;
  }
}
```

**Step 3: Commit**

```bash
git add backend/src/routes/auth.ts
git commit -m "feat: add token refresh helper for Google API calls"
```

---

## Task 4: Database Schema — Add google_resource_name and sync timestamp

**Files:**
- Modify: `backend/src/services/userDatabase.ts`

**Step 1: Add the migration**

In the `initializeDatabase` function (or wherever schema migrations run), add:

```sql
-- On the contacts table, for future two-way sync
ALTER TABLE contacts ADD COLUMN google_resource_name TEXT;
CREATE INDEX IF NOT EXISTS idx_contacts_google_resource ON contacts(google_resource_name) WHERE google_resource_name IS NOT NULL;

-- On user_settings, track last sync time
ALTER TABLE user_settings ADD COLUMN google_contacts_last_synced DATETIME;
```

Use the existing migration pattern in `userDatabase.ts` — wrap in try/catch so it's safe to re-run (SQLite throws on duplicate ALTER TABLE).

**Step 2: Run backend to verify migration applies**

Run: `cd backend && npx tsx src/services/userDatabase.ts` (or start dev server briefly)
Expected: No errors, columns added

**Step 3: Commit**

```bash
git add backend/src/services/userDatabase.ts
git commit -m "feat: add google_resource_name column and sync timestamp for future two-way sync"
```

---

## Task 5: Backend Routes — Google Contacts Import

**Files:**
- Create: `backend/src/routes/googleContacts.ts`
- Modify: `backend/src/routes/index.ts` (or wherever routes are registered)

**Step 1: Create the routes file**

```typescript
// backend/src/routes/googleContacts.ts
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getUserDatabase } from '../services/userDatabase.js';
import { fetchGoogleContacts, downloadGooglePhoto } from '../services/googlePeopleService.js';
import { matchIncomingContacts } from '../services/icloudMatchingService.js';
import type { ParsedContact } from '../services/vcardParser.js';
import { processPhoto } from '../services/photoProcessor.js';
import { rebuildContactSearch } from '../services/database.js';

export default async function googleContactsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {

  // POST /api/google-contacts/fetch — fetch contacts from Google
  fastify.post('/fetch', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const accessToken = await fastify.getValidAccessToken(request.user!.id);
    if (!accessToken) {
      return reply.status(401).send({ error: 'Google access token not available. Please re-authorize.' });
    }

    try {
      const result = await fetchGoogleContacts(accessToken);

      // Download photos in parallel (batch of 10 at a time)
      const BATCH_SIZE = 10;
      for (let i = 0; i < result.contacts.length; i += BATCH_SIZE) {
        const batch = result.contacts.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (contact) => {
          if (contact.photoUrl) {
            contact.photoBase64 = await downloadGooglePhoto(contact.photoUrl, accessToken);
          }
        }));
      }

      // Convert to ParsedContact[] for compatibility with existing matching/import
      const parsedContacts: (ParsedContact & { googleResourceName?: string })[] = result.contacts.map(c => ({
        firstName: c.firstName,
        lastName: c.lastName,
        displayName: c.displayName,
        company: c.company,
        title: c.title,
        notes: c.notes,
        birthday: c.birthday,
        emails: c.emails,
        phones: c.phones,
        addresses: c.addresses,
        categories: c.categories,
        instantMessages: c.instantMessages,
        urls: c.urls,
        relatedPeople: c.relatedPeople,
        socialProfiles: c.socialProfiles,
        photoBase64: c.photoBase64,
        rawVcard: c.rawVcard,
        googleResourceName: c.googleResourceName,
      }));

      return { contacts: parsedContacts, total: result.total, errors: [] };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'GOOGLE_TOKEN_EXPIRED') {
          return reply.status(401).send({ error: 'Google token expired. Please re-authorize.' });
        }
        if (error.message === 'GOOGLE_CONTACTS_SCOPE_REQUIRED') {
          return reply.status(403).send({ error: 'Google Contacts permission not granted. Please authorize access.' });
        }
      }
      throw error;
    }
  });

  // POST /api/google-contacts/preview-import — match against existing DB
  fastify.post<{ Body: { contacts: ParsedContact[] } }>('/preview-import', { bodyLimit: 100 * 1024 * 1024 }, async (request, reply) => {
    const { contacts } = request.body;
    if (!contacts || !Array.isArray(contacts)) {
      return reply.status(400).send({ error: 'contacts array is required' });
    }

    const db = getUserDatabase(request.user!.id);
    const result = matchIncomingContacts(db, contacts);
    return result;
  });

  // POST /api/google-contacts/import — execute import with user decisions
  // This is nearly identical to the iCloud import route.
  // We reuse the same logic but add google_resource_name tracking.
  fastify.post<{
    Body: {
      newContacts: (ParsedContact & { googleResourceName?: string })[];
      merges: Array<{
        incomingContact: ParsedContact & { googleResourceName?: string };
        existingContactId: number;
        conflictResolutions?: Record<string, 'incoming' | 'existing'>;
      }>;
      skipped: number;
    };
  }>('/import', { bodyLimit: 100 * 1024 * 1024 }, async (request, reply) => {
    const { newContacts, merges, skipped } = request.body;
    const userId = request.user!.id;
    const db = getUserDatabase(userId);

    let imported = 0;
    let merged = 0;
    const errors: Array<{ line: number; reason: string }> = [];

    const insertContact = db.prepare(`
      INSERT INTO contacts (first_name, last_name, display_name, company, title, notes, birthday, photo_hash, raw_vcard, google_resource_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEmail = db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)');
    const insertPhone = db.prepare('INSERT INTO contact_phones (contact_id, phone, phone_display, country_code, type, is_primary) VALUES (?, ?, ?, ?, ?, ?)');
    const insertAddress = db.prepare('INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertCategory = db.prepare('INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)');
    const insertInstantMessage = db.prepare('INSERT INTO contact_instant_messages (contact_id, service, handle, type) VALUES (?, ?, ?, ?)');
    const insertUrl = db.prepare('INSERT INTO contact_urls (contact_id, url, label, type) VALUES (?, ?, ?, ?)');
    const insertRelatedPerson = db.prepare('INSERT INTO contact_related_people (contact_id, name, relationship) VALUES (?, ?, ?)');
    const insertSocialProfile = db.prepare('INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url, type) VALUES (?, ?, ?, ?, ?)');

    // --- Import new contacts ---
    for (const contact of (newContacts || [])) {
      try {
        const result = insertContact.run(
          contact.firstName, contact.lastName, contact.displayName,
          contact.company, contact.title, contact.notes, contact.birthday,
          null, contact.rawVcard, (contact as any).googleResourceName || null
        );
        const contactId = result.lastInsertRowid as number;

        if (contact.photoBase64) {
          try {
            const photoHash = await processPhoto(contact.photoBase64, contactId, userId);
            db.prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?').run(photoHash, contactId);
            db.prepare(`
              INSERT INTO contact_photos (contact_id, source, local_hash, is_primary)
              VALUES (?, 'google', ?, 1)
              ON CONFLICT(contact_id, source) DO UPDATE SET local_hash = excluded.local_hash, fetched_at = CURRENT_TIMESTAMP
            `).run(contactId, photoHash);
          } catch { /* skip photo on error */ }
        }

        for (const e of contact.emails) insertEmail.run(contactId, e.email, e.type, e.isPrimary ? 1 : 0);
        for (const p of contact.phones) insertPhone.run(contactId, p.phone, p.phoneDisplay, p.countryCode, p.type, p.isPrimary ? 1 : 0);
        for (const a of contact.addresses) insertAddress.run(contactId, a.street, a.city, a.state, a.postalCode, a.country, a.type);
        for (const c of contact.categories) insertCategory.run(contactId, c);
        for (const im of contact.instantMessages) insertInstantMessage.run(contactId, im.service, im.handle, im.type);
        for (const u of contact.urls) insertUrl.run(contactId, u.url, u.label, u.type);
        for (const rp of contact.relatedPeople) insertRelatedPerson.run(contactId, rp.name, rp.relationship);
        for (const sp of contact.socialProfiles) {
          let username = sp.username;
          if (!username && sp.url) {
            const m = sp.url.match(/\/([^\/]+)\/?$/);
            username = m ? m[1] : sp.platform;
          }
          username = username || sp.platform;
          insertSocialProfile.run(contactId, sp.platform, username, sp.url, null);
        }

        rebuildContactSearch(db, contactId);
        imported++;
      } catch (e) {
        errors.push({ line: imported + 1, reason: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    // --- Merge matched contacts ---
    for (const merge of (merges || [])) {
      try {
        const { incomingContact, existingContactId, conflictResolutions } = merge;
        const existingRow = db.prepare('SELECT * FROM contacts WHERE id = ?').get(existingContactId) as Record<string, unknown> | undefined;
        if (!existingRow) {
          errors.push({ line: merged + 1, reason: `Existing contact ${existingContactId} not found` });
          continue;
        }

        // Store google_resource_name if existing doesn't have one
        if ((incomingContact as any).googleResourceName && !existingRow.google_resource_name) {
          db.prepare('UPDATE contacts SET google_resource_name = ? WHERE id = ?')
            .run((incomingContact as any).googleResourceName, existingContactId);
        }

        // Apply scalar field resolutions (same as iCloud)
        const scalarFields = ['first_name', 'last_name', 'company', 'title', 'birthday'] as const;
        const incomingFieldMap: Record<string, string | null> = {
          first_name: incomingContact.firstName,
          last_name: incomingContact.lastName,
          company: incomingContact.company,
          title: incomingContact.title,
          birthday: incomingContact.birthday,
        };

        for (const field of scalarFields) {
          const incomingVal = incomingFieldMap[field];
          const existingVal = existingRow[field] as string | null;
          if (incomingVal && !existingVal) {
            db.prepare(`UPDATE contacts SET ${field} = ? WHERE id = ?`).run(incomingVal, existingContactId);
          } else if (incomingVal && existingVal && incomingVal !== existingVal) {
            const resolution = conflictResolutions?.[field];
            if (resolution === 'incoming') {
              db.prepare(`UPDATE contacts SET ${field} = ? WHERE id = ?`).run(incomingVal, existingContactId);
            }
          }
        }

        // Union multi-value fields (same dedup logic as iCloud)
        const existingEmails = new Set(
          (db.prepare('SELECT LOWER(email) as email FROM contact_emails WHERE contact_id = ?').all(existingContactId) as Array<{ email: string }>).map(r => r.email)
        );
        for (const e of incomingContact.emails) {
          if (!existingEmails.has(e.email.toLowerCase())) insertEmail.run(existingContactId, e.email, e.type, 0);
        }

        const existingPhones = new Set(
          (db.prepare('SELECT phone FROM contact_phones WHERE contact_id = ?').all(existingContactId) as Array<{ phone: string }>).map(r => r.phone)
        );
        for (const p of incomingContact.phones) {
          if (!existingPhones.has(p.phone)) insertPhone.run(existingContactId, p.phone, p.phoneDisplay, p.countryCode, p.type, 0);
        }

        const existingAddresses = new Set(
          (db.prepare('SELECT street, city, postal_code FROM contact_addresses WHERE contact_id = ?').all(existingContactId) as Array<{ street: string; city: string; postal_code: string }>)
            .map(r => `${(r.street || '').toLowerCase()}|${(r.city || '').toLowerCase()}|${(r.postal_code || '').toLowerCase()}`)
        );
        for (const a of incomingContact.addresses) {
          const key = `${(a.street || '').toLowerCase()}|${(a.city || '').toLowerCase()}|${(a.postalCode || '').toLowerCase()}`;
          if (!existingAddresses.has(key)) insertAddress.run(existingContactId, a.street, a.city, a.state, a.postalCode, a.country, a.type);
        }

        const existingSocials = new Set(
          (db.prepare(`SELECT LOWER(platform) || ':' || LOWER(username) as key FROM contact_social_profiles WHERE contact_id = ?`).all(existingContactId) as Array<{ key: string }>).map(r => r.key)
        );
        for (const sp of incomingContact.socialProfiles) {
          let username = sp.username || sp.platform;
          const key = `${(sp.platform || '').toLowerCase()}:${(username || '').toLowerCase()}`;
          if (!existingSocials.has(key)) insertSocialProfile.run(existingContactId, sp.platform, username, sp.url, null);
        }

        const existingCategories = new Set(
          (db.prepare('SELECT LOWER(category) as cat FROM contact_categories WHERE contact_id = ?').all(existingContactId) as Array<{ cat: string }>).map(r => r.cat)
        );
        for (const c of incomingContact.categories) {
          if (!existingCategories.has(c.toLowerCase())) insertCategory.run(existingContactId, c);
        }

        const existingUrls = new Set(
          (db.prepare('SELECT LOWER(url) as url FROM contact_urls WHERE contact_id = ?').all(existingContactId) as Array<{ url: string }>).map(r => r.url)
        );
        for (const u of incomingContact.urls) {
          if (!existingUrls.has(u.url.toLowerCase())) insertUrl.run(existingContactId, u.url, u.label, u.type);
        }

        const existingIMs = new Set(
          (db.prepare(`SELECT LOWER(service) || ':' || LOWER(handle) as key FROM contact_instant_messages WHERE contact_id = ?`).all(existingContactId) as Array<{ key: string }>).map(r => r.key)
        );
        for (const im of incomingContact.instantMessages) {
          const key = `${(im.service || '').toLowerCase()}:${(im.handle || '').toLowerCase()}`;
          if (!existingIMs.has(key)) insertInstantMessage.run(existingContactId, im.service, im.handle, im.type);
        }

        const existingRelated = new Set(
          (db.prepare(`SELECT LOWER(name) || ':' || LOWER(relationship) as key FROM contact_related_people WHERE contact_id = ?`).all(existingContactId) as Array<{ key: string }>).map(r => r.key)
        );
        for (const rp of incomingContact.relatedPeople) {
          const key = `${(rp.name || '').toLowerCase()}:${(rp.relationship || '').toLowerCase()}`;
          if (!existingRelated.has(key)) insertRelatedPerson.run(existingContactId, rp.name, rp.relationship);
        }

        // Photo: only if existing has none
        if (incomingContact.photoBase64) {
          const existingPhoto = existingRow.photo_hash as string | null;
          if (!existingPhoto) {
            try {
              const photoHash = await processPhoto(incomingContact.photoBase64, existingContactId, userId);
              db.prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?').run(photoHash, existingContactId);
              db.prepare(`
                INSERT INTO contact_photos (contact_id, source, local_hash, is_primary)
                VALUES (?, 'google', ?, 1)
                ON CONFLICT(contact_id, source) DO UPDATE SET local_hash = excluded.local_hash, fetched_at = CURRENT_TIMESTAMP
              `).run(existingContactId, photoHash);
            } catch { /* skip photo on error */ }
          }
        }

        // Update display_name
        const updatedFirst = db.prepare('SELECT first_name, last_name FROM contacts WHERE id = ?').get(existingContactId) as { first_name: string | null; last_name: string | null };
        const newDisplayName = [updatedFirst.first_name, updatedFirst.last_name].filter(Boolean).join(' ') || incomingContact.displayName;
        db.prepare('UPDATE contacts SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newDisplayName, existingContactId);

        rebuildContactSearch(db, existingContactId);
        merged++;
      } catch (e) {
        errors.push({ line: merged + 1, reason: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    // Update last synced timestamp
    db.prepare('UPDATE user_settings SET google_contacts_last_synced = CURRENT_TIMESTAMP WHERE id = 1').run();

    return { imported, merged, skipped: skipped || 0, errors };
  });
}
```

**Step 2: Register the routes**

Find where `icloudRoutes` is registered (likely in `backend/src/routes/index.ts` or `backend/src/app.ts`), and add:

```typescript
import googleContactsRoutes from './routes/googleContacts.js';

// Inside the route registration:
fastify.register(googleContactsRoutes, { prefix: '/api/google-contacts' });
```

**Step 3: Commit**

```bash
git add backend/src/routes/googleContacts.ts backend/src/routes/index.ts  # or app.ts
git commit -m "feat: add Google Contacts import backend routes"
```

---

## Task 6: Frontend API Hooks

**Files:**
- Create: `frontend/src/api/googleContactsHooks.ts`

**Step 1: Create the hooks file**

```typescript
// frontend/src/api/googleContactsHooks.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type { ParsedContact, IncomingMatch, MatchResult, ImportDecision, ImportResult } from './icloudHooks';

// Re-export shared types
export type { ParsedContact, IncomingMatch, MatchResult, ImportDecision, ImportResult };

export interface GoogleContactsStatus {
  hasContactsScope: boolean;
  needsReauth: boolean;
  reason?: string;
}

export interface GoogleContactsFetchResult {
  contacts: ParsedContact[];
  total: number;
  errors: Array<{ line: number; reason: string }>;
}

export function useGoogleContactsStatus() {
  return useQuery<GoogleContactsStatus>({
    queryKey: ['google-contacts', 'status'],
    queryFn: () => fetchApi<GoogleContactsStatus>('/api/auth/google/contacts-status'),
  });
}

export function useFetchGoogleContacts() {
  return useMutation<GoogleContactsFetchResult>({
    mutationFn: () =>
      fetchApi<GoogleContactsFetchResult>('/api/google-contacts/fetch', { method: 'POST' }),
  });
}

export function usePreviewGoogleContactsImport() {
  return useMutation<MatchResult, Error, { contacts: ParsedContact[] }>({
    mutationFn: (body) =>
      fetchApi<MatchResult>('/api/google-contacts/preview-import', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useExecuteGoogleContactsImport() {
  const queryClient = useQueryClient();
  return useMutation<ImportResult, Error, ImportDecision>({
    mutationFn: (body) =>
      fetchApi<ImportResult>('/api/google-contacts/import', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
      queryClient.invalidateQueries({ queryKey: ['google-contacts', 'status'] });
    },
  });
}
```

**Step 2: Commit**

```bash
git add frontend/src/api/googleContactsHooks.ts
git commit -m "feat: add Google Contacts frontend API hooks"
```

---

## Task 7: Frontend — GoogleContactsImportView Component

**Files:**
- Create: `frontend/src/components/GoogleContactsImportView.tsx`

This mirrors `ICloudImportView.tsx` closely. Reuses the same `MatchCard` and `NewContactCard` UI patterns but adapted for Google.

**Step 1: Create the component**

```typescript
// frontend/src/components/GoogleContactsImportView.tsx
import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import {
  useGoogleContactsStatus,
  useFetchGoogleContacts,
  usePreviewGoogleContactsImport,
  useExecuteGoogleContactsImport,
  type ParsedContact,
  type IncomingMatch,
  type MatchResult,
} from '../api/googleContactsHooks';
import type { OutletContext } from './Layout';

type MatchDecision = 'merge' | 'new' | 'skip';

function MatchCard({
  match, index, decision, onDecisionChange,
}: {
  match: IncomingMatch; index: number; decision: MatchDecision;
  onDecisionChange: (index: number, decision: MatchDecision) => void;
}) {
  const confidenceColors: Record<string, string> = {
    very_high: 'var(--ds-color-success, #22c55e)',
    high: 'var(--ds-color-warning, #f59e0b)',
    medium: 'var(--ds-color-info, #3b82f6)',
  };

  return (
    <div className={`icloud-match-card ${decision === 'skip' ? 'skipped' : ''}`}>
      <div className="icloud-match-header">
        <span className="icloud-confidence-badge" style={{ backgroundColor: confidenceColors[match.confidence] }}>
          {match.confidence.replace('_', ' ')}
        </span>
        <div className="icloud-match-reasons">
          {match.matchReasons.map((reason, i) => (
            <span key={i} className="icloud-reason-tag">{reason}</span>
          ))}
        </div>
      </div>
      <div className="icloud-match-comparison">
        <div className="icloud-match-side">
          <div className="icloud-match-label">Google</div>
          <div className="icloud-match-name">{match.incoming.displayName}</div>
          {match.incoming.emails[0] && (
            <div className="icloud-match-detail">{match.incoming.emails[0].email}</div>
          )}
          {match.incoming.phones[0] && (
            <div className="icloud-match-detail">{match.incoming.phones[0].phoneDisplay || match.incoming.phones[0].phone}</div>
          )}
          {match.incoming.company && (
            <div className="icloud-match-detail">{match.incoming.company}</div>
          )}
        </div>
        <div className="icloud-match-divider">
          <Icon name="arrows-left-right" />
        </div>
        <div className="icloud-match-side">
          <div className="icloud-match-label">Existing</div>
          <div className="icloud-match-name">{match.existingDisplayName}</div>
        </div>
      </div>
      <div className="icloud-match-actions">
        <button className={`icloud-action-btn ${decision === 'merge' ? 'active' : ''}`} onClick={() => onDecisionChange(index, 'merge')}>
          <Icon name="code-merge" /> Merge
        </button>
        <button className={`icloud-action-btn ${decision === 'new' ? 'active' : ''}`} onClick={() => onDecisionChange(index, 'new')}>
          <Icon name="plus" /> Import as New
        </button>
        <button className={`icloud-action-btn ${decision === 'skip' ? 'active' : ''}`} onClick={() => onDecisionChange(index, 'skip')}>
          <Icon name="forward" /> Skip
        </button>
      </div>
    </div>
  );
}

function NewContactCard({ contact, selected, onToggle }: {
  contact: ParsedContact; selected: boolean; onToggle: () => void;
}) {
  return (
    <div className={`icloud-new-contact-card ${selected ? '' : 'deselected'}`} onClick={onToggle}>
      <input type="checkbox" checked={selected} onChange={onToggle} />
      <div className="icloud-new-contact-info">
        <div className="icloud-match-name">{contact.displayName}</div>
        {contact.emails[0] && (
          <div className="icloud-match-detail">{contact.emails[0].email}</div>
        )}
        {contact.company && (
          <div className="icloud-match-detail">{contact.company}</div>
        )}
      </div>
    </div>
  );
}

export function GoogleContactsImportView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const contactsStatus = useGoogleContactsStatus();
  const fetchContacts = useFetchGoogleContacts();
  const previewImport = usePreviewGoogleContactsImport();
  const executeImport = useExecuteGoogleContactsImport();

  const [fetchedContacts, setFetchedContacts] = useState<ParsedContact[] | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [matchDecisions, setMatchDecisions] = useState<Map<number, MatchDecision>>(new Map());
  const [selectedNewContacts, setSelectedNewContacts] = useState<Set<number>>(new Set());

  useEffect(() => {
    setHeaderConfig({ title: 'Import from Google Contacts' });
  }, [setHeaderConfig]);

  const handleFetch = useCallback(() => {
    fetchContacts.mutate(undefined, {
      onSuccess: (result) => {
        setFetchedContacts(result.contacts);
        previewImport.mutate({ contacts: result.contacts }, {
          onSuccess: (preview) => {
            setMatchResult(preview);
            const decisions = new Map<number, MatchDecision>();
            preview.matches.forEach((_, i) => decisions.set(i, 'merge'));
            setMatchDecisions(decisions);
            const selected = new Set<number>();
            preview.newContacts.forEach((_, i) => selected.add(i));
            setSelectedNewContacts(selected);
          },
        });
      },
    });
  }, [fetchContacts, previewImport]);

  const handleDecisionChange = useCallback((index: number, decision: MatchDecision) => {
    setMatchDecisions(prev => { const next = new Map(prev); next.set(index, decision); return next; });
  }, []);

  const handleToggleNewContact = useCallback((index: number) => {
    setSelectedNewContacts(prev => { const next = new Set(prev); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  }, []);

  const handleSelectAllNew = useCallback((selectAll: boolean) => {
    if (!matchResult) return;
    if (selectAll) {
      const all = new Set<number>();
      matchResult.newContacts.forEach((_, i) => all.add(i));
      setSelectedNewContacts(all);
    } else {
      setSelectedNewContacts(new Set());
    }
  }, [matchResult]);

  const handleSetAllMatches = useCallback((decision: MatchDecision) => {
    if (!matchResult) return;
    const decisions = new Map<number, MatchDecision>();
    matchResult.matches.forEach((_, i) => decisions.set(i, decision));
    setMatchDecisions(decisions);
  }, [matchResult]);

  const handleImport = useCallback(() => {
    if (!matchResult) return;

    const newContacts = matchResult.newContacts.filter((_, i) => selectedNewContacts.has(i));
    const merges = matchResult.matches
      .map((match, i) => ({ match, decision: matchDecisions.get(i) || 'skip' }))
      .filter(({ decision }) => decision === 'merge')
      .map(({ match }) => ({
        incomingContact: match.incoming,
        existingContactId: match.existingContactId,
      }));
    const importAsNew = matchResult.matches
      .map((match, i) => ({ match, decision: matchDecisions.get(i) || 'skip' }))
      .filter(({ decision }) => decision === 'new')
      .map(({ match }) => match.incoming);

    const skippedCount = matchResult.matches.filter((_, i) => matchDecisions.get(i) === 'skip').length
      + matchResult.newContacts.filter((_, i) => !selectedNewContacts.has(i)).length;

    executeImport.mutate({
      newContacts: [...newContacts, ...importAsNew],
      merges,
      skipped: skippedCount,
    }, {
      onSuccess: () => navigate('/contacts'),
    });
  }, [matchResult, matchDecisions, selectedNewContacts, executeImport, navigate]);

  // Needs re-auth for contacts scope
  if (contactsStatus.data && contactsStatus.data.needsReauth) {
    return (
      <div className="icloud-import-view">
        <div className="icloud-empty-state">
          <Icon name="google" style="brands" />
          <h3>Google Contacts Access Required</h3>
          <p>Grant permission to read your Google Contacts. This will redirect you to Google for authorization.</p>
          <a href="/api/auth/google/contacts" className="secondary-button" style={{ textDecoration: 'none' }}>
            <Icon name="right-to-bracket" /> Authorize Google Contacts
          </a>
        </div>
      </div>
    );
  }

  // Idle state
  if (!fetchedContacts && !fetchContacts.isPending) {
    return (
      <div className="icloud-import-view">
        <div className="icloud-empty-state">
          <Icon name="cloud-arrow-down" />
          <h3>Import from Google Contacts</h3>
          <p>Fetch your contacts from Google. We'll check for duplicates before importing.</p>
          {fetchContacts.isError && (
            <p style={{ color: 'var(--ds-color-error)', fontSize: '0.875rem' }}>
              {fetchContacts.error?.message || 'Failed to fetch contacts'}
            </p>
          )}
          <button className="secondary-button" onClick={handleFetch}>
            <Icon name="cloud-arrow-down" /> Fetch from Google Contacts
          </button>
        </div>
      </div>
    );
  }

  // Fetching state
  if (fetchContacts.isPending || previewImport.isPending) {
    return (
      <div className="icloud-import-view">
        <div className="icloud-empty-state">
          <div className="icloud-spinner" />
          <h3>{fetchContacts.isPending ? 'Fetching from Google...' : 'Analyzing contacts...'}</h3>
          <p>{fetchContacts.isPending
            ? 'Downloading your contacts and photos from Google. This may take a moment.'
            : 'Checking for duplicates against your existing contacts.'
          }</p>
        </div>
      </div>
    );
  }

  // Importing state
  if (executeImport.isPending) {
    return (
      <div className="icloud-import-view">
        <div className="icloud-empty-state">
          <div className="icloud-spinner" />
          <h3>Importing contacts...</h3>
          <p>Please wait while your contacts are being imported and merged.</p>
        </div>
      </div>
    );
  }

  // Import complete
  if (executeImport.isSuccess) {
    const result = executeImport.data;
    return (
      <div className="icloud-import-view">
        <div className="icloud-empty-state">
          <Icon name="circle-check" style="regular" />
          <h3>Import Complete</h3>
          <div className="icloud-import-summary">
            <div className="icloud-summary-stat">
              <span className="icloud-summary-number">{result.imported}</span>
              <span className="icloud-summary-label">Imported</span>
            </div>
            <div className="icloud-summary-stat">
              <span className="icloud-summary-number">{result.merged}</span>
              <span className="icloud-summary-label">Merged</span>
            </div>
            <div className="icloud-summary-stat">
              <span className="icloud-summary-number">{result.skipped}</span>
              <span className="icloud-summary-label">Skipped</span>
            </div>
          </div>
          {result.errors.length > 0 && (
            <details style={{ marginTop: '1rem', textAlign: 'left', width: '100%' }}>
              <summary style={{ color: 'var(--ds-color-error)', cursor: 'pointer' }}>
                {result.errors.length} errors
              </summary>
              <ul style={{ fontSize: '0.875rem', maxHeight: '150px', overflow: 'auto' }}>
                {result.errors.map((err, i) => (
                  <li key={i}>#{err.line}: {err.reason}</li>
                ))}
              </ul>
            </details>
          )}
          <button className="secondary-button" onClick={() => navigate('/contacts')} style={{ marginTop: '1rem' }}>
            <Icon name="address-book" /> Go to Contacts
          </button>
        </div>
      </div>
    );
  }

  // Review state
  if (!matchResult) return null;

  const mergeCount = Array.from(matchDecisions.values()).filter(d => d === 'merge').length;
  const importAsNewCount = Array.from(matchDecisions.values()).filter(d => d === 'new').length;
  const skipCount = Array.from(matchDecisions.values()).filter(d => d === 'skip').length;
  const selectedNewCount = selectedNewContacts.size;
  const totalToImport = selectedNewCount + mergeCount + importAsNewCount;

  return (
    <div className="icloud-import-view">
      <div className="icloud-import-summary-bar">
        <div className="icloud-summary-stat">
          <span className="icloud-summary-number">{fetchedContacts?.length || 0}</span>
          <span className="icloud-summary-label">Fetched</span>
        </div>
        <div className="icloud-summary-stat">
          <span className="icloud-summary-number">{matchResult.stats.matched}</span>
          <span className="icloud-summary-label">Matches</span>
        </div>
        <div className="icloud-summary-stat">
          <span className="icloud-summary-number">{matchResult.stats.new}</span>
          <span className="icloud-summary-label">New</span>
        </div>
      </div>

      {executeImport.isError && (
        <p style={{ color: 'var(--ds-color-error)', margin: '0.5rem 0' }}>
          {executeImport.error?.message || 'Import failed'}
        </p>
      )}

      {matchResult.matches.length > 0 && (
        <section className="icloud-section">
          <div className="icloud-section-header">
            <h3>Potential Duplicates ({matchResult.matches.length})</h3>
            <div className="icloud-bulk-actions">
              <button className="icloud-bulk-btn" onClick={() => handleSetAllMatches('merge')}>Merge All</button>
              <button className="icloud-bulk-btn" onClick={() => handleSetAllMatches('skip')}>Skip All</button>
            </div>
          </div>
          <div className="icloud-match-list">
            {matchResult.matches.map((match, i) => (
              <MatchCard key={i} match={match} index={i} decision={matchDecisions.get(i) || 'skip'} onDecisionChange={handleDecisionChange} />
            ))}
          </div>
        </section>
      )}

      {matchResult.newContacts.length > 0 && (
        <section className="icloud-section">
          <div className="icloud-section-header">
            <h3>New Contacts ({matchResult.newContacts.length})</h3>
            <div className="icloud-bulk-actions">
              <button className="icloud-bulk-btn" onClick={() => handleSelectAllNew(true)}>Select All</button>
              <button className="icloud-bulk-btn" onClick={() => handleSelectAllNew(false)}>Deselect All</button>
            </div>
          </div>
          <div className="icloud-new-contacts-list">
            {matchResult.newContacts.map((contact, i) => (
              <NewContactCard key={i} contact={contact} selected={selectedNewContacts.has(i)} onToggle={() => handleToggleNewContact(i)} />
            ))}
          </div>
        </section>
      )}

      <div className="icloud-import-footer">
        <div className="icloud-import-summary-text">
          {totalToImport} to import ({selectedNewCount} new, {mergeCount} merge, {importAsNewCount} as new) &middot; {skipCount + (matchResult.newContacts.length - selectedNewCount)} skipped
        </div>
        <button className="secondary-button" onClick={handleImport} disabled={totalToImport === 0}>
          <Icon name="file-import" /> Import {totalToImport} Contacts
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/GoogleContactsImportView.tsx
git commit -m "feat: add GoogleContactsImportView component"
```

---

## Task 8: Frontend — Routing and Settings Integration

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/SettingsView.tsx`

**Step 1: Add the route in App.tsx**

Import the component and add the route alongside the iCloud one:

```typescript
import { GoogleContactsImportView } from './components/GoogleContactsImportView';

// In the Route list, after the icloud-import route:
<Route path="google-contacts-import" element={<GoogleContactsImportView />} />
```

**Step 2: Add Google Contacts section in SettingsView.tsx**

After the Apple Contacts section (around line 333), add a Google Contacts collapsible card:

```typescript
// Add state at the top of the component:
const [googleContactsExpanded, setGoogleContactsExpanded] = useState(false);

// Add the section in the JSX, after the Apple Contacts section:
{/* Google Contacts Section */}
<section className={`settings-section collapsible-card${googleContactsExpanded ? ' expanded' : ''}`}>
  <button
    className="collapsible-header"
    onClick={() => setGoogleContactsExpanded(!googleContactsExpanded)}
  >
    <div className="settings-section-header">
      <Icon name="google" style="brands" />
      <h2>Google Contacts</h2>
    </div>
    <Icon name="chevron-down" className={`expand-icon${googleContactsExpanded ? ' rotated' : ''}`} />
  </button>
  {googleContactsExpanded && (
    <div className="collapsible-content">
      <p className="settings-description">
        Import contacts from your Google account. Since you're already signed in with Google,
        you may just need to grant additional permission to access your contacts.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <Link to="/google-contacts-import" className="secondary-button" style={{ textDecoration: 'none' }}>
          <Icon name="cloud-arrow-down" />
          Import from Google Contacts
        </Link>
      </div>
    </div>
  )}
</section>
```

Also add a quick-access link at the top of the page (like the iCloud one), conditionally shown:

```typescript
{/* Near the top where the iCloud quick-access link is (around line 141): */}
<Link to="/google-contacts-import" className="collapsible-card settings-nav-link">
  <div className="settings-section-header">
    <Icon name="google" style="brands" />
    <h2>Import from Google Contacts</h2>
  </div>
  <Icon name="chevron-right" />
</Link>
```

**Step 3: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/SettingsView.tsx
git commit -m "feat: add Google Contacts import route and settings UI"
```

---

## Task 9: Backend Proxy Configuration

**Files:**
- Modify: `frontend/vite.config.ts` (if the proxy needs updating for `/api/google-contacts`)

**Step 1: Check if the proxy already covers `/api/*`**

The Vite proxy likely already forwards all `/api` paths to the backend. Verify by reading `vite.config.ts`. If it already proxies `/api`, no changes needed.

**Step 2: Commit (only if changes were needed)**

```bash
git add frontend/vite.config.ts
git commit -m "fix: add google-contacts proxy path"
```

---

## Task 10: Integration Test

**Files:**
- Existing test infrastructure

**Step 1: Run the backend test suite**

Run: `cd backend && npm test`
Expected: All tests pass including the new googlePeopleService tests

**Step 2: Start dev servers and manually test the flow**

Run: `npm run dev` (from root)

Test flow:
1. Navigate to `/tools` — verify Google Contacts section appears
2. Click "Import from Google Contacts"
3. If scope not granted → verify redirect to Google auth
4. After auth → verify fetch, preview, and import flow
5. Verify imported contacts appear in contact list

**Step 3: Stop dev servers**

```bash
kill $(lsof -ti :3456) 2>/dev/null
kill $(lsof -ti :5173) 2>/dev/null
```

**Step 4: Final commit**

```bash
git commit -m "feat: Google Contacts import — complete implementation"
```

---

## Future Two-Way Sync Notes

This implementation lays groundwork for future bidirectional sync:

1. **`google_resource_name`** on contacts — stable ID for `people.updateContact` API
2. **`google_contacts_last_synced`** in user_settings — delta sync anchor
3. **Token infrastructure** — refresh tokens already stored, scope upgrade flow in place
4. **To add write-back:** Add `contacts` scope (not just `contacts.readonly`), implement `people.updateContact` and `people.createContact` calls, add conflict detection using `etag` from Google API, and add a sync queue for offline changes.

---

## Google Cloud Console Setup Required

Before testing, ensure the Google Cloud project has:
1. **People API enabled** — Go to APIs & Services → Enable "People API"
2. **OAuth consent screen** — Add `contacts.readonly` scope to the consent screen
3. **No additional credentials needed** — the same OAuth client ID/secret used for login works here

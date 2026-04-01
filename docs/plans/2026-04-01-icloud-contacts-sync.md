# iCloud Contacts Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Import contacts from iCloud via CardDAV with duplicate detection before committing to the database.

**Architecture:** Backend `icloudService.ts` uses the `tsdav` library to connect to iCloud CardDAV, fetch vCards, and pipe them through the existing `vcardParser`. A new `icloudMatchingService.ts` adapts the dedup scoring algorithm to compare `ParsedContact[]` against DB contacts. Frontend adds a pre-import review UI with side-by-side match display. Credentials stored encrypted in `user_settings`.

**Tech Stack:** tsdav (CardDAV client), existing vcardParser, deduplicationService scoring patterns, Fastify routes, React + TanStack Query

**Design doc:** `docs/plans/2026-03-31-icloud-contacts-sync-design.md`

---

### Task 1: Install tsdav dependency

**Files:**
- Modify: `backend/package.json`

**Step 1: Install tsdav**

```bash
cd backend && npm install tsdav
```

**Step 2: Verify installation**

```bash
cd backend && node -e "require('tsdav')"
```
Expected: No error

**Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "feat: add tsdav CardDAV client dependency for iCloud sync"
```

---

### Task 2: Add iCloud credential columns to user_settings

**Files:**
- Modify: `backend/src/services/userDatabase.ts` (around line 219-232)

**Step 1: Write the migration**

Add two columns to the `user_settings` table creation in `initializeUserDatabase()`. Since SQLite uses `CREATE TABLE IF NOT EXISTS`, we need `ALTER TABLE` statements wrapped in try/catch for existing databases. Add these after the `INSERT OR IGNORE INTO user_settings` line (~line 232):

```typescript
    // iCloud credentials migration
    try {
      db.exec(`ALTER TABLE user_settings ADD COLUMN icloud_email TEXT`);
    } catch { /* column already exists */ }
    try {
      db.exec(`ALTER TABLE user_settings ADD COLUMN icloud_app_password TEXT`);
    } catch { /* column already exists */ }
```

Also add the columns to the `CREATE TABLE` statement for new databases (after `linkedin_url` on line 227):

```sql
      icloud_email TEXT,
      icloud_app_password TEXT,
```

**Step 2: Verify the migration runs**

```bash
cd backend && npx tsx -e "
  import { getUserDatabase } from './src/services/userDatabase.js';
  const db = getUserDatabase(1);
  const info = db.pragma('table_info(user_settings)');
  console.log(info.map((c: any) => c.name));
"
```
Expected: Array includes `icloud_email` and `icloud_app_password`

**Step 3: Commit**

```bash
git add backend/src/services/userDatabase.ts
git commit -m "feat: add icloud_email and icloud_app_password columns to user_settings"
```

---

### Task 3: Create icloudService.ts — test connection and fetch

**Files:**
- Create: `backend/src/services/icloudService.ts`
- Create: `backend/src/services/__tests__/icloudService.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/__tests__/icloudService.test.ts
import { describe, it, expect } from 'vitest';
import { buildICloudClient, testICloudConnection } from '../icloudService.js';

describe('icloudService', () => {
  it('buildICloudClient returns a DAVClient configured for iCloud', () => {
    const client = buildICloudClient('test@icloud.com', 'xxxx-xxxx-xxxx-xxxx');
    expect(client).toBeDefined();
    // tsdav DAVClient has these properties
    expect(client.serverUrl).toBe('https://contacts.icloud.com');
  });

  it('testICloudConnection rejects with invalid credentials', async () => {
    const result = await testICloudConnection('fake@icloud.com', 'not-a-real-password');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/services/__tests__/icloudService.test.ts
```
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// backend/src/services/icloudService.ts
import { DAVClient, DAVObject } from 'tsdav';
import { parseVcf, type ParsedContact } from './vcardParser.js';

export interface ICloudConnectionResult {
  success: boolean;
  error?: string;
  addressBookCount?: number;
}

export interface ICloudFetchResult {
  contacts: ParsedContact[];
  errors: Array<{ line: number; reason: string }>;
  total: number;
}

/**
 * Create a tsdav DAVClient configured for iCloud CardDAV.
 * Does NOT log in — call client.login() separately.
 */
export function buildICloudClient(email: string, appPassword: string): DAVClient {
  return new DAVClient({
    serverUrl: 'https://contacts.icloud.com',
    credentials: {
      username: email,
      password: appPassword,
    },
    authMethod: 'Basic',
    defaultAccountType: 'carddav',
  });
}

/**
 * Test whether the provided iCloud credentials are valid.
 */
export async function testICloudConnection(
  email: string,
  appPassword: string
): Promise<ICloudConnectionResult> {
  try {
    const client = buildICloudClient(email, appPassword);
    await client.login();
    const addressBooks = await client.fetchAddressBooks();
    return {
      success: true,
      addressBookCount: addressBooks.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Fetch all contacts from iCloud and parse them into ParsedContact[].
 */
export async function fetchICloudContacts(
  email: string,
  appPassword: string
): Promise<ICloudFetchResult> {
  const client = buildICloudClient(email, appPassword);
  await client.login();

  const addressBooks = await client.fetchAddressBooks();
  if (addressBooks.length === 0) {
    return { contacts: [], errors: [], total: 0 };
  }

  // Fetch vCards from all address books
  const allVCards: DAVObject[] = [];
  for (const book of addressBooks) {
    const vcards = await client.fetchVCards({ addressBook: book });
    allVCards.push(...vcards);
  }

  // Combine all vCard data into a single string for the parser
  const vcfContent = allVCards
    .map((obj) => obj.data)
    .filter((data): data is string => typeof data === 'string' && data.includes('BEGIN:VCARD'))
    .join('\n');

  if (!vcfContent) {
    return { contacts: [], errors: [], total: 0 };
  }

  const { contacts, errors } = parseVcf(vcfContent);
  return { contacts, errors, total: contacts.length };
}
```

**Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run src/services/__tests__/icloudService.test.ts
```
Expected: `buildICloudClient` test PASSES, `testICloudConnection` test PASSES (returns `{success: false}` for fake creds)

**Step 5: Commit**

```bash
git add backend/src/services/icloudService.ts backend/src/services/__tests__/icloudService.test.ts
git commit -m "feat: add icloudService with CardDAV client, test connection, and fetch"
```

---

### Task 4: Create icloudMatchingService.ts — match incoming contacts against DB

This is the key new logic: adapt the dedup scoring algorithm to compare `ParsedContact[]` (incoming) against existing DB contacts, rather than DB-vs-DB.

**Files:**
- Create: `backend/src/services/icloudMatchingService.ts`
- Create: `backend/src/services/__tests__/icloudMatchingService.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/__tests__/icloudMatchingService.test.ts
import { describe, it, expect } from 'vitest';
import { matchIncomingContacts, type MatchResult } from '../icloudMatchingService.js';
import type { ParsedContact } from '../vcardParser.js';
import Database from 'better-sqlite3';

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  // Minimal schema for matching
  db.exec(`
    CREATE TABLE contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT, last_name TEXT, display_name TEXT NOT NULL,
      company TEXT, title TEXT, notes TEXT, birthday TEXT,
      photo_hash TEXT, raw_vcard TEXT, archived_at DATETIME
    );
    CREATE TABLE contact_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL, email TEXT NOT NULL,
      type TEXT, is_primary INTEGER DEFAULT 0
    );
    CREATE TABLE contact_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL, phone TEXT NOT NULL,
      phone_display TEXT, country_code TEXT, type TEXT, is_primary INTEGER DEFAULT 0
    );
    CREATE TABLE contact_social_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL, platform TEXT, username TEXT,
      profile_url TEXT, type TEXT
    );
  `);
  return db;
}

function makeParsedContact(overrides: Partial<ParsedContact>): ParsedContact {
  return {
    firstName: null, lastName: null, displayName: 'Test',
    company: null, title: null, notes: null, birthday: null,
    emails: [], phones: [], addresses: [], categories: [],
    instantMessages: [], urls: [], relatedPeople: [], socialProfiles: [],
    photoBase64: null, rawVcard: 'BEGIN:VCARD\nEND:VCARD',
    ...overrides,
  };
}

describe('matchIncomingContacts', () => {
  it('returns all contacts as new when DB is empty', () => {
    const db = createTestDb();
    const incoming = [makeParsedContact({ displayName: 'John Smith' })];
    const result = matchIncomingContacts(db, incoming);
    expect(result.newContacts).toHaveLength(1);
    expect(result.matches).toHaveLength(0);
  });

  it('detects email match as a duplicate', () => {
    const db = createTestDb();
    db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('John Smith');
    db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)').run(1, 'john@example.com', 'home', 1);

    const incoming = [
      makeParsedContact({
        displayName: 'John Smith',
        emails: [{ email: 'john@example.com', type: 'home', isPrimary: true }],
      }),
    ];
    const result = matchIncomingContacts(db, incoming);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].confidence).toBe('medium'); // email + name
    expect(result.matches[0].matchReasons).toContain('email: john@example.com');
    expect(result.newContacts).toHaveLength(0);
  });

  it('detects email + phone match as very_high confidence', () => {
    const db = createTestDb();
    db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Jane Doe');
    db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)').run(1, 'jane@example.com', 'home', 1);
    db.prepare('INSERT INTO contact_phones (contact_id, phone, phone_display, country_code, type, is_primary) VALUES (?, ?, ?, ?, ?, ?)').run(1, '+15551234567', '555-123-4567', 'US', 'cell', 1);

    const incoming = [
      makeParsedContact({
        displayName: 'Jane Doe',
        emails: [{ email: 'jane@example.com', type: 'work', isPrimary: true }],
        phones: [{ phone: '+15551234567', phoneDisplay: '555-123-4567', countryCode: 'US', type: 'cell', isPrimary: true }],
      }),
    ];
    const result = matchIncomingContacts(db, incoming);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].confidence).toBe('very_high');
  });

  it('returns non-matching contacts as new', () => {
    const db = createTestDb();
    db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Existing Person');

    const incoming = [
      makeParsedContact({ displayName: 'Totally Different Person' }),
    ];
    const result = matchIncomingContacts(db, incoming);
    expect(result.newContacts).toHaveLength(1);
    expect(result.matches).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/services/__tests__/icloudMatchingService.test.ts
```
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// backend/src/services/icloudMatchingService.ts
import type { Database as DatabaseType } from 'better-sqlite3';
import type { ParsedContact } from './vcardParser.js';
import { namesMatch } from './nameMatchingService.js';

export interface IncomingMatch {
  incoming: ParsedContact;
  existingContactId: number;
  existingDisplayName: string;
  confidence: 'very_high' | 'high' | 'medium';
  matchReasons: string[];
}

export interface MatchResult {
  newContacts: ParsedContact[];
  matches: IncomingMatch[];
  stats: { total: number; new: number; matched: number };
}

interface DbContactMatchData {
  id: number;
  displayName: string;
  emails: string[];
  phones: string[];
  socials: string[];
}

/**
 * Load existing contact match data from the database.
 * Same pattern as deduplicationService.loadContactMatchData but returns a flat structure.
 */
function loadExistingContacts(db: DatabaseType): DbContactMatchData[] {
  const contactRows = db.prepare(`
    SELECT id, display_name as displayName FROM contacts WHERE archived_at IS NULL
  `).all() as Array<{ id: number; displayName: string }>;

  const contactMap = new Map<number, DbContactMatchData>();
  for (const row of contactRows) {
    contactMap.set(row.id, {
      id: row.id,
      displayName: row.displayName,
      emails: [],
      phones: [],
      socials: [],
    });
  }

  const emailRows = db.prepare(`
    SELECT e.contact_id, LOWER(e.email) as email
    FROM contact_emails e
    JOIN contacts c ON e.contact_id = c.id
    WHERE c.archived_at IS NULL
  `).all() as Array<{ contact_id: number; email: string }>;

  for (const row of emailRows) {
    contactMap.get(row.contact_id)?.emails.push(row.email);
  }

  const phoneRows = db.prepare(`
    SELECT p.contact_id, p.phone
    FROM contact_phones p
    JOIN contacts c ON p.contact_id = c.id
    WHERE p.phone != '' AND c.archived_at IS NULL
  `).all() as Array<{ contact_id: number; phone: string }>;

  for (const row of phoneRows) {
    contactMap.get(row.contact_id)?.phones.push(row.phone);
  }

  const socialRows = db.prepare(`
    SELECT s.contact_id, LOWER(s.platform) || ':' || LOWER(s.username) as social
    FROM contact_social_profiles s
    JOIN contacts c ON s.contact_id = c.id
    WHERE c.archived_at IS NULL
  `).all() as Array<{ contact_id: number; social: string }>;

  for (const row of socialRows) {
    contactMap.get(row.contact_id)?.socials.push(row.social);
  }

  return Array.from(contactMap.values());
}

/**
 * Build inverted indexes from existing contacts for O(1) lookup.
 */
function buildIndexes(existingContacts: DbContactMatchData[]) {
  const emailIndex = new Map<string, number[]>();
  const phoneIndex = new Map<string, number[]>();
  const socialIndex = new Map<string, number[]>();

  for (const contact of existingContacts) {
    for (const email of contact.emails) {
      if (!emailIndex.has(email)) emailIndex.set(email, []);
      emailIndex.get(email)!.push(contact.id);
    }
    for (const phone of contact.phones) {
      if (!phoneIndex.has(phone)) phoneIndex.set(phone, []);
      phoneIndex.get(phone)!.push(contact.id);
    }
    for (const social of contact.socials) {
      if (!socialIndex.has(social)) socialIndex.set(social, []);
      socialIndex.get(social)!.push(contact.id);
    }
  }

  return { emailIndex, phoneIndex, socialIndex };
}

/**
 * Score an incoming ParsedContact against a single existing DB contact.
 */
function scoreMatch(
  incoming: ParsedContact,
  existing: DbContactMatchData,
  indexes: ReturnType<typeof buildIndexes>
): { score: number; reasons: string[]; hasEmail: boolean; hasPhone: boolean; hasSocial: boolean; hasName: boolean } {
  let score = 0;
  const reasons: string[] = [];
  let hasEmail = false;
  let hasPhone = false;
  let hasSocial = false;
  let hasName = false;

  // Email match
  for (const incomingEmail of incoming.emails) {
    const lower = incomingEmail.email.toLowerCase();
    if (existing.emails.includes(lower)) {
      if (!hasEmail) {
        hasEmail = true;
        score += 1;
      }
      reasons.push(`email: ${incomingEmail.email}`);
      break;
    }
  }

  // Phone match
  for (const incomingPhone of incoming.phones) {
    if (existing.phones.includes(incomingPhone.phone)) {
      if (!hasPhone) {
        hasPhone = true;
        score += 1;
      }
      reasons.push(`phone: ${incomingPhone.phoneDisplay || incomingPhone.phone}`);
      break;
    }
  }

  // Social match
  for (const incomingSocial of incoming.socialProfiles) {
    const key = `${(incomingSocial.platform || '').toLowerCase()}:${(incomingSocial.username || '').toLowerCase()}`;
    if (existing.socials.includes(key)) {
      if (!hasSocial) {
        hasSocial = true;
        score += 1;
      }
      reasons.push(`social: ${incomingSocial.platform}/${incomingSocial.username}`);
      break;
    }
  }

  // Name match (using existing namesMatch from nameMatchingService)
  if (namesMatch(incoming.displayName, existing.displayName)) {
    hasName = true;
    score += 1;
    reasons.push(`name: ${incoming.displayName}`);
  }

  return { score, reasons, hasEmail, hasPhone, hasSocial, hasName };
}

/**
 * Determine confidence from match result.
 * Same logic as deduplicationService.determineConfidence.
 */
function determineConfidence(
  match: ReturnType<typeof scoreMatch>
): 'very_high' | 'high' | 'medium' | null {
  if (match.score >= 3) return 'very_high';
  if (match.hasEmail && match.hasPhone) return 'very_high';
  if (match.score >= 2) return 'high';

  const exactMatches = (match.hasEmail ? 1 : 0) + (match.hasPhone ? 1 : 0) + (match.hasSocial ? 1 : 0);
  if (exactMatches >= 1 && match.hasName) return 'medium';

  return null;
}

/**
 * Match an array of incoming ParsedContacts against existing DB contacts.
 * Returns categorized results: new contacts vs. matches with confidence levels.
 */
export function matchIncomingContacts(
  db: DatabaseType,
  incoming: ParsedContact[]
): MatchResult {
  const existingContacts = loadExistingContacts(db);
  const indexes = buildIndexes(existingContacts);
  const existingById = new Map(existingContacts.map(c => [c.id, c]));

  const newContacts: ParsedContact[] = [];
  const matches: IncomingMatch[] = [];

  for (const incomingContact of incoming) {
    // Find all candidate existing contacts that share at least one field
    const candidateIds = new Set<number>();

    for (const email of incomingContact.emails) {
      const ids = indexes.emailIndex.get(email.email.toLowerCase());
      if (ids) ids.forEach(id => candidateIds.add(id));
    }
    for (const phone of incomingContact.phones) {
      const ids = indexes.phoneIndex.get(phone.phone);
      if (ids) ids.forEach(id => candidateIds.add(id));
    }
    for (const social of incomingContact.socialProfiles) {
      const key = `${(social.platform || '').toLowerCase()}:${(social.username || '').toLowerCase()}`;
      const ids = indexes.socialIndex.get(key);
      if (ids) ids.forEach(id => candidateIds.add(id));
    }

    // Score each candidate
    let bestMatch: { existingId: number; confidence: 'very_high' | 'high' | 'medium'; reasons: string[] } | null = null;

    for (const existingId of candidateIds) {
      const existing = existingById.get(existingId)!;
      const matchResult = scoreMatch(incomingContact, existing, indexes);
      const confidence = determineConfidence(matchResult);

      if (confidence !== null) {
        // Keep the best (highest confidence) match
        if (!bestMatch || confidenceRank(confidence) > confidenceRank(bestMatch.confidence)) {
          bestMatch = { existingId, confidence, reasons: matchResult.reasons };
        }
      }
    }

    if (bestMatch) {
      const existing = existingById.get(bestMatch.existingId)!;
      matches.push({
        incoming: incomingContact,
        existingContactId: bestMatch.existingId,
        existingDisplayName: existing.displayName,
        confidence: bestMatch.confidence,
        matchReasons: bestMatch.reasons,
      });
    } else {
      newContacts.push(incomingContact);
    }
  }

  return {
    newContacts,
    matches,
    stats: { total: incoming.length, new: newContacts.length, matched: matches.length },
  };
}

function confidenceRank(c: 'very_high' | 'high' | 'medium'): number {
  return c === 'very_high' ? 3 : c === 'high' ? 2 : 1;
}
```

**Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run src/services/__tests__/icloudMatchingService.test.ts
```
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add backend/src/services/icloudMatchingService.ts backend/src/services/__tests__/icloudMatchingService.test.ts
git commit -m "feat: add icloudMatchingService for detecting duplicates during iCloud import"
```

---

### Task 5: Create iCloud routes — settings, fetch, preview-import, import

**Files:**
- Create: `backend/src/routes/icloud.ts`
- Modify: `backend/src/server.ts` (~line 204, add route registration)

**Step 1: Write the route file**

```typescript
// backend/src/routes/icloud.ts
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getUserDatabase } from '../services/userDatabase.js';
import { encryptToken, decryptToken } from '../services/tokenEncryption.js';
import { testICloudConnection, fetchICloudContacts } from '../services/icloudService.js';
import { matchIncomingContacts } from '../services/icloudMatchingService.js';
import { parseVcf, type ParsedContact } from '../services/vcardParser.js';
import { processPhoto } from '../services/photoProcessor.js';
import { rebuildContactSearch } from '../services/database.js';

export default async function icloudRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {

  // GET /api/icloud/settings — check if iCloud credentials are stored
  fastify.get('/settings', async (request) => {
    const db = getUserDatabase(request.user!.id);
    const row = db.prepare('SELECT icloud_email, icloud_app_password FROM user_settings WHERE id = 1').get() as {
      icloud_email: string | null;
      icloud_app_password: string | null;
    } | undefined;
    return {
      connected: !!(row?.icloud_email && row?.icloud_app_password),
      email: row?.icloud_email || null,
    };
  });

  // POST /api/icloud/settings — save or update iCloud credentials
  fastify.post<{ Body: { email: string; appPassword: string } }>('/settings', async (request, reply) => {
    const { email, appPassword } = request.body;
    if (!email || !appPassword) {
      return reply.status(400).send({ error: 'Email and app-specific password are required' });
    }

    // Test connection before saving
    const test = await testICloudConnection(email, appPassword);
    if (!test.success) {
      return reply.status(400).send({ error: `Connection failed: ${test.error}` });
    }

    const db = getUserDatabase(request.user!.id);
    const encrypted = encryptToken(appPassword);
    db.prepare('UPDATE user_settings SET icloud_email = ?, icloud_app_password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1')
      .run(email, encrypted);

    return { success: true, addressBookCount: test.addressBookCount };
  });

  // DELETE /api/icloud/settings — remove iCloud credentials
  fastify.delete('/settings', async (request) => {
    const db = getUserDatabase(request.user!.id);
    db.prepare('UPDATE user_settings SET icloud_email = NULL, icloud_app_password = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run();
    return { success: true };
  });

  // POST /api/icloud/fetch — fetch all contacts from iCloud
  fastify.post('/fetch', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const db = getUserDatabase(request.user!.id);
    const row = db.prepare('SELECT icloud_email, icloud_app_password FROM user_settings WHERE id = 1').get() as {
      icloud_email: string | null;
      icloud_app_password: string | null;
    } | undefined;

    if (!row?.icloud_email || !row?.icloud_app_password) {
      return reply.status(400).send({ error: 'iCloud credentials not configured. Go to Settings to connect.' });
    }

    const password = decryptToken(row.icloud_app_password);
    if (!password) {
      return reply.status(500).send({ error: 'Failed to decrypt stored credentials. Please re-enter in Settings.' });
    }

    const TIMEOUT_MS = 120_000;
    const result = await Promise.race([
      fetchICloudContacts(row.icloud_email, password),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('iCloud fetch timed out after 120 seconds')), TIMEOUT_MS)
      ),
    ]);

    return result;
  });

  // POST /api/icloud/preview-import — match fetched contacts against existing DB
  fastify.post<{ Body: { contacts: ParsedContact[] } }>('/preview-import', async (request, reply) => {
    const { contacts } = request.body;
    if (!contacts || !Array.isArray(contacts)) {
      return reply.status(400).send({ error: 'contacts array is required' });
    }

    const db = getUserDatabase(request.user!.id);
    const result = matchIncomingContacts(db, contacts);
    return result;
  });

  // POST /api/icloud/import — execute the import with user's merge/skip decisions
  fastify.post<{
    Body: {
      newContacts: ParsedContact[];
      merges: Array<{
        incomingContact: ParsedContact;
        existingContactId: number;
        conflictResolutions?: Record<string, 'incoming' | 'existing'>;
      }>;
      skipped: number;
    };
  }>('/import', async (request, reply) => {
    const { newContacts, merges, skipped } = request.body;
    const db = getUserDatabase(request.user!.id);

    let imported = 0;
    let merged = 0;
    const errors: Array<{ line: number; reason: string }> = [];

    // Prepare statements for new contact insertion (same as importService.ts)
    const insertContact = db.prepare(`
      INSERT INTO contacts (first_name, last_name, display_name, company, title, notes, birthday, photo_hash, raw_vcard)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          contact.company, contact.title, contact.notes, contact.birthday, null, contact.rawVcard
        );
        const contactId = result.lastInsertRowid as number;

        if (contact.photoBase64) {
          try {
            const photoHash = await processPhoto(contact.photoBase64, contactId);
            db.prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?').run(photoHash, contactId);
            db.prepare(`
              INSERT INTO contact_photos (contact_id, source, local_hash, is_primary)
              VALUES (?, 'icloud', ?, 1)
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

        // Apply scalar field resolutions
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
            // Fill in missing field
            db.prepare(`UPDATE contacts SET ${field} = ? WHERE id = ?`).run(incomingVal, existingContactId);
          } else if (incomingVal && existingVal && incomingVal !== existingVal) {
            // Conflict — use resolution if provided
            const resolution = conflictResolutions?.[field];
            if (resolution === 'incoming') {
              db.prepare(`UPDATE contacts SET ${field} = ? WHERE id = ?`).run(incomingVal, existingContactId);
            }
            // 'existing' or no resolution = keep existing
          }
        }

        // Union multi-value fields (skip duplicates)
        // Emails: dedup by LOWER(email)
        const existingEmails = new Set(
          (db.prepare('SELECT LOWER(email) as email FROM contact_emails WHERE contact_id = ?').all(existingContactId) as Array<{ email: string }>)
            .map(r => r.email)
        );
        for (const e of incomingContact.emails) {
          if (!existingEmails.has(e.email.toLowerCase())) {
            insertEmail.run(existingContactId, e.email, e.type, 0); // not primary
          }
        }

        // Phones: dedup by exact phone
        const existingPhones = new Set(
          (db.prepare('SELECT phone FROM contact_phones WHERE contact_id = ?').all(existingContactId) as Array<{ phone: string }>)
            .map(r => r.phone)
        );
        for (const p of incomingContact.phones) {
          if (!existingPhones.has(p.phone)) {
            insertPhone.run(existingContactId, p.phone, p.phoneDisplay, p.countryCode, p.type, 0);
          }
        }

        // Addresses: dedup by street+city+postal
        const existingAddresses = new Set(
          (db.prepare('SELECT street, city, postal_code FROM contact_addresses WHERE contact_id = ?').all(existingContactId) as Array<{ street: string; city: string; postal_code: string }>)
            .map(r => `${(r.street || '').toLowerCase()}|${(r.city || '').toLowerCase()}|${(r.postal_code || '').toLowerCase()}`)
        );
        for (const a of incomingContact.addresses) {
          const key = `${(a.street || '').toLowerCase()}|${(a.city || '').toLowerCase()}|${(a.postalCode || '').toLowerCase()}`;
          if (!existingAddresses.has(key)) {
            insertAddress.run(existingContactId, a.street, a.city, a.state, a.postalCode, a.country, a.type);
          }
        }

        // Social profiles: dedup by platform+username
        const existingSocials = new Set(
          (db.prepare('SELECT LOWER(platform) || \':\' || LOWER(username) as key FROM contact_social_profiles WHERE contact_id = ?').all(existingContactId) as Array<{ key: string }>)
            .map(r => r.key)
        );
        for (const sp of incomingContact.socialProfiles) {
          let username = sp.username || sp.platform;
          const key = `${(sp.platform || '').toLowerCase()}:${(username || '').toLowerCase()}`;
          if (!existingSocials.has(key)) {
            insertSocialProfile.run(existingContactId, sp.platform, username, sp.url, null);
          }
        }

        // Categories
        const existingCategories = new Set(
          (db.prepare('SELECT LOWER(category) as cat FROM contact_categories WHERE contact_id = ?').all(existingContactId) as Array<{ cat: string }>)
            .map(r => r.cat)
        );
        for (const c of incomingContact.categories) {
          if (!existingCategories.has(c.toLowerCase())) {
            insertCategory.run(existingContactId, c);
          }
        }

        // URLs: dedup by url
        const existingUrls = new Set(
          (db.prepare('SELECT LOWER(url) as url FROM contact_urls WHERE contact_id = ?').all(existingContactId) as Array<{ url: string }>)
            .map(r => r.url)
        );
        for (const u of incomingContact.urls) {
          if (!existingUrls.has(u.url.toLowerCase())) {
            insertUrl.run(existingContactId, u.url, u.label, u.type);
          }
        }

        // IMs: dedup by service+handle
        const existingIMs = new Set(
          (db.prepare('SELECT LOWER(service) || \':\' || LOWER(handle) as key FROM contact_instant_messages WHERE contact_id = ?').all(existingContactId) as Array<{ key: string }>)
            .map(r => r.key)
        );
        for (const im of incomingContact.instantMessages) {
          const key = `${(im.service || '').toLowerCase()}:${(im.handle || '').toLowerCase()}`;
          if (!existingIMs.has(key)) {
            insertInstantMessage.run(existingContactId, im.service, im.handle, im.type);
          }
        }

        // Related people
        const existingRelated = new Set(
          (db.prepare('SELECT LOWER(name) || \':\' || LOWER(relationship) as key FROM contact_related_people WHERE contact_id = ?').all(existingContactId) as Array<{ key: string }>)
            .map(r => r.key)
        );
        for (const rp of incomingContact.relatedPeople) {
          const key = `${(rp.name || '').toLowerCase()}:${(rp.relationship || '').toLowerCase()}`;
          if (!existingRelated.has(key)) {
            insertRelatedPerson.run(existingContactId, rp.name, rp.relationship);
          }
        }

        // Photo: only if existing has none
        if (incomingContact.photoBase64) {
          const existingPhoto = existingRow.photo_hash as string | null;
          if (!existingPhoto) {
            try {
              const photoHash = await processPhoto(incomingContact.photoBase64, existingContactId);
              db.prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?').run(photoHash, existingContactId);
              db.prepare(`
                INSERT INTO contact_photos (contact_id, source, local_hash, is_primary)
                VALUES (?, 'icloud', ?, 1)
                ON CONFLICT(contact_id, source) DO UPDATE SET local_hash = excluded.local_hash, fetched_at = CURRENT_TIMESTAMP
              `).run(existingContactId, photoHash);
            } catch { /* skip photo on error */ }
          }
        }

        // Update display_name if it changed
        const updatedFirst = db.prepare('SELECT first_name, last_name FROM contacts WHERE id = ?').get(existingContactId) as { first_name: string | null; last_name: string | null };
        const newDisplayName = [updatedFirst.first_name, updatedFirst.last_name].filter(Boolean).join(' ') || incomingContact.displayName;
        db.prepare('UPDATE contacts SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newDisplayName, existingContactId);

        rebuildContactSearch(db, existingContactId);
        merged++;
      } catch (e) {
        errors.push({ line: merged + 1, reason: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    return { imported, merged, skipped: skipped || 0, errors };
  });
}
```

**Step 2: Register the route in server.ts**

Add after line 204 in `backend/src/server.ts`:

```typescript
import icloudRoutes from './routes/icloud.js';
```

And in the route registration block:

```typescript
await app.register(icloudRoutes, { prefix: '/api/icloud' });
```

**Step 3: Verify the server starts**

```bash
cd backend && npx tsx src/server.ts &
sleep 2 && curl -s http://localhost:3456/health | head -1
kill $(lsof -ti :3456) 2>/dev/null
```
Expected: Health check returns OK

**Step 4: Commit**

```bash
git add backend/src/routes/icloud.ts backend/src/server.ts
git commit -m "feat: add iCloud routes for settings, fetch, preview-import, and import"
```

---

### Task 6: Create frontend TanStack Query hooks

**Files:**
- Create: `frontend/src/api/icloudHooks.ts`

**Step 1: Write the hooks file**

Reference `frontend/src/api/deduplicationHooks.ts` for the pattern.

```typescript
// frontend/src/api/icloudHooks.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { ParsedContact } from './types';

// --- Types ---

export interface ICloudSettings {
  connected: boolean;
  email: string | null;
}

export interface ICloudFetchResult {
  contacts: ParsedContact[];
  errors: Array<{ line: number; reason: string }>;
  total: number;
}

export interface IncomingMatch {
  incoming: ParsedContact;
  existingContactId: number;
  existingDisplayName: string;
  confidence: 'very_high' | 'high' | 'medium';
  matchReasons: string[];
}

export interface MatchResult {
  newContacts: ParsedContact[];
  matches: IncomingMatch[];
  stats: { total: number; new: number; matched: number };
}

export interface ImportDecision {
  newContacts: ParsedContact[];
  merges: Array<{
    incomingContact: ParsedContact;
    existingContactId: number;
    conflictResolutions?: Record<string, 'incoming' | 'existing'>;
  }>;
  skipped: number;
}

export interface ImportResult {
  imported: number;
  merged: number;
  skipped: number;
  errors: Array<{ line: number; reason: string }>;
}

// --- Hooks ---

export function useICloudSettings() {
  return useQuery<ICloudSettings>({
    queryKey: ['icloud', 'settings'],
    queryFn: () => api.get('/api/icloud/settings').then(r => r.data),
  });
}

export function useSaveICloudSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; appPassword: string }) =>
      api.post('/api/icloud/settings', body).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['icloud', 'settings'] });
    },
  });
}

export function useDeleteICloudSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/api/icloud/settings').then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['icloud', 'settings'] });
    },
  });
}

export function useFetchICloudContacts() {
  return useMutation<ICloudFetchResult>({
    mutationFn: () => api.post('/api/icloud/fetch').then(r => r.data),
  });
}

export function usePreviewICloudImport() {
  return useMutation<MatchResult, Error, { contacts: ParsedContact[] }>({
    mutationFn: (body) => api.post('/api/icloud/preview-import', body).then(r => r.data),
  });
}

export function useExecuteICloudImport() {
  const queryClient = useQueryClient();
  return useMutation<ImportResult, Error, ImportDecision>({
    mutationFn: (body) => api.post('/api/icloud/import', body).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
    },
  });
}
```

> **Note:** The `ParsedContact` type may not exist in the frontend types yet. Check `frontend/src/api/types.ts` — if it doesn't exist, add the interface there matching the backend `ParsedContact` shape from `vcardParser.ts`. The key fields needed for the UI are: `displayName`, `firstName`, `lastName`, `company`, `emails`, `phones`, `photoBase64`.

**Step 2: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors (or only pre-existing errors)

**Step 3: Commit**

```bash
git add frontend/src/api/icloudHooks.ts
git commit -m "feat: add TanStack Query hooks for iCloud sync"
```

---

### Task 7: Add iCloud settings section to SettingsView

**Files:**
- Modify: `frontend/src/components/SettingsView.tsx`

**Step 1: Add the iCloud section**

Add state and a collapsible section following the existing pattern (e.g., the "Import VCF" section at lines 137-230). Place it after the Import VCF section.

Key elements:
- `icloudExpanded` state toggle
- Apple ID email input
- App-specific password input (type="password")
- "Connect" button that calls `useSaveICloudSettings` mutation
- Success/error toast feedback
- When connected: show email, "Disconnect" button, and "Import from iCloud" button that navigates to the import review view
- Help text: "Generate an app-specific password at appleid.apple.com → Sign-In and Security → App-Specific Passwords"

Follow the exact collapsible card pattern from the existing sections:

```tsx
const [icloudExpanded, setIcloudExpanded] = useState(false);
const [icloudEmail, setIcloudEmail] = useState('');
const [icloudPassword, setIcloudPassword] = useState('');
```

Use `useICloudSettings()` to check connection status, `useSaveICloudSettings()` to save, `useDeleteICloudSettings()` to disconnect.

**Step 2: Verify it renders**

```bash
cd frontend && npm run dev &
# Open http://localhost:5173/settings in browser, verify the new section appears
kill $(lsof -ti :5173) 2>/dev/null
```

**Step 3: Commit**

```bash
git add frontend/src/components/SettingsView.tsx
git commit -m "feat: add iCloud settings section to SettingsView"
```

---

### Task 8: Create ICloudImportView component — pre-import review UI

**Files:**
- Create: `frontend/src/components/ICloudImportView.tsx`
- Modify: `frontend/src/App.tsx` (or equivalent router file — add route)

**Step 1: Write the component**

This is the largest frontend piece. It has 4 states:

1. **Idle** — "Fetch from iCloud" button
2. **Fetching** — loading spinner with "Connecting to iCloud..."
3. **Reviewing** — the pre-import review screen (summary bar, matches list, new contacts list)
4. **Importing** — progress indicator

Key sub-components within the file:

**MatchCard** — Side-by-side display of incoming vs. existing contact:
- Left: incoming contact name, email, phone, photo (if available)
- Right: existing contact name, email, phone
- Match reason tags (styled badges)
- Action buttons: Merge | Import as New | Skip
- Use the same card styling as `DeduplicationView`

**State management:**
- `fetchedContacts: ParsedContact[]` — result of fetch
- `matchResult: MatchResult | null` — result of preview-import
- `matchDecisions: Map<number, 'merge' | 'new' | 'skip'>` — per-match user decisions (keyed by index)
- `selectedNewContacts: Set<number>` — which new contacts to import (default: all selected)

**Flow:**
1. User clicks "Fetch" → calls `useFetchICloudContacts` → stores result
2. Auto-calls `usePreviewICloudImport` with fetched contacts → stores match result
3. User reviews matches, makes decisions
4. User clicks "Import" → builds `ImportDecision` from decisions → calls `useExecuteICloudImport`
5. Shows result toast and navigates back to contacts

**Step 2: Add route**

Find the router configuration (likely in `App.tsx` or a routes file) and add:

```tsx
<Route path="/icloud-import" element={<ProtectedRoute><ICloudImportView /></ProtectedRoute>} />
```

**Step 3: Verify it renders**

```bash
cd frontend && npm run dev &
# Navigate to /icloud-import, verify the page loads
kill $(lsof -ti :5173) 2>/dev/null
```

**Step 4: Commit**

```bash
git add frontend/src/components/ICloudImportView.tsx frontend/src/App.tsx
git commit -m "feat: add ICloudImportView with pre-import review UI"
```

---

### Task 9: Add CSS styles for iCloud import view

**Files:**
- Modify: `frontend/src/index.css` (or relevant CSS file)

**Step 1: Add styles**

Add styles for the match cards, summary bar, action buttons, and match reason tags. Follow existing patterns — check `DeduplicationView` styles for reference. Key classes:

- `.icloud-import-summary` — summary bar with counts
- `.icloud-match-card` — side-by-side contact comparison
- `.icloud-match-reasons` — tag/badge container for match reasons
- `.icloud-match-actions` — merge/skip/new button group
- `.icloud-new-contacts-list` — scrollable list of new contacts

**Step 2: Verify styling**

Visual check in browser.

**Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add CSS styles for iCloud import view"
```

---

### Task 10: End-to-end testing and cleanup

**Step 1: Run backend tests**

```bash
cd backend && npm test
```
Expected: All tests pass, including the new icloudService and icloudMatchingService tests.

**Step 2: Run frontend type check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No type errors.

**Step 3: Run frontend lint**

```bash
cd frontend && npm run lint
```
Expected: No lint errors.

**Step 4: Manual test flow** (requires real iCloud credentials)

1. Go to Settings → Apple Contacts section
2. Enter Apple ID email and app-specific password
3. Click "Test Connection" — should show success
4. Navigate to iCloud Import
5. Click "Fetch from iCloud" — should show fetched contacts
6. Review matches and new contacts
7. Click "Import" — should show success counts

**Step 5: Update design doc status**

Change status in `docs/plans/2026-03-31-icloud-contacts-sync-design.md` from "Approved" to "Implemented".

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete iCloud contacts sync implementation"
```

---

## Task Dependency Order

```
Task 1 (tsdav) → Task 2 (DB columns) → Task 3 (icloudService) → Task 4 (matchingService) → Task 5 (routes) → Task 6 (hooks) → Task 7 (settings UI) → Task 8 (import UI) → Task 9 (CSS) → Task 10 (testing)
```

Tasks 3 and 4 can run in parallel if desired (no dependency between them). Tasks 6-9 are sequential frontend work.

Plan complete and saved to `docs/plans/2026-04-01-icloud-contacts-sync.md`. Two execution options:

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open a new session with executing-plans, batch execution with checkpoints

Which approach?
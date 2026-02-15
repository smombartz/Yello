# Contact Manager MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a personal contact manager that imports VCF files and displays 10K+ contacts in a fast, searchable virtualized list.

**Architecture:** Fastify backend with SQLite (FTS5 for search), Sharp for photo processing. React frontend with TanStack Virtual for list rendering and TanStack Query for data fetching. Single-page app with slide-in detail panel.

**Tech Stack:** Node.js 20, Fastify 5, better-sqlite3, Sharp, React 18, Vite, TanStack Virtual, TanStack Query, Pico CSS

---

## Stage 1: Backend Foundation

### Task 1.1: Initialize Backend Project

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/src/server.ts`

**Step 1: Create backend directory structure**

```bash
cd "/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude"
mkdir -p backend/src/{routes,services,schemas,types}
```

**Step 2: Initialize package.json**

```bash
cd "/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend"
npm init -y
```

**Step 3: Install dependencies**

```bash
npm install fastify @fastify/static @fastify/multipart @fastify/cors @sinclair/typebox better-sqlite3 sharp ical.js libphonenumber-js
npm install -D typescript @types/node @types/better-sqlite3 tsx
```

**Step 4: Create tsconfig.json**

Create `backend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

**Step 5: Create minimal server entry point**

Create `backend/src/server.ts`:
```typescript
import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/health', async () => {
  return { status: 'ok' };
});

const port = parseInt(process.env.PORT || '3000');
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`Server running on port ${port}`);
});
```

**Step 6: Add npm scripts to package.json**

Update `backend/package.json` scripts:
```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "type": "module"
}
```

**Step 7: Run server to verify**

```bash
npm run dev
```
Expected: Server starts, `http://localhost:3000/health` returns `{"status":"ok"}`

**Step 8: Commit**

```bash
git add .
git commit -m "feat: initialize backend project with Fastify server"
```

---

### Task 1.2: Create Database Service

**Files:**
- Create: `backend/src/services/database.ts`
- Create: `backend/src/types/index.ts`

**Step 1: Write the failing test**

Create `backend/src/services/__tests__/database.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDatabase, closeDatabase } from '../database.js';

describe('database', () => {
  beforeAll(() => {
    process.env.DATABASE_PATH = ':memory:';
  });

  afterAll(() => {
    closeDatabase();
  });

  it('should create contacts table', () => {
    const db = getDatabase();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'").get();
    expect(tables).toBeDefined();
  });

  it('should create FTS5 virtual tables', () => {
    const db = getDatabase();
    const fts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contacts_fts'").get();
    expect(fts).toBeDefined();
  });
});
```

**Step 2: Install vitest**

```bash
npm install -D vitest
```

Add to package.json scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 3: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL - module not found

**Step 4: Create types file**

Create `backend/src/types/index.ts`:
```typescript
export interface Contact {
  id: number;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  photoHash: string | null;
  rawVcard: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactEmail {
  id: number;
  contactId: number;
  email: string;
  type: string | null;
  isPrimary: boolean;
}

export interface ContactPhone {
  id: number;
  contactId: number;
  phone: string;
  phoneDisplay: string;
  type: string | null;
  isPrimary: boolean;
}

export interface ContactAddress {
  id: number;
  contactId: number;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
}

export interface ContactListItem {
  id: number;
  displayName: string;
  company: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  photoUrl: string | null;
}

export interface ContactDetail extends Contact {
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  photoUrl: string | null;
}
```

**Step 5: Create database service**

Create `backend/src/services/database.ts`:
```typescript
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

let db: DatabaseType | null = null;

export function getDatabase(): DatabaseType {
  if (db) return db;

  const dbPath = process.env.DATABASE_PATH || './data/contacts.db';
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT,
      last_name TEXT,
      display_name TEXT NOT NULL,
      company TEXT,
      title TEXT,
      notes TEXT,
      photo_hash TEXT,
      raw_vcard TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      type TEXT,
      is_primary INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS contact_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      phone_display TEXT NOT NULL,
      type TEXT,
      is_primary INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS contact_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      street TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT,
      type TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(
      display_name,
      company,
      content='contacts',
      content_rowid='id',
      tokenize='porter unicode61',
      prefix='2 3'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
      email,
      content='contact_emails',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS contacts_ai AFTER INSERT ON contacts BEGIN
      INSERT INTO contacts_fts(rowid, display_name, company)
      VALUES (new.id, new.display_name, new.company);
    END;

    CREATE TRIGGER IF NOT EXISTS contacts_ad AFTER DELETE ON contacts BEGIN
      INSERT INTO contacts_fts(contacts_fts, rowid, display_name, company)
      VALUES('delete', old.id, old.display_name, old.company);
    END;

    CREATE TRIGGER IF NOT EXISTS contacts_au AFTER UPDATE ON contacts BEGIN
      INSERT INTO contacts_fts(contacts_fts, rowid, display_name, company)
      VALUES('delete', old.id, old.display_name, old.company);
      INSERT INTO contacts_fts(rowid, display_name, company)
      VALUES (new.id, new.display_name, new.company);
    END;

    CREATE TRIGGER IF NOT EXISTS emails_ai AFTER INSERT ON contact_emails BEGIN
      INSERT INTO emails_fts(rowid, email) VALUES (new.id, new.email);
    END;

    CREATE TRIGGER IF NOT EXISTS emails_ad AFTER DELETE ON contact_emails BEGIN
      INSERT INTO emails_fts(emails_fts, rowid, email) VALUES('delete', old.id, old.email);
    END;

    CREATE INDEX IF NOT EXISTS idx_contacts_display_name ON contacts(display_name);
    CREATE INDEX IF NOT EXISTS idx_contacts_last_name ON contacts(last_name, first_name);
    CREATE INDEX IF NOT EXISTS idx_contact_emails_contact_id ON contact_emails(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_phones_contact_id ON contact_phones(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_addresses_contact_id ON contact_addresses(contact_id);
  `);

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

**Step 6: Run test to verify it passes**

```bash
npm test
```
Expected: PASS

**Step 7: Commit**

```bash
git add .
git commit -m "feat: add SQLite database service with FTS5 search"
```

---

### Task 1.3: Create vCard Parser Service

**Files:**
- Create: `backend/src/services/vcardParser.ts`
- Create: `backend/src/services/__tests__/vcardParser.test.ts`

**Step 1: Write the failing test**

Create `backend/src/services/__tests__/vcardParser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseVcf } from '../vcardParser.js';

const VCARD_SIMPLE = `BEGIN:VCARD
VERSION:3.0
FN:John Smith
N:Smith;John;;;
EMAIL;TYPE=work:john@example.com
TEL;TYPE=cell:+1-555-123-4567
END:VCARD`;

const VCARD_MULTI = `BEGIN:VCARD
VERSION:3.0
FN:John Smith
N:Smith;John;;;
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Jane Doe
N:Doe;Jane;;;
END:VCARD`;

describe('vcardParser', () => {
  it('should parse a simple vCard', () => {
    const result = parseVcf(VCARD_SIMPLE);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].displayName).toBe('John Smith');
    expect(result.contacts[0].firstName).toBe('John');
    expect(result.contacts[0].lastName).toBe('Smith');
  });

  it('should parse email addresses', () => {
    const result = parseVcf(VCARD_SIMPLE);
    expect(result.contacts[0].emails).toHaveLength(1);
    expect(result.contacts[0].emails[0].email).toBe('john@example.com');
    expect(result.contacts[0].emails[0].type).toBe('work');
  });

  it('should parse phone numbers', () => {
    const result = parseVcf(VCARD_SIMPLE);
    expect(result.contacts[0].phones).toHaveLength(1);
    expect(result.contacts[0].phones[0].phone).toMatch(/\+1555/);
  });

  it('should parse multiple vCards', () => {
    const result = parseVcf(VCARD_MULTI);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].displayName).toBe('John Smith');
    expect(result.contacts[1].displayName).toBe('Jane Doe');
  });

  it('should handle malformed vCards gracefully', () => {
    const malformed = `BEGIN:VCARD
VERSION:3.0
END:VCARD`;
    const result = parseVcf(malformed);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL - module not found

**Step 3: Create vCard parser**

Create `backend/src/services/vcardParser.ts`:
```typescript
import ICAL from 'ical.js';
import { parsePhoneNumber } from 'libphonenumber-js';

export interface ParsedEmail {
  email: string;
  type: string | null;
  isPrimary: boolean;
}

export interface ParsedPhone {
  phone: string;
  phoneDisplay: string;
  type: string | null;
  isPrimary: boolean;
}

export interface ParsedAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
}

export interface ParsedContact {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  emails: ParsedEmail[];
  phones: ParsedPhone[];
  addresses: ParsedAddress[];
  photoBase64: string | null;
  rawVcard: string;
}

export interface ParseResult {
  contacts: ParsedContact[];
  errors: Array<{ line: number; reason: string }>;
}

function unfoldLines(vcfContent: string): string {
  return vcfContent.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function extractType(params: Record<string, string | string[]> | undefined): string | null {
  if (!params) return null;
  const typeValue = params.type || params.TYPE;
  if (Array.isArray(typeValue)) {
    return typeValue[0]?.toLowerCase() || null;
  }
  return typeValue?.toLowerCase() || null;
}

function parsePhone(rawPhone: string): { phone: string; phoneDisplay: string } {
  try {
    const parsed = parsePhoneNumber(rawPhone, 'US');
    if (parsed) {
      return {
        phone: parsed.format('E.164'),
        phoneDisplay: parsed.formatNational()
      };
    }
  } catch {
    // Fall through to raw value
  }
  const cleaned = rawPhone.replace(/[^\d+]/g, '');
  return { phone: cleaned, phoneDisplay: rawPhone };
}

function parseSingleVcard(vcardText: string): ParsedContact | null {
  const jcalData = ICAL.parse(vcardText);
  const comp = new ICAL.Component(jcalData);

  const fnProp = comp.getFirstPropertyValue('fn');
  const nProp = comp.getFirstProperty('n');

  let displayName = fnProp as string;
  let firstName: string | null = null;
  let lastName: string | null = null;

  if (nProp) {
    const nValue = nProp.getValues();
    if (Array.isArray(nValue) && nValue.length >= 2) {
      lastName = nValue[0] || null;
      firstName = nValue[1] || null;
    }
  }

  if (!displayName) {
    if (firstName || lastName) {
      displayName = [firstName, lastName].filter(Boolean).join(' ');
    } else {
      throw new Error('Missing required FN or N field');
    }
  }

  const emails: ParsedEmail[] = [];
  for (const emailProp of comp.getAllProperties('email')) {
    const email = emailProp.getFirstValue() as string;
    if (email) {
      emails.push({
        email: email.replace(/^mailto:/i, ''),
        type: extractType(emailProp.toJSON()[1]),
        isPrimary: emails.length === 0
      });
    }
  }

  const phones: ParsedPhone[] = [];
  for (const telProp of comp.getAllProperties('tel')) {
    const rawPhone = telProp.getFirstValue() as string;
    if (rawPhone) {
      const { phone, phoneDisplay } = parsePhone(rawPhone.replace(/^tel:/i, ''));
      phones.push({
        phone,
        phoneDisplay,
        type: extractType(telProp.toJSON()[1]),
        isPrimary: phones.length === 0
      });
    }
  }

  const addresses: ParsedAddress[] = [];
  for (const adrProp of comp.getAllProperties('adr')) {
    const adrValue = adrProp.getValues() as string[];
    if (adrValue && adrValue.length > 0) {
      addresses.push({
        street: adrValue[2] || null,
        city: adrValue[3] || null,
        state: adrValue[4] || null,
        postalCode: adrValue[5] || null,
        country: adrValue[6] || null,
        type: extractType(adrProp.toJSON()[1])
      });
    }
  }

  const orgProp = comp.getFirstPropertyValue('org') as string | string[] | null;
  const company = Array.isArray(orgProp) ? orgProp[0] : orgProp;

  const title = comp.getFirstPropertyValue('title') as string | null;
  const notes = comp.getFirstPropertyValue('note') as string | null;

  let photoBase64: string | null = null;
  const photoProp = comp.getFirstProperty('photo');
  if (photoProp) {
    const photoValue = photoProp.getFirstValue() as string;
    if (photoValue) {
      photoBase64 = photoValue.replace(/^data:image\/[^;]+;base64,/i, '');
    }
  }

  return {
    firstName,
    lastName,
    displayName,
    company: company || null,
    title,
    notes,
    emails,
    phones,
    addresses,
    photoBase64,
    rawVcard: vcardText
  };
}

export function parseVcf(vcfContent: string): ParseResult {
  const contacts: ParsedContact[] = [];
  const errors: Array<{ line: number; reason: string }> = [];

  const unfolded = unfoldLines(vcfContent);
  const vcardBlocks = unfolded
    .split(/(?=BEGIN:VCARD)/gi)
    .filter(block => block.trim().length > 0);

  for (let i = 0; i < vcardBlocks.length; i++) {
    const block = vcardBlocks[i].trim();
    if (!block.match(/^BEGIN:VCARD/i)) continue;

    try {
      const parsed = parseSingleVcard(block);
      if (parsed) {
        contacts.push(parsed);
      }
    } catch (e) {
      errors.push({
        line: i + 1,
        reason: e instanceof Error ? e.message : 'Unknown parsing error'
      });
    }
  }

  return { contacts, errors };
}
```

**Step 4: Run test to verify it passes**

```bash
npm test
```
Expected: PASS

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add vCard parser with support for v2.1, 3.0, 4.0"
```

---

### Task 1.4: Create Photo Processor Service

**Files:**
- Create: `backend/src/services/photoProcessor.ts`
- Create: `backend/src/services/__tests__/photoProcessor.test.ts`

**Step 1: Write the failing test**

Create `backend/src/services/__tests__/photoProcessor.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { processPhoto, getPhotoUrl } from '../photoProcessor.js';
import fs from 'fs/promises';
import path from 'path';

const TEST_PHOTOS_PATH = './test-data/photos';

// 1x1 red pixel JPEG as base64
const TINY_JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEQT8AVYCf/9k=';

describe('photoProcessor', () => {
  beforeAll(async () => {
    process.env.PHOTOS_PATH = TEST_PHOTOS_PATH;
    await fs.mkdir(TEST_PHOTOS_PATH, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_PHOTOS_PATH, { recursive: true, force: true });
  });

  it('should process photo and return hash', async () => {
    const hash = await processPhoto(TINY_JPEG, 123);
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it('should create all size variants', async () => {
    const hash = await processPhoto(TINY_JPEG, 456);
    const sizes = ['thumbnail', 'small', 'medium', 'large'];

    for (const size of sizes) {
      const filePath = path.join(TEST_PHOTOS_PATH, size, hash.slice(0, 2), `${hash}.jpg`);
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }
  });

  it('should generate correct photo URL', () => {
    const url = getPhotoUrl('abc123def456', 'thumbnail');
    expect(url).toBe('/photos/thumbnail/ab/abc123def456.jpg');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL - module not found

**Step 3: Create photo processor**

Create `backend/src/services/photoProcessor.ts`:
```typescript
import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const SIZES = [
  { name: 'thumbnail', width: 48, height: 48, quality: 80 },
  { name: 'small', width: 96, height: 96, quality: 82 },
  { name: 'medium', width: 200, height: 200, quality: 85 },
  { name: 'large', width: 400, height: 400, quality: 88 }
] as const;

function getPhotosPath(): string {
  return process.env.PHOTOS_PATH || './data/photos';
}

export async function processPhoto(base64Data: string, contactId: number): Promise<string> {
  const buffer = Buffer.from(base64Data, 'base64');
  const hash = crypto.createHash('md5').update(contactId.toString()).digest('hex');
  const prefix = hash.substring(0, 2);
  const photosPath = getPhotosPath();

  for (const size of SIZES) {
    const dirPath = path.join(photosPath, size.name, prefix);
    await fs.mkdir(dirPath, { recursive: true });

    await sharp(buffer)
      .rotate()
      .resize(size.width, size.height, {
        fit: 'cover',
        position: 'attention'
      })
      .jpeg({
        quality: size.quality,
        mozjpeg: true,
        progressive: true
      })
      .toFile(path.join(dirPath, `${hash}.jpg`));
  }

  return hash;
}

export function getPhotoUrl(
  hash: string | null,
  size: 'thumbnail' | 'small' | 'medium' | 'large' = 'thumbnail'
): string | null {
  if (!hash) return null;
  const prefix = hash.substring(0, 2);
  return `/photos/${size}/${prefix}/${hash}.jpg`;
}
```

**Step 4: Run test to verify it passes**

```bash
npm test
```
Expected: PASS

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add photo processor with Sharp for multiple sizes"
```

---

## Stage 2: API Routes

### Task 2.1: Create Health Check Route

**Files:**
- Create: `backend/src/routes/health.ts`
- Modify: `backend/src/server.ts`

**Step 1: Write the failing test**

Create `backend/src/routes/__tests__/health.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import healthRoutes from '../health.js';

describe('GET /health', () => {
  const app = Fastify();

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    await app.register(healthRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return status ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(typeof body.contacts).toBe('number');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL - module not found

**Step 3: Create health route**

Create `backend/src/routes/health.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { getDatabase } from '../services/database.js';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    const db = getDatabase();
    const result = db.prepare('SELECT COUNT(*) as total FROM contacts').get() as { total: number };
    return { status: 'ok', contacts: result.total };
  });
};

export default healthRoutes;
```

**Step 4: Run test to verify it passes**

```bash
npm test
```
Expected: PASS

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add health check endpoint"
```

---

### Task 2.2: Create Contacts List & Detail Routes

**Files:**
- Create: `backend/src/routes/contacts.ts`
- Create: `backend/src/schemas/contact.ts`

**Step 1: Write the failing test**

Create `backend/src/routes/__tests__/contacts.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import contactRoutes from '../contacts.js';
import { getDatabase, closeDatabase } from '../../services/database.js';

describe('contacts routes', () => {
  const app = Fastify();

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    await app.register(contactRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
  });

  beforeEach(() => {
    const db = getDatabase();
    db.exec('DELETE FROM contacts');
    db.exec('DELETE FROM contact_emails');
    db.exec('DELETE FROM contact_phones');
  });

  describe('GET /api/contacts', () => {
    it('should return empty list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts'
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.contacts).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should return paginated contacts', async () => {
      const db = getDatabase();
      db.prepare('INSERT INTO contacts (display_name, company) VALUES (?, ?)').run('John Smith', 'Acme');
      db.prepare('INSERT INTO contacts (display_name, company) VALUES (?, ?)').run('Jane Doe', 'Corp');

      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts?limit=1'
      });
      const body = JSON.parse(response.body);
      expect(body.contacts).toHaveLength(1);
      expect(body.total).toBe(2);
      expect(body.totalPages).toBe(2);
    });

    it('should search contacts', async () => {
      const db = getDatabase();
      db.prepare('INSERT INTO contacts (display_name, company) VALUES (?, ?)').run('John Smith', 'Acme');
      db.prepare('INSERT INTO contacts (display_name, company) VALUES (?, ?)').run('Jane Doe', 'Corp');

      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts?search=john'
      });
      const body = JSON.parse(response.body);
      expect(body.contacts).toHaveLength(1);
      expect(body.contacts[0].displayName).toBe('John Smith');
    });
  });

  describe('GET /api/contacts/:id', () => {
    it('should return contact detail', async () => {
      const db = getDatabase();
      const result = db.prepare('INSERT INTO contacts (display_name, first_name, last_name) VALUES (?, ?, ?)').run('John Smith', 'John', 'Smith');
      const contactId = result.lastInsertRowid;
      db.prepare('INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)').run(contactId, 'john@example.com', 'work', 1);

      const response = await app.inject({
        method: 'GET',
        url: `/api/contacts/${contactId}`
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.displayName).toBe('John Smith');
      expect(body.emails).toHaveLength(1);
      expect(body.emails[0].email).toBe('john@example.com');
    });

    it('should return 404 for non-existent contact', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts/99999'
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/contacts/count', () => {
    it('should return total count', async () => {
      const db = getDatabase();
      db.prepare('INSERT INTO contacts (display_name) VALUES (?)').run('Test');

      const response = await app.inject({
        method: 'GET',
        url: '/api/contacts/count'
      });
      const body = JSON.parse(response.body);
      expect(body.total).toBe(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL - module not found

**Step 3: Create schema definitions**

Create `backend/src/schemas/contact.ts`:
```typescript
import { Type, Static } from '@sinclair/typebox';

export const ContactListItemSchema = Type.Object({
  id: Type.Number(),
  displayName: Type.String(),
  company: Type.Union([Type.String(), Type.Null()]),
  primaryEmail: Type.Union([Type.String(), Type.Null()]),
  primaryPhone: Type.Union([Type.String(), Type.Null()]),
  photoUrl: Type.Union([Type.String(), Type.Null()])
});

export const ContactListQuerySchema = Type.Object({
  page: Type.Optional(Type.Number({ default: 1 })),
  limit: Type.Optional(Type.Number({ default: 50 })),
  search: Type.Optional(Type.String())
});

export const ContactListResponseSchema = Type.Object({
  contacts: Type.Array(ContactListItemSchema),
  total: Type.Number(),
  page: Type.Number(),
  totalPages: Type.Number()
});

export type ContactListQuery = Static<typeof ContactListQuerySchema>;
```

**Step 4: Create contacts routes**

Create `backend/src/routes/contacts.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { getDatabase } from '../services/database.js';
import { getPhotoUrl } from '../services/photoProcessor.js';
import type { ContactListQuery } from '../schemas/contact.js';

interface ContactRow {
  id: number;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  notes: string | null;
  photo_hash: string | null;
  raw_vcard: string | null;
  created_at: string;
  updated_at: string;
  primary_email?: string | null;
  primary_phone?: string | null;
}

interface EmailRow {
  id: number;
  contact_id: number;
  email: string;
  type: string | null;
  is_primary: number;
}

interface PhoneRow {
  id: number;
  contact_id: number;
  phone: string;
  phone_display: string;
  type: string | null;
  is_primary: number;
}

interface AddressRow {
  id: number;
  contact_id: number;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  type: string | null;
}

const contactRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: ContactListQuery }>('/contacts', async (request) => {
    const { page = 1, limit = 50, search } = request.query;
    const offset = (page - 1) * limit;
    const db = getDatabase();

    let contacts: ContactRow[];
    let total: number;

    if (search && search.trim()) {
      const searchTerms = search.trim().split(/\s+/).map(t => `${t}*`).join(' ');

      contacts = db.prepare(`
        SELECT c.id, c.display_name, c.company, c.photo_hash,
               (SELECT email FROM contact_emails WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_email,
               (SELECT phone_display FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone
        FROM contacts c
        JOIN contacts_fts ON contacts_fts.rowid = c.id
        WHERE contacts_fts MATCH ?
        ORDER BY bm25(contacts_fts)
        LIMIT ? OFFSET ?
      `).all(searchTerms, limit, offset) as ContactRow[];

      const countResult = db.prepare(`
        SELECT COUNT(*) as total
        FROM contacts c
        JOIN contacts_fts ON contacts_fts.rowid = c.id
        WHERE contacts_fts MATCH ?
      `).get(searchTerms) as { total: number };
      total = countResult.total;
    } else {
      contacts = db.prepare(`
        SELECT c.id, c.display_name, c.company, c.photo_hash,
               (SELECT email FROM contact_emails WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_email,
               (SELECT phone_display FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone
        FROM contacts c
        ORDER BY c.last_name, c.first_name, c.display_name
        LIMIT ? OFFSET ?
      `).all(limit, offset) as ContactRow[];

      const countResult = db.prepare('SELECT COUNT(*) as total FROM contacts').get() as { total: number };
      total = countResult.total;
    }

    return {
      contacts: contacts.map(c => ({
        id: c.id,
        displayName: c.display_name,
        company: c.company,
        primaryEmail: c.primary_email || null,
        primaryPhone: c.primary_phone || null,
        photoUrl: getPhotoUrl(c.photo_hash)
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  });

  app.get<{ Params: { id: string } }>('/contacts/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const db = getDatabase();

    const contact = db.prepare(`
      SELECT * FROM contacts WHERE id = ?
    `).get(id) as ContactRow | undefined;

    if (!contact) {
      return reply.code(404).send({ error: 'Contact not found' });
    }

    const emails = db.prepare(`
      SELECT * FROM contact_emails WHERE contact_id = ? ORDER BY is_primary DESC
    `).all(id) as EmailRow[];

    const phones = db.prepare(`
      SELECT * FROM contact_phones WHERE contact_id = ? ORDER BY is_primary DESC
    `).all(id) as PhoneRow[];

    const addresses = db.prepare(`
      SELECT * FROM contact_addresses WHERE contact_id = ?
    `).all(id) as AddressRow[];

    return {
      id: contact.id,
      firstName: contact.first_name,
      lastName: contact.last_name,
      displayName: contact.display_name,
      company: contact.company,
      title: contact.title,
      notes: contact.notes,
      emails: emails.map(e => ({
        email: e.email,
        type: e.type,
        isPrimary: Boolean(e.is_primary)
      })),
      phones: phones.map(p => ({
        phone: p.phone,
        display: p.phone_display,
        type: p.type,
        isPrimary: Boolean(p.is_primary)
      })),
      addresses: addresses.map(a => ({
        street: a.street,
        city: a.city,
        state: a.state,
        postalCode: a.postal_code,
        country: a.country,
        type: a.type
      })),
      photoUrl: getPhotoUrl(contact.photo_hash, 'medium'),
      createdAt: contact.created_at,
      updatedAt: contact.updated_at
    };
  });

  app.get('/contacts/count', async () => {
    const db = getDatabase();
    const result = db.prepare('SELECT COUNT(*) as total FROM contacts').get() as { total: number };
    return { total: result.total };
  });
};

export default contactRoutes;
```

**Step 5: Run test to verify it passes**

```bash
npm test
```
Expected: PASS

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add contacts list and detail API routes"
```

---

### Task 2.3: Create Import Route

**Files:**
- Create: `backend/src/routes/import.ts`
- Create: `backend/src/services/importService.ts`

**Step 1: Write the failing test**

Create `backend/src/routes/__tests__/import.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import importRoutes from '../import.js';
import { getDatabase, closeDatabase } from '../../services/database.js';
import FormData from 'form-data';

const SAMPLE_VCF = `BEGIN:VCARD
VERSION:3.0
FN:John Smith
N:Smith;John;;;
EMAIL;TYPE=work:john@example.com
TEL;TYPE=cell:+15551234567
END:VCARD`;

describe('POST /api/import', () => {
  const app = Fastify();

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.PHOTOS_PATH = './test-data/photos';
    await app.register(fastifyMultipart, { limits: { fileSize: 100 * 1024 * 1024 } });
    await app.register(importRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
  });

  beforeEach(() => {
    const db = getDatabase();
    db.exec('DELETE FROM contacts');
  });

  it('should import contacts from VCF', async () => {
    const form = new FormData();
    form.append('file', Buffer.from(SAMPLE_VCF), {
      filename: 'contacts.vcf',
      contentType: 'text/vcard'
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/import',
      payload: form,
      headers: form.getHeaders()
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.imported).toBe(1);
    expect(body.failed).toBe(0);

    const db = getDatabase();
    const contact = db.prepare('SELECT * FROM contacts WHERE display_name = ?').get('John Smith');
    expect(contact).toBeDefined();
  });
});
```

**Step 2: Install form-data for tests**

```bash
npm install -D form-data
```

**Step 3: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL - module not found

**Step 4: Create import service**

Create `backend/src/services/importService.ts`:
```typescript
import { getDatabase } from './database.js';
import { parseVcf, type ParsedContact } from './vcardParser.js';
import { processPhoto } from './photoProcessor.js';

export interface ImportResult {
  imported: number;
  failed: number;
  photosProcessed: number;
  errors: Array<{ line: number; reason: string }>;
}

export async function importVcf(vcfContent: string): Promise<ImportResult> {
  const { contacts, errors } = parseVcf(vcfContent);
  const db = getDatabase();

  let imported = 0;
  let photosProcessed = 0;

  const insertContact = db.prepare(`
    INSERT INTO contacts (first_name, last_name, display_name, company, title, notes, photo_hash, raw_vcard)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEmail = db.prepare(`
    INSERT INTO contact_emails (contact_id, email, type, is_primary)
    VALUES (?, ?, ?, ?)
  `);

  const insertPhone = db.prepare(`
    INSERT INTO contact_phones (contact_id, phone, phone_display, type, is_primary)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertAddress = db.prepare(`
    INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const importOne = db.transaction(async (contact: ParsedContact) => {
    let photoHash: string | null = null;

    const result = insertContact.run(
      contact.firstName,
      contact.lastName,
      contact.displayName,
      contact.company,
      contact.title,
      contact.notes,
      null,
      contact.rawVcard
    );

    const contactId = result.lastInsertRowid as number;

    if (contact.photoBase64) {
      try {
        photoHash = await processPhoto(contact.photoBase64, contactId);
        db.prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?').run(photoHash, contactId);
        photosProcessed++;
      } catch (e) {
        console.error('Photo processing failed:', e);
      }
    }

    for (const email of contact.emails) {
      insertEmail.run(contactId, email.email, email.type, email.isPrimary ? 1 : 0);
    }

    for (const phone of contact.phones) {
      insertPhone.run(contactId, phone.phone, phone.phoneDisplay, phone.type, phone.isPrimary ? 1 : 0);
    }

    for (const address of contact.addresses) {
      insertAddress.run(
        contactId,
        address.street,
        address.city,
        address.state,
        address.postalCode,
        address.country,
        address.type
      );
    }

    imported++;
  });

  for (const contact of contacts) {
    try {
      await importOne(contact);
    } catch (e) {
      errors.push({
        line: contacts.indexOf(contact) + 1,
        reason: e instanceof Error ? e.message : 'Database insert failed'
      });
    }
  }

  return {
    imported,
    failed: errors.length,
    photosProcessed,
    errors
  };
}
```

**Step 5: Create import route**

Create `backend/src/routes/import.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { importVcf } from '../services/importService.js';

const importRoutes: FastifyPluginAsync = async (app) => {
  app.post('/import', async (request, reply) => {
    const data = await request.file();

    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const filename = data.filename.toLowerCase();
    if (!filename.endsWith('.vcf')) {
      return reply.code(400).send({ error: 'Please upload a .vcf file' });
    }

    const buffer = await data.toBuffer();
    const vcfContent = buffer.toString('utf-8');

    const result = await importVcf(vcfContent);

    return result;
  });
};

export default importRoutes;
```

**Step 6: Run test to verify it passes**

```bash
npm test
```
Expected: PASS

**Step 7: Commit**

```bash
git add .
git commit -m "feat: add VCF import endpoint with photo processing"
```

---

### Task 2.4: Wire Up Full Server

**Files:**
- Modify: `backend/src/server.ts`

**Step 1: Update server to register all routes**

Update `backend/src/server.ts`:
```typescript
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

// Plugins
await app.register(fastifyCors, { origin: true });
await app.register(fastifyMultipart, { limits: { fileSize: 100 * 1024 * 1024 } });

// Static files for photos
const photosPath = process.env.PHOTOS_PATH || './data/photos';
if (!fs.existsSync(photosPath)) {
  fs.mkdirSync(photosPath, { recursive: true });
}
await app.register(fastifyStatic, {
  root: path.resolve(photosPath),
  prefix: '/photos/',
  decorateReply: false
});

// In production, serve frontend static files
if (process.env.NODE_ENV === 'production') {
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/',
    decorateReply: false
  });
}

// Routes
await app.register(import('./routes/health.js'));
await app.register(import('./routes/contacts.js'), { prefix: '/api' });
await app.register(import('./routes/import.js'), { prefix: '/api' });

// Start
const port = parseInt(process.env.PORT || '3000');
await app.listen({ port, host: '0.0.0.0' });
console.log(`Server running on port ${port}`);
```

**Step 2: Create data directory**

```bash
mkdir -p data/photos
```

**Step 3: Run full server test**

```bash
npm run dev
```

Test endpoints:
- `curl http://localhost:3000/health`
- `curl http://localhost:3000/api/contacts`

**Step 4: Commit**

```bash
git add .
git commit -m "feat: wire up complete backend with all routes"
```

---

## Stage 3: Frontend Foundation

### Task 3.1: Initialize Frontend Project

**Files:**
- Create: `frontend/` directory structure
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`

**Step 1: Create frontend with Vite**

```bash
cd "/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude"
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

**Step 2: Install additional dependencies**

```bash
npm install @tanstack/react-virtual @tanstack/react-query @picocss/pico
```

**Step 3: Configure Vite proxy**

Update `frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/photos': 'http://localhost:3000',
      '/health': 'http://localhost:3000'
    }
  }
});
```

**Step 4: Create types**

Create `frontend/src/types/index.ts`:
```typescript
export interface ContactListItem {
  id: number;
  displayName: string;
  company: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  photoUrl: string | null;
}

export interface ContactEmail {
  email: string;
  type: string | null;
  isPrimary: boolean;
}

export interface ContactPhone {
  phone: string;
  display: string;
  type: string | null;
  isPrimary: boolean;
}

export interface ContactAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
}

export interface ContactDetail {
  id: number;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactsResponse {
  contacts: ContactListItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ImportResponse {
  imported: number;
  failed: number;
  photosProcessed: number;
  errors: Array<{ line: number; reason: string }>;
}
```

**Step 5: Create API client**

Create `frontend/src/lib/api.ts`:
```typescript
import type { ContactsResponse, ContactDetail, ImportResponse } from '../types';

const API_BASE = '';

export const api = {
  async getContacts(params: { page?: number; limit?: number; search?: string }): Promise<ContactsResponse> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.search) searchParams.set('search', params.search);

    const response = await fetch(`${API_BASE}/api/contacts?${searchParams}`);
    if (!response.ok) throw new Error('Failed to fetch contacts');
    return response.json();
  },

  async getContact(id: number): Promise<ContactDetail> {
    const response = await fetch(`${API_BASE}/api/contacts/${id}`);
    if (!response.ok) throw new Error('Failed to fetch contact');
    return response.json();
  },

  async importVcf(file: File): Promise<ImportResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/api/import`, {
      method: 'POST',
      body: formData
    });
    if (!response.ok) throw new Error('Failed to import file');
    return response.json();
  },

  async getCount(): Promise<{ total: number }> {
    const response = await fetch(`${API_BASE}/api/contacts/count`);
    if (!response.ok) throw new Error('Failed to fetch count');
    return response.json();
  }
};
```

**Step 6: Run to verify setup**

```bash
npm run dev
```
Expected: Vite dev server starts on port 5173

**Step 7: Commit**

```bash
git add .
git commit -m "feat: initialize frontend with Vite, React, TanStack"
```

---

### Task 3.2: Setup TanStack Query and Base Layout

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/App.css`

**Step 1: Update main.tsx with QueryClient**

Update `frontend/src/main.tsx`:
```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@picocss/pico';
import './App.css';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
```

**Step 2: Create base App layout**

Update `frontend/src/App.tsx`:
```typescript
import { useState } from 'react';

function App() {
  const [search, setSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);

  return (
    <div className="app">
      <header className="container">
        <nav>
          <ul>
            <li><strong>Contact Manager</strong></li>
          </ul>
          <ul>
            <li>
              <input
                type="search"
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </li>
            <li>
              <button onClick={() => setShowImport(true)}>Import</button>
            </li>
          </ul>
        </nav>
      </header>

      <main className="container main-content">
        <p>Contact list will go here</p>
        <p>Search: {search}</p>
        <p>Selected: {selectedContactId}</p>
      </main>

      {showImport && (
        <dialog open>
          <article>
            <header>
              <button aria-label="Close" className="close" onClick={() => setShowImport(false)}></button>
              Import Contacts
            </header>
            <p>Import modal will go here</p>
          </article>
        </dialog>
      )}
    </div>
  );
}

export default App;
```

**Step 3: Create App.css**

Create `frontend/src/App.css`:
```css
:root {
  --app-header-height: 80px;
}

.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

header.container {
  flex-shrink: 0;
  padding-top: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--pico-muted-border-color);
}

header nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

header input[type="search"] {
  margin-bottom: 0;
  min-width: 300px;
}

.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  padding-top: 1rem;
  padding-bottom: 1rem;
}

dialog article {
  width: 500px;
}
```

**Step 4: Delete default Vite files**

```bash
rm frontend/src/index.css frontend/src/App.css.bak 2>/dev/null || true
```

**Step 5: Run to verify**

```bash
npm run dev
```
Expected: Basic layout displays with header, search, import button

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add base layout with header and search"
```

---

### Task 3.3: Create Query Hooks

**Files:**
- Create: `frontend/src/hooks/useContacts.ts`
- Create: `frontend/src/hooks/useImport.ts`

**Step 1: Create contacts hooks**

Create `frontend/src/hooks/useContacts.ts`:
```typescript
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useContacts(search: string) {
  return useInfiniteQuery({
    queryKey: ['contacts', search],
    queryFn: ({ pageParam = 1 }) => api.getContacts({ page: pageParam, limit: 50, search: search || undefined }),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    initialPageParam: 1
  });
}

export function useContact(id: number | null) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () => api.getContact(id!),
    enabled: id !== null
  });
}

export function useContactCount() {
  return useQuery({
    queryKey: ['contactCount'],
    queryFn: () => api.getCount()
  });
}
```

**Step 2: Create import hook**

Create `frontend/src/hooks/useImport.ts`:
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => api.importVcf(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
    }
  });
}
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add TanStack Query hooks for contacts and import"
```

---

## Stage 4: Frontend Components

### Task 4.1: Create Avatar Component

**Files:**
- Create: `frontend/src/components/Avatar.tsx`

**Step 1: Create Avatar component**

Create `frontend/src/components/Avatar.tsx`:
```typescript
interface AvatarProps {
  photoUrl: string | null;
  name: string;
  size?: number;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getColorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 45%)`;
}

export function Avatar({ photoUrl, name, size = 48 }: AvatarProps) {
  const initials = getInitials(name);
  const bgColor = getColorFromName(name);

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover'
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: bgColor,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 600
      }}
    >
      {initials}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add .
git commit -m "feat: add Avatar component with initials fallback"
```

---

### Task 4.2: Create ContactRow Component

**Files:**
- Create: `frontend/src/components/ContactRow.tsx`

**Step 1: Create ContactRow component**

Create `frontend/src/components/ContactRow.tsx`:
```typescript
import { Avatar } from './Avatar';
import type { ContactListItem } from '../types';

interface ContactRowProps {
  contact: ContactListItem;
  style: React.CSSProperties;
  onClick: () => void;
  isSelected: boolean;
}

export function ContactRow({ contact, style, onClick, isSelected }: ContactRowProps) {
  return (
    <div
      className={`contact-row ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={48} />
      <div className="contact-info">
        <div className="contact-name">{contact.displayName}</div>
        <div className="contact-secondary">
          {contact.company && <span className="contact-company">{contact.company}</span>}
          {contact.primaryEmail && <span className="contact-email">{contact.primaryEmail}</span>}
        </div>
      </div>
      {contact.primaryPhone && (
        <div className="contact-phone">{contact.primaryPhone}</div>
      )}
    </div>
  );
}
```

**Step 2: Add styles to App.css**

Add to `frontend/src/App.css`:
```css
.contact-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid var(--pico-muted-border-color);
  transition: background-color 0.1s;
}

.contact-row:hover {
  background-color: var(--pico-secondary-hover-background);
}

.contact-row.selected {
  background-color: var(--pico-primary-background);
}

.contact-info {
  flex: 1;
  min-width: 0;
}

.contact-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-secondary {
  font-size: 0.875rem;
  color: var(--pico-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-secondary span:not(:last-child)::after {
  content: ' · ';
}

.contact-phone {
  font-size: 0.875rem;
  color: var(--pico-muted-color);
  flex-shrink: 0;
}
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add ContactRow component"
```

---

### Task 4.3: Create ContactList with Virtual Scrolling

**Files:**
- Create: `frontend/src/components/ContactList.tsx`

**Step 1: Create ContactList component**

Create `frontend/src/components/ContactList.tsx`:
```typescript
import { useRef, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ContactRow } from './ContactRow';
import type { ContactListItem } from '../types';

interface ContactListProps {
  contacts: ContactListItem[];
  selectedId: number | null;
  onSelect: (contact: ContactListItem) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

export function ContactList({
  contacts,
  selectedId,
  onSelect,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage
}: ContactListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: contacts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 65,
    overscan: 10
  });

  const items = virtualizer.getVirtualItems();

  // Load more when scrolling near the end
  useEffect(() => {
    const lastItem = items[items.length - 1];
    if (!lastItem) return;

    if (
      lastItem.index >= contacts.length - 10 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [items, contacts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (contacts.length === 0) {
    return (
      <div className="empty-state">
        <p>No contacts found</p>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="contact-list-container">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative'
        }}
      >
        {items.map((virtualItem) => {
          const contact = contacts[virtualItem.index];
          return (
            <ContactRow
              key={contact.id}
              contact={contact}
              isSelected={contact.id === selectedId}
              onClick={() => onSelect(contact)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualItem.size,
                transform: `translateY(${virtualItem.start}px)`
              }}
            />
          );
        })}
      </div>
      {isFetchingNextPage && (
        <div className="loading-more">Loading more...</div>
      )}
    </div>
  );
}
```

**Step 2: Add styles to App.css**

Add to `frontend/src/App.css`:
```css
.contact-list-container {
  flex: 1;
  overflow: auto;
  border: 1px solid var(--pico-muted-border-color);
  border-radius: var(--pico-border-radius);
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--pico-muted-color);
}

.loading-more {
  text-align: center;
  padding: 1rem;
  color: var(--pico-muted-color);
}
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add virtualized ContactList component"
```

---

### Task 4.4: Create ContactDetail Panel

**Files:**
- Create: `frontend/src/components/ContactDetail.tsx`

**Step 1: Create ContactDetail component**

Create `frontend/src/components/ContactDetail.tsx`:
```typescript
import { Avatar } from './Avatar';
import { useContact } from '../hooks/useContacts';

interface ContactDetailProps {
  contactId: number;
  onClose: () => void;
}

export function ContactDetail({ contactId, onClose }: ContactDetailProps) {
  const { data: contact, isLoading, error } = useContact(contactId);

  if (isLoading) {
    return (
      <aside className="contact-detail">
        <div className="detail-loading">Loading...</div>
      </aside>
    );
  }

  if (error || !contact) {
    return (
      <aside className="contact-detail">
        <div className="detail-error">Failed to load contact</div>
      </aside>
    );
  }

  const formatAddress = (addr: typeof contact.addresses[0]) => {
    const parts = [addr.street, addr.city, addr.state, addr.postalCode, addr.country]
      .filter(Boolean);
    return parts.join(', ');
  };

  return (
    <aside className="contact-detail">
      <header className="detail-header">
        <button className="close-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="detail-content">
        <div className="detail-avatar">
          <Avatar
            photoUrl={contact.photoUrl}
            name={contact.displayName}
            size={120}
          />
        </div>

        <h2 className="detail-name">{contact.displayName}</h2>

        {(contact.title || contact.company) && (
          <p className="detail-title">
            {contact.title}
            {contact.title && contact.company && ' at '}
            {contact.company}
          </p>
        )}

        {contact.emails.length > 0 && (
          <section className="detail-section">
            <h3>Email</h3>
            {contact.emails.map((email, i) => (
              <div key={i} className="detail-item">
                <a href={`mailto:${email.email}`}>{email.email}</a>
                {email.type && <span className="detail-label">{email.type}</span>}
              </div>
            ))}
          </section>
        )}

        {contact.phones.length > 0 && (
          <section className="detail-section">
            <h3>Phone</h3>
            {contact.phones.map((phone, i) => (
              <div key={i} className="detail-item">
                <a href={`tel:${phone.phone}`}>{phone.display}</a>
                {phone.type && <span className="detail-label">{phone.type}</span>}
              </div>
            ))}
          </section>
        )}

        {contact.addresses.length > 0 && (
          <section className="detail-section">
            <h3>Address</h3>
            {contact.addresses.map((addr, i) => (
              <div key={i} className="detail-item">
                <span>{formatAddress(addr)}</span>
                {addr.type && <span className="detail-label">{addr.type}</span>}
              </div>
            ))}
          </section>
        )}

        {contact.notes && (
          <section className="detail-section">
            <h3>Notes</h3>
            <p className="detail-notes">{contact.notes}</p>
          </section>
        )}
      </div>
    </aside>
  );
}
```

**Step 2: Add styles to App.css**

Add to `frontend/src/App.css`:
```css
.contact-detail {
  width: 400px;
  flex-shrink: 0;
  border-left: 1px solid var(--pico-muted-border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-header {
  display: flex;
  justify-content: flex-end;
  padding: 0.5rem;
  border-bottom: 1px solid var(--pico-muted-border-color);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.5rem;
  line-height: 1;
  color: var(--pico-muted-color);
}

.close-btn:hover {
  color: var(--pico-color);
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.detail-avatar {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
}

.detail-name {
  text-align: center;
  margin-bottom: 0.25rem;
}

.detail-title {
  text-align: center;
  color: var(--pico-muted-color);
  margin-bottom: 1.5rem;
}

.detail-section {
  margin-bottom: 1.5rem;
}

.detail-section h3 {
  font-size: 0.875rem;
  color: var(--pico-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
}

.detail-item a {
  color: var(--pico-primary);
}

.detail-label {
  font-size: 0.75rem;
  color: var(--pico-muted-color);
  background: var(--pico-muted-border-color);
  padding: 0.125rem 0.5rem;
  border-radius: 1rem;
}

.detail-notes {
  white-space: pre-wrap;
  color: var(--pico-muted-color);
}

.detail-loading,
.detail-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--pico-muted-color);
}
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add ContactDetail slide-in panel"
```

---

### Task 4.5: Create Import Modal

**Files:**
- Create: `frontend/src/components/ImportModal.tsx`

**Step 1: Create ImportModal component**

Create `frontend/src/components/ImportModal.tsx`:
```typescript
import { useState, useRef } from 'react';
import { useImport } from '../hooks/useImport';

interface ImportModalProps {
  onClose: () => void;
}

export function ImportModal({ onClose }: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const importMutation = useImport();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    try {
      await importMutation.mutateAsync(selectedFile);
    } catch (error) {
      console.error('Import failed:', error);
    }
  };

  const handleClose = () => {
    if (!importMutation.isPending) {
      onClose();
    }
  };

  return (
    <dialog open>
      <article>
        <header>
          <button
            aria-label="Close"
            className="close"
            onClick={handleClose}
            disabled={importMutation.isPending}
          />
          Import Contacts
        </header>

        {!importMutation.isSuccess ? (
          <>
            <div className="import-dropzone">
              <input
                ref={fileInputRef}
                type="file"
                accept=".vcf"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <button
                className="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importMutation.isPending}
              >
                Select VCF File
              </button>
              {selectedFile && (
                <p className="selected-file">{selectedFile.name}</p>
              )}
            </div>

            {importMutation.isPending && (
              <div className="import-progress">
                <progress />
                <p>Importing contacts...</p>
              </div>
            )}

            {importMutation.isError && (
              <p className="import-error">
                Import failed. Please try again.
              </p>
            )}

            <footer>
              <button
                className="secondary"
                onClick={handleClose}
                disabled={importMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!selectedFile || importMutation.isPending}
              >
                Import
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className="import-success">
              <h3>Import Complete</h3>
              <p><strong>{importMutation.data?.imported}</strong> contacts imported</p>
              {importMutation.data && importMutation.data.photosProcessed > 0 && (
                <p><strong>{importMutation.data.photosProcessed}</strong> photos processed</p>
              )}
              {importMutation.data && importMutation.data.failed > 0 && (
                <p className="import-warning">
                  <strong>{importMutation.data.failed}</strong> entries failed
                </p>
              )}
            </div>
            <footer>
              <button onClick={onClose}>Done</button>
            </footer>
          </>
        )}
      </article>
    </dialog>
  );
}
```

**Step 2: Add styles to App.css**

Add to `frontend/src/App.css`:
```css
.import-dropzone {
  text-align: center;
  padding: 2rem;
  border: 2px dashed var(--pico-muted-border-color);
  border-radius: var(--pico-border-radius);
  margin-bottom: 1rem;
}

.selected-file {
  margin-top: 1rem;
  color: var(--pico-muted-color);
}

.import-progress {
  text-align: center;
  padding: 1rem 0;
}

.import-progress progress {
  width: 100%;
}

.import-error {
  color: var(--pico-del-color);
  text-align: center;
}

.import-success {
  text-align: center;
  padding: 1rem 0;
}

.import-success h3 {
  color: var(--pico-ins-color);
}

.import-warning {
  color: var(--pico-del-color);
}

dialog article footer {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add ImportModal component"
```

---

### Task 4.6: Wire Up Complete App

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Update App.tsx to use all components**

Update `frontend/src/App.tsx`:
```typescript
import { useState, useMemo } from 'react';
import { useContacts, useContactCount } from './hooks/useContacts';
import { ContactList } from './components/ContactList';
import { ContactDetail } from './components/ContactDetail';
import { ImportModal } from './components/ImportModal';
import type { ContactListItem } from './types';

function App() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Debounce search
  const [debounceTimer, setDebounceTimer] = useState<number | null>(null);
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = window.setTimeout(() => {
      setDebouncedSearch(value);
    }, 200);
    setDebounceTimer(timer);
  };

  const {
    data,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage
  } = useContacts(debouncedSearch);

  const { data: countData } = useContactCount();

  const contacts = useMemo(() => {
    return data?.pages.flatMap(page => page.contacts) ?? [];
  }, [data]);

  const handleSelectContact = (contact: ContactListItem) => {
    setSelectedContactId(contact.id);
  };

  const handleCloseDetail = () => {
    setSelectedContactId(null);
  };

  return (
    <div className="app">
      <header className="container">
        <nav>
          <ul>
            <li>
              <strong>Contact Manager</strong>
              {countData && (
                <span className="contact-count">{countData.total.toLocaleString()} contacts</span>
              )}
            </li>
          </ul>
          <ul>
            <li>
              <input
                type="search"
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </li>
            <li>
              <button onClick={() => setShowImport(true)}>Import</button>
            </li>
          </ul>
        </nav>
      </header>

      <main className="container main-content">
        {isLoading && contacts.length === 0 ? (
          <div className="loading-state">Loading contacts...</div>
        ) : error ? (
          <div className="error-state">Failed to load contacts</div>
        ) : contacts.length === 0 && !debouncedSearch ? (
          <div className="empty-state">
            <p>No contacts yet.</p>
            <button onClick={() => setShowImport(true)}>Import a VCF file to get started</button>
          </div>
        ) : (
          <ContactList
            contacts={contacts}
            selectedId={selectedContactId}
            onSelect={handleSelectContact}
            hasNextPage={hasNextPage ?? false}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
          />
        )}

        {selectedContactId && (
          <ContactDetail
            contactId={selectedContactId}
            onClose={handleCloseDetail}
          />
        )}
      </main>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}

export default App;
```

**Step 2: Add remaining styles to App.css**

Add to `frontend/src/App.css`:
```css
.contact-count {
  font-weight: normal;
  font-size: 0.875rem;
  color: var(--pico-muted-color);
  margin-left: 0.5rem;
}

.loading-state,
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--pico-muted-color);
}

.error-state {
  color: var(--pico-del-color);
}

.main-content .empty-state {
  flex-direction: column;
  flex: 1;
}
```

**Step 3: Run both backend and frontend**

Terminal 1:
```bash
cd backend && npm run dev
```

Terminal 2:
```bash
cd frontend && npm run dev
```

**Step 4: Test the app**

- Visit `http://localhost:5173`
- Click Import, select a VCF file
- Verify contacts appear in list
- Click a contact to see detail
- Search for contacts

**Step 5: Commit**

```bash
git add .
git commit -m "feat: wire up complete frontend application"
```

---

## Stage 5: Deployment

### Task 5.1: Create Production Build Configuration

**Files:**
- Create: `Dockerfile`
- Create: `railway.toml`
- Modify: `backend/src/server.ts`

**Step 1: Update server for production static file serving**

Update `backend/src/server.ts` to handle SPA routing:
```typescript
// After all other routes, add catch-all for SPA
if (process.env.NODE_ENV === 'production') {
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api') || request.url.startsWith('/photos')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
}
```

**Step 2: Create Dockerfile**

Create `Dockerfile` in project root:
```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --only=production

# Frontend dependencies and build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Backend source
COPY backend/ ./backend/
RUN cd backend && npm run build

# Move frontend build to backend public
RUN mv frontend/dist backend/public

# Create data directory
RUN mkdir -p /data/photos

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/contacts.db
ENV PHOTOS_PATH=/data/photos

EXPOSE 3000

CMD ["node", "backend/dist/server.js"]
```

**Step 3: Create railway.toml**

Create `railway.toml` in project root:
```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"

[[mounts]]
source = "contacts_data"
destination = "/data"
```

**Step 4: Test Docker build locally**

```bash
docker build -t contact-manager .
docker run -p 3000:3000 -v $(pwd)/data:/data contact-manager
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add Docker and Railway deployment configuration"
```

---

### Task 5.2: Deploy to Railway

**Step 1: Create Railway project**

1. Go to https://railway.app
2. Create new project
3. Connect GitHub repository

**Step 2: Configure persistent volume**

1. In Railway dashboard, go to project settings
2. Add volume:
   - Name: `contacts_data`
   - Mount path: `/data`
   - Size: 1GB

**Step 3: Deploy**

1. Push to main branch
2. Railway will automatically build and deploy
3. Verify health check at `https://<your-app>.railway.app/health`

**Step 4: Test production deployment**

- Visit production URL
- Import a VCF file
- Verify contacts display correctly
- Test search functionality
- Verify photos display

**Step 5: Commit any final fixes**

```bash
git add .
git commit -m "chore: finalize deployment configuration"
```

---

## Summary

This plan covers:

1. **Stage 1: Backend Foundation** (Tasks 1.1-1.4)
   - Project setup with TypeScript/Fastify
   - SQLite database with FTS5 search
   - vCard parser supporting v2.1, 3.0, 4.0
   - Photo processor with Sharp

2. **Stage 2: API Routes** (Tasks 2.1-2.4)
   - Health check endpoint
   - Contacts list with pagination and search
   - Contact detail endpoint
   - VCF import endpoint

3. **Stage 3: Frontend Foundation** (Tasks 3.1-3.3)
   - Vite/React/TypeScript setup
   - TanStack Query integration
   - API client and hooks

4. **Stage 4: Frontend Components** (Tasks 4.1-4.6)
   - Avatar with initials fallback
   - ContactRow component
   - Virtualized ContactList
   - ContactDetail panel
   - ImportModal

5. **Stage 5: Deployment** (Tasks 5.1-5.2)
   - Docker configuration
   - Railway deployment with persistent volume

Each task follows TDD with explicit test-first steps, exact file paths, complete code, and verification commands.

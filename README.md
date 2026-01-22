# Contact Manager — Claude Code README

A personal contact manager that imports VCF files and displays contacts in a fast, searchable list. Designed for 10K+ contacts with photos.

## Quick Start

```bash
# Clone and install
git clone <repo>
cd contact-manager

# Backend
cd backend
npm install
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Backend runs on `http://localhost:3000`, frontend on `http://localhost:5173`.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TanStack Virtual, TanStack Query, Pico CSS |
| Backend | Node.js 20, Fastify 5, better-sqlite3, Sharp |
| Database | SQLite with FTS5 |
| Deployment | Railway with persistent volume |

---

## Project Structure

```
contact-manager/
├── backend/
│   ├── src/
│   │   ├── server.ts              # Fastify app entry point
│   │   ├── routes/
│   │   │   ├── contacts.ts        # GET /api/contacts, GET /api/contacts/:id
│   │   │   ├── import.ts          # POST /api/import
│   │   │   └── health.ts          # GET /health
│   │   ├── services/
│   │   │   ├── database.ts        # SQLite setup, queries, FTS5
│   │   │   ├── vcardParser.ts     # VCF parsing with ical.js
│   │   │   └── photoProcessor.ts  # Sharp image pipeline
│   │   ├── schemas/
│   │   │   └── contact.ts         # Typebox validation schemas
│   │   └── types/
│   │       └── index.ts           # TypeScript interfaces
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx               # React entry point
│   │   ├── App.tsx                # Main app with layout
│   │   ├── components/
│   │   │   ├── ContactList.tsx    # Virtualized list
│   │   │   ├── ContactRow.tsx     # Single contact row
│   │   │   ├── ContactDetail.tsx  # Detail slide-in panel
│   │   │   ├── SearchBox.tsx      # Search input
│   │   │   ├── ImportModal.tsx    # File upload modal
│   │   │   ├── Avatar.tsx         # Photo with initials fallback
│   │   │   └── EmptyState.tsx     # No contacts / no results
│   │   ├── hooks/
│   │   │   ├── useContacts.ts     # TanStack Query hooks
│   │   │   └── useImport.ts       # Import mutation hook
│   │   ├── lib/
│   │   │   └── api.ts             # Fetch wrapper
│   │   └── types/
│   │       └── index.ts           # Shared types
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── railway.toml
├── PRD.md
└── README.md
```

---

## Implementation Guide

### Phase 1: Backend Setup

**1.1 Initialize backend project**

```bash
mkdir -p backend/src/{routes,services,schemas,types}
cd backend
npm init -y
npm install fastify @fastify/static @fastify/multipart @fastify/cors @sinclair/typebox better-sqlite3 sharp ical.js libphonenumber-js
npm install -D typescript @types/node @types/better-sqlite3 tsx
```

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

**1.2 Create database service (`src/services/database.ts`)**

Initialize SQLite with schema:

```typescript
import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_PATH || './data/contacts.db';
const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// Create tables
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

  -- FTS5 for contact search
  CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(
    display_name,
    company,
    content='contacts',
    content_rowid='id',
    tokenize='porter unicode61',
    prefix='2 3'
  );

  -- FTS5 for email search  
  CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
    email,
    content='contact_emails',
    content_rowid='id'
  );

  -- Triggers to keep FTS in sync
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

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_contacts_display_name ON contacts(display_name);
  CREATE INDEX IF NOT EXISTS idx_contact_emails_contact_id ON contact_emails(contact_id);
  CREATE INDEX IF NOT EXISTS idx_contact_phones_contact_id ON contact_phones(contact_id);
  CREATE INDEX IF NOT EXISTS idx_contact_addresses_contact_id ON contact_addresses(contact_id);
`);

export { db };
```

**1.3 Create Fastify server (`src/server.ts`)**

```typescript
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import path from 'path';

const app = Fastify({ logger: true });

// Plugins
await app.register(fastifyCors, { origin: true });
await app.register(fastifyMultipart, { limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB

// Static files for photos
const photosPath = process.env.PHOTOS_PATH || './data/photos';
await app.register(fastifyStatic, {
  root: path.resolve(photosPath),
  prefix: '/photos/',
  decorateReply: false
});

// Routes
await app.register(import('./routes/health.js'));
await app.register(import('./routes/contacts.js'), { prefix: '/api' });
await app.register(import('./routes/import.js'), { prefix: '/api' });

// Start
const port = parseInt(process.env.PORT || '3000');
await app.listen({ port, host: '0.0.0.0' });
```

**1.4 Create vCard parser (`src/services/vcardParser.ts`)**

Key implementation notes:
- Use `ical.js` to parse vCard data
- Handle VERSION 2.1, 3.0, and 4.0
- Extract N (structured name) and FN (formatted name)
- Parse TEL, EMAIL, ADR with TYPE parameters
- Extract PHOTO as base64 data
- Use `libphonenumber-js` to normalize phone numbers to E.164

```typescript
import ICAL from 'ical.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

interface ParsedContact {
  firstName?: string;
  lastName?: string;
  displayName: string;
  company?: string;
  title?: string;
  notes?: string;
  emails: Array<{ email: string; type?: string; isPrimary: boolean }>;
  phones: Array<{ phone: string; phoneDisplay: string; type?: string; isPrimary: boolean }>;
  addresses: Array<{ street?: string; city?: string; state?: string; postalCode?: string; country?: string; type?: string }>;
  photoBase64?: string;
  rawVcard: string;
}

export function parseVcf(vcfContent: string): { contacts: ParsedContact[]; errors: Array<{ line: number; reason: string }> } {
  const contacts: ParsedContact[] = [];
  const errors: Array<{ line: number; reason: string }> = [];
  
  // Split into individual vCards
  const vcardBlocks = vcfContent.split(/(?=BEGIN:VCARD)/gi).filter(block => block.trim());
  
  for (let i = 0; i < vcardBlocks.length; i++) {
    try {
      const parsed = parseSingleVcard(vcardBlocks[i]);
      if (parsed) contacts.push(parsed);
    } catch (e) {
      errors.push({ line: i + 1, reason: e instanceof Error ? e.message : 'Unknown error' });
    }
  }
  
  return { contacts, errors };
}

function parseSingleVcard(vcardText: string): ParsedContact | null {
  // Implementation using ICAL.js
  // ... parse N, FN, TEL, EMAIL, ADR, ORG, TITLE, NOTE, PHOTO
}
```

**1.5 Create photo processor (`src/services/photoProcessor.ts`)**

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
];

const photosPath = process.env.PHOTOS_PATH || './data/photos';

export async function processPhoto(base64Data: string, contactId: number): Promise<string> {
  const buffer = Buffer.from(base64Data, 'base64');
  const hash = crypto.createHash('md5').update(contactId.toString()).digest('hex');
  const prefix = hash.substring(0, 2);
  
  for (const size of SIZES) {
    const dirPath = path.join(photosPath, size.name, prefix);
    await fs.mkdir(dirPath, { recursive: true });
    
    await sharp(buffer)
      .rotate() // Auto-rotate based on EXIF
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
```

---

### Phase 2: API Routes

**2.1 Health check (`src/routes/health.ts`)**

```typescript
import { FastifyPluginAsync } from 'fastify';
import { db } from '../services/database.js';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    const { total } = db.prepare('SELECT COUNT(*) as total FROM contacts').get() as { total: number };
    return { status: 'ok', contacts: total };
  });
};

export default healthRoutes;
```

**2.2 Contact routes (`src/routes/contacts.ts`)**

Implement:
- `GET /api/contacts` — Paginated list with search
- `GET /api/contacts/:id` — Single contact with all related data
- `GET /api/contacts/count` — Total count

For search, use FTS5:
```sql
SELECT c.id, c.display_name, c.company, c.photo_hash,
       (SELECT email FROM contact_emails WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_email,
       (SELECT phone_display FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone
FROM contacts c
JOIN contacts_fts ON contacts_fts.rowid = c.id
WHERE contacts_fts MATCH ?
ORDER BY bm25(contacts_fts)
LIMIT ? OFFSET ?
```

**2.3 Import route (`src/routes/import.ts`)**

- Accept multipart file upload
- Parse VCF content
- Process photos
- Insert contacts in transaction
- Return summary

---

### Phase 3: Frontend Setup

**3.1 Initialize frontend**

```bash
mkdir frontend
cd frontend
npm create vite@latest . -- --template react-ts
npm install @tanstack/react-virtual @tanstack/react-query @picocss/pico
```

Configure Vite proxy in `vite.config.ts`:
```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/photos': 'http://localhost:3000'
    }
  }
});
```

**3.2 Setup TanStack Query (`src/main.tsx`)**

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@picocss/pico';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
```

**3.3 Create API hooks (`src/hooks/useContacts.ts`)**

```typescript
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useContacts(search: string) {
  return useInfiniteQuery({
    queryKey: ['contacts', search],
    queryFn: ({ pageParam = 1 }) => api.getContacts({ page: pageParam, search }),
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
```

**3.4 Create ContactList with virtual scrolling (`src/components/ContactList.tsx`)**

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

export function ContactList({ contacts, onSelect }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: contacts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // Row height
    overscan: 5
  });

  return (
    <div ref={parentRef} style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <ContactRow
            key={virtualItem.key}
            contact={contacts[virtualItem.index]}
            style={{
              position: 'absolute',
              top: virtualItem.start,
              height: virtualItem.size,
              width: '100%'
            }}
            onClick={() => onSelect(contacts[virtualItem.index])}
          />
        ))}
      </div>
    </div>
  );
}
```

---

### Phase 4: Deployment

**4.1 Create Dockerfile**

```dockerfile
FROM node:20-slim

# Sharp requires these for image processing
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

# Move frontend build to backend static
RUN mv frontend/dist backend/public

# Create data directory
RUN mkdir -p /data/photos

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/contacts.db
ENV PHOTOS_PATH=/data/photos

EXPOSE 3000

CMD ["node", "backend/dist/server.js"]
```

**4.2 Create railway.toml**

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

**4.3 Railway setup steps**

1. Create new project in Railway dashboard
2. Connect GitHub repository
3. Add persistent volume:
   - Name: `contacts_data`
   - Mount path: `/data`
   - Size: 1GB
4. Deploy

---

## Key Implementation Notes

### vCard Parsing Edge Cases

- **Quoted-printable encoding**: vCard 2.1/3.0 may use `=C3=BC` for UTF-8. Decode before processing.
- **Line folding**: Lines starting with whitespace continue the previous line. Unfold first.
- **Missing FN field**: Fall back to `N` field, construct display name as "First Last".
- **Multiple values**: TEL, EMAIL, ADR can appear multiple times. First of each type becomes primary.
- **Type parameters**: Can be `TYPE=work` or `TYPE=work,voice` or `work` (shorthand).

### Search Implementation

Use prefix search for type-ahead:
```typescript
const searchTerm = query.trim().split(/\s+/).map(t => `${t}*`).join(' ');
// "john sm" → "john* sm*"
```

For email search, search both FTS tables and UNION results.

### Photo URL Construction

```typescript
const photoUrl = contact.photoHash 
  ? `/photos/thumbnail/${contact.photoHash.slice(0, 2)}/${contact.photoHash}.jpg`
  : null;
```

### Error Handling

- Wrap database writes in transactions
- Log parse errors but continue import
- Return partial success with error details
- Frontend shows toast for errors, doesn't block UI

---

## Testing

**Manual testing checklist:**

- [ ] Import single-contact VCF
- [ ] Import multi-contact VCF (1000+ contacts)
- [ ] Import VCF with photos
- [ ] Import VCF with malformed entries (should skip, not crash)
- [ ] Search by name, email, company
- [ ] Search with partial match ("joh" finds "John")
- [ ] Scroll through 10K contacts smoothly
- [ ] View contact detail
- [ ] Click email/phone links
- [ ] Empty state displays correctly
- [ ] Works after Railway deploy

**Test VCF files:**

Create test files with:
- vCard 2.1, 3.0, 4.0 formats
- Embedded photos
- International characters (UTF-8)
- Multiple emails/phones per contact
- Missing optional fields
- Malformed entries (missing END:VCARD, etc.)

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Sharp fails to install | Ensure libvips is installed: `apt-get install libvips-dev` |
| FTS5 not available | Use official SQLite, not system version. better-sqlite3 bundles it. |
| Photos not displaying | Check PHOTOS_PATH env var, verify directory permissions |
| Search returns nothing | Ensure FTS triggers fired on insert. Rebuild FTS if needed. |
| Railway volume empty after deploy | Volume data persists, but ensure mount path matches Dockerfile |

---

## Future Enhancements (Post-MVP)

- [ ] Contact editing
- [ ] Duplicate detection (Jaro-Winkler)
- [ ] Google Contacts sync
- [ ] iCloud sync (CardDAV)
- [ ] Tags/groups
- [ ] Export to VCF/CSV
- [ ] Activity log / notes per contact

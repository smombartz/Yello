# Multi-Database Support — Separate SQLite Databases for Message Sources

**Status:** Draft
**Date:** 2026-02-15

## Overview

Add the ability to use multiple SQLite databases: the existing `contacts.db` remains the primary database, while separate databases store large, append-heavy data from different sources — Gmail email subjects, iMessage texts, and WhatsApp messages. All databases are attached to a single `better-sqlite3` connection using SQLite's `ATTACH DATABASE`, enabling cross-database queries while keeping storage and maintenance independent.

## Motivation

- **Size isolation.** A user with 200K emails and years of iMessage history could easily generate multi-GB message databases. Keeping them separate from the 50 MB contacts database means backups, vacuums, and copies are fast for each.
- **Independent lifecycle.** Email history can be re-synced from Gmail, iMessage can be re-imported from `chat.db`, and WhatsApp can be re-imported from export files — all without touching other data.
- **Organizational clarity.** Each database has a focused schema, separate migrations, and can be deleted/replaced independently.
- **Reduced WAL contention.** Each database file has its own WAL. Heavy inserts to message databases don't block contact reads.

---

## Architecture

### Database Layout

```
data/
├── contacts.db          # Main database (existing) — contacts, auth, settings, FTS
├── messages/
│   ├── gmail.db         # Email subjects and metadata from Gmail API
│   ├── imessage.db      # iMessage/SMS text messages from chat.db import
│   └── whatsapp.db      # WhatsApp messages from export import
└── photos/              # Existing photo storage
```

### How ATTACH Works

SQLite `ATTACH DATABASE` opens additional database files on the same connection. Tables are accessed with a schema prefix:

```sql
ATTACH DATABASE '/data/messages/gmail.db' AS gmail;
ATTACH DATABASE '/data/messages/imessage.db' AS imessage;
ATTACH DATABASE '/data/messages/whatsapp.db' AS whatsapp;

-- Cross-database query
SELECT c.display_name, g.subject, g.date
FROM main.contacts c
JOIN gmail.messages g ON g.contact_id = c.id
ORDER BY g.date DESC;
```

`better-sqlite3` supports this natively — no new dependencies.

### Limitations to Handle

| Limitation | Mitigation |
|-----------|-----------|
| No cross-database foreign keys | Application-level orphan cleanup on contact delete |
| No cross-database triggers | Application-level FTS rebuild when message data changes |
| Cross-database transactions not fully atomic on crash | Acceptable — message data is re-importable from source |
| FTS5 tables can't span databases | Unified search table in `main` that aggregates from all sources |
| Max 10 attached databases (default) | We'll use 3-4, well within limit |

---

## Phase 1: Database Manager Service

### New file: `backend/src/services/databaseManager.ts`

Central service that manages the lifecycle of attached databases. Replaces direct `ATTACH`/`DETACH` calls scattered across the codebase.

```typescript
interface AttachedDatabase {
  name: string;           // Schema name: 'gmail', 'imessage', 'whatsapp'
  filePath: string;       // Absolute path to .db file
  displayName: string;    // "Gmail Emails", "iMessage", "WhatsApp"
  source: string;         // Data source identifier
  initSchema: (db: DatabaseType) => void;  // Creates tables/indexes for this db
  runMigrations: (db: DatabaseType) => void;
}

// Registry of known database sources
const DATABASE_REGISTRY: AttachedDatabase[] = [ ... ];
```

**Core functions:**

```typescript
// Initialize: attach all existing message databases on startup
export function initializeMessageDatabases(): void

// Attach a specific database (creates file + schema if new)
export function attachDatabase(name: string): void

// Detach a database (e.g., before deleting the file)
export function detachDatabase(name: string): void

// Get list of currently attached databases with stats
export function getAttachedDatabases(): DatabaseInfo[]

// Check if a database is attached
export function isDatabaseAttached(name: string): boolean

// Delete a message database entirely (detach + remove file)
export function removeDatabase(name: string): void
```

**Startup integration in `getDatabase()`:**

After the existing initialization in `database.ts`, call `initializeMessageDatabases()`. This scans the `data/messages/` directory for known `.db` files and attaches any that exist. Databases that don't exist yet are not created until data is first imported.

### Per-Database Pragma Setup

Each attached database needs its own WAL mode and settings:

```typescript
function attachDatabase(name: string): void {
  const db = getDatabase();
  const info = DATABASE_REGISTRY.find(d => d.name === name);

  // Create directory if needed
  ensureDir(path.dirname(info.filePath));

  // Attach
  db.exec(`ATTACH DATABASE '${info.filePath}' AS ${name}`);

  // Set pragmas per-database
  db.pragma(`${name}.journal_mode = WAL`);

  // Initialize schema
  info.initSchema(db);

  // Run migrations
  info.runMigrations(db);
}
```

### Per-Database Migration Tracking

Each message database stores its own schema version:

```sql
-- Created in every message database
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO schema_version (rowid, version) VALUES (1, 1);
```

Migrations check and increment this version:

```typescript
function runMigrations(db: DatabaseType, schemaName: string): void {
  const current = db.prepare(
    `SELECT version FROM ${schemaName}.schema_version WHERE rowid = 1`
  ).get() as { version: number };

  if (current.version < 2) {
    // Run v2 migration...
    db.prepare(
      `UPDATE ${schemaName}.schema_version SET version = 2, updated_at = datetime('now') WHERE rowid = 1`
    ).run();
  }
}
```

---

## Phase 2: Message Database Schemas

All three message databases share a common base schema with source-specific extensions.

### Gmail Database (`gmail.db`)

```sql
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL,            -- references main.contacts.id
  gmail_message_id TEXT NOT NULL UNIQUE,   -- dedup key
  thread_id TEXT NOT NULL,
  subject TEXT,
  date TEXT NOT NULL,                      -- ISO 8601
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
  snippet TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_gmail_messages_contact ON messages(contact_id, date DESC);
CREATE INDEX idx_gmail_messages_gmail_id ON messages(gmail_message_id);
CREATE INDEX idx_gmail_messages_date ON messages(date);
```

**Migration from existing `contact_emails_history`:**

The existing `contact_emails_history` table in `contacts.db` will be migrated to `gmail.db`. A one-time migration copies data, then drops the old table:

```typescript
function migrateGmailHistory(db: DatabaseType): void {
  const oldCount = db.prepare(
    'SELECT COUNT(*) as c FROM main.contact_emails_history'
  ).get() as { c: number };

  if (oldCount.c > 0) {
    db.exec(`
      INSERT OR IGNORE INTO gmail.messages
        (contact_id, gmail_message_id, thread_id, subject, date, direction, snippet, synced_at)
      SELECT contact_id, gmail_message_id, thread_id, subject, date, direction, snippet, synced_at
      FROM main.contact_emails_history
    `);
    db.exec('DROP TABLE IF EXISTS main.contact_emails_history');
  }
}
```

### iMessage Database (`imessage.db`)

```sql
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER,                      -- references main.contacts.id (NULL if unmatched)
  handle_id TEXT NOT NULL,                  -- original handle (phone/email from chat.db)
  message_guid TEXT UNIQUE NOT NULL,        -- from chat.db message.guid (dedup key)
  text TEXT,                                -- message body
  date TEXT NOT NULL,                       -- ISO 8601
  is_from_me INTEGER NOT NULL,             -- 1=sent, 0=received
  is_read INTEGER DEFAULT 0,
  service TEXT,                             -- "iMessage" or "SMS"
  chat_identifier TEXT,                     -- chat identifier for threading
  chat_style INTEGER,                       -- 43=1:1, 45=group
  has_attachments INTEGER DEFAULT 0,
  imported_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_imessage_messages_contact ON messages(contact_id, date DESC);
CREATE INDEX idx_imessage_messages_guid ON messages(message_guid);
CREATE INDEX idx_imessage_messages_handle ON messages(handle_id);
CREATE INDEX idx_imessage_messages_date ON messages(date);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT,
  mime_type TEXT,
  total_bytes INTEGER
);
```

### WhatsApp Database (`whatsapp.db`)

WhatsApp data comes from exported chat `.txt` files or extracted from the WhatsApp backup database.

```sql
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER,                       -- references main.contacts.id
  chat_name TEXT NOT NULL,                  -- group name or contact name from export
  sender_name TEXT,                         -- who sent this message
  text TEXT,                                -- message body
  date TEXT NOT NULL,                       -- ISO 8601
  is_from_me INTEGER NOT NULL,
  message_type TEXT DEFAULT 'text',         -- 'text', 'image', 'video', 'audio', 'document', 'sticker'
  media_filename TEXT,                      -- original filename for media messages
  import_hash TEXT UNIQUE NOT NULL,         -- hash of (chat_name + date + sender + text) for dedup
  imported_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_whatsapp_messages_contact ON messages(contact_id, date DESC);
CREATE INDEX idx_whatsapp_messages_chat ON messages(chat_name, date DESC);
CREATE INDEX idx_whatsapp_messages_date ON messages(date);
```

---

## Phase 3: Orphan Cleanup on Contact Delete

Since cross-database foreign keys aren't enforced, we need application-level cleanup.

### Modify `archiveService.ts` and contact delete routes

Wrap the existing contact delete logic to also clean attached databases:

```typescript
// New function in databaseManager.ts
export function deleteContactFromAllDatabases(db: DatabaseType, contactId: number): void {
  const attached = getAttachedDatabases();

  db.transaction(() => {
    // Delete from each attached message database
    for (const dbInfo of attached) {
      db.prepare(`DELETE FROM ${dbInfo.name}.messages WHERE contact_id = ?`).run(contactId);
    }

    // Delete from main contacts table (cascades to emails, phones, etc.)
    db.prepare('DELETE FROM main.contacts WHERE id = ?').run(contactId);
  })();
}

// Batch version for bulk deletes
export function deleteContactsFromAllDatabases(db: DatabaseType, contactIds: number[]): void {
  if (contactIds.length === 0) return;

  const placeholders = contactIds.map(() => '?').join(',');

  db.transaction(() => {
    for (const dbInfo of getAttachedDatabases()) {
      db.prepare(
        `DELETE FROM ${dbInfo.name}.messages WHERE contact_id IN (${placeholders})`
      ).run(...contactIds);
    }
    db.prepare(
      `DELETE FROM main.contacts WHERE id IN (${placeholders})`
    ).run(...contactIds);
  })();
}
```

### Contact merge cleanup

Update `mergeService.ts` so that when contacts are merged, message `contact_id` references in all attached databases are updated to point to the surviving contact:

```typescript
export function reassignMessagesOnMerge(
  db: DatabaseType,
  fromContactId: number,
  toContactId: number
): void {
  for (const dbInfo of getAttachedDatabases()) {
    db.prepare(
      `UPDATE ${dbInfo.name}.messages SET contact_id = ? WHERE contact_id = ?`
    ).run(toContactId, fromContactId);
  }
}
```

---

## Phase 4: Unified Search

### Approach: Aggregate into `contacts_unified_fts`

Extend the existing `buildSearchableText()` function to optionally include message data from attached databases. This keeps the single-FTS-table approach but enriches it with message content.

**However**, indexing all message text into contact FTS would bloat the index. Instead, add a separate **message search** capability:

### New FTS table in `contacts.db`

```sql
-- Lightweight: only indexes message subjects/snippets, not full body text
CREATE VIRTUAL TABLE IF NOT EXISTS messages_unified_fts USING fts5(
  source,            -- 'gmail', 'imessage', 'whatsapp'
  contact_id,        -- for filtering
  searchable_text,   -- subject/snippet/first 200 chars of body
  content='',
  contentless_delete=1,
  tokenize="unicode61 tokenchars '@.'"
);
```

This allows searching across all message sources from a single query:

```sql
SELECT * FROM messages_unified_fts WHERE searchable_text MATCH 'project proposal*'
```

### Rebuild strategy

Message FTS is rebuilt per-source after each import/sync operation, not on every message insert (too expensive for bulk imports). The import services call:

```typescript
export function rebuildMessageSearch(db: DatabaseType, source: string): void {
  // Delete old entries for this source
  db.prepare("DELETE FROM messages_unified_fts WHERE source = ?").run(source);

  // Re-index from the attached database
  const messages = db.prepare(`
    SELECT id, contact_id,
      COALESCE(subject, SUBSTR(text, 1, 200)) as searchable
    FROM ${source}.messages
    WHERE searchable IS NOT NULL
  `).all();

  const insert = db.prepare(
    "INSERT INTO messages_unified_fts(rowid, source, contact_id, searchable_text) VALUES (?, ?, ?, ?)"
  );

  // Use source-specific rowid offsets to avoid collisions:
  // gmail: 0-999999999, imessage: 1000000000-1999999999, whatsapp: 2000000000+
  const offset = { gmail: 0, imessage: 1_000_000_000, whatsapp: 2_000_000_000 }[source] || 0;

  db.transaction(() => {
    for (const msg of messages) {
      insert.run(msg.id + offset, source, msg.contact_id, msg.searchable);
    }
  })();
}
```

---

## Phase 5: Unified Timeline API

### New route: `backend/src/routes/timeline.ts`

Provides a merged, chronologically-sorted view of all interactions with a contact across all sources.

```
GET /api/contacts/:id/timeline?limit=20&cursor=<iso-date>&sources=gmail,imessage,whatsapp
```

**Response:**

```json
{
  "items": [
    {
      "source": "imessage",
      "id": 4521,
      "date": "2026-02-15T10:30:00Z",
      "direction": "inbound",
      "preview": "Hey, are you coming to dinner tonight?",
      "metadata": { "service": "iMessage", "chatStyle": 43 }
    },
    {
      "source": "gmail",
      "id": 892,
      "date": "2026-02-15T09:15:00Z",
      "direction": "outbound",
      "preview": "Re: Project proposal update",
      "metadata": { "threadId": "18f1a2b3c4d5e6f0", "snippet": "Thanks for..." }
    },
    {
      "source": "whatsapp",
      "id": 3301,
      "date": "2026-02-14T22:00:00Z",
      "direction": "inbound",
      "preview": "Check out this photo from the trip",
      "metadata": { "messageType": "image", "chatName": "Family Group" }
    }
  ],
  "hasMore": true,
  "nextCursor": "2026-02-14T22:00:00Z",
  "stats": {
    "gmail": { "total": 47, "last30Days": 5 },
    "imessage": { "total": 312, "last30Days": 28 },
    "whatsapp": { "total": 89, "last30Days": 12 }
  }
}
```

**Implementation:** Query each attached database independently with the date cursor, merge and sort in application code, take top N. This avoids UNION ALL across databases (which would prevent index usage on some SQLite versions):

```typescript
export function getContactTimeline(contactId: number, limit: number, cursor?: string) {
  const db = getDatabase();
  const allItems: TimelineItem[] = [];

  // Query each source
  for (const source of getAttachedDatabases()) {
    const query = cursor
      ? `SELECT * FROM ${source.name}.messages WHERE contact_id = ? AND date < ? ORDER BY date DESC LIMIT ?`
      : `SELECT * FROM ${source.name}.messages WHERE contact_id = ? ORDER BY date DESC LIMIT ?`;

    const rows = cursor
      ? db.prepare(query).all(contactId, cursor, limit)
      : db.prepare(query).all(contactId, limit);

    allItems.push(...rows.map(r => toTimelineItem(r, source.name)));
  }

  // Sort merged results by date descending, take top `limit`
  allItems.sort((a, b) => b.date.localeCompare(a.date));
  const items = allItems.slice(0, limit);
  const hasMore = allItems.length > limit;

  return { items, hasMore, nextCursor: items.at(-1)?.date ?? null };
}
```

---

## Phase 6: Database Management API & Settings UI

### New routes: `backend/src/routes/databases.ts`

```
GET  /api/databases                    — List all message databases with stats (size, row count, last sync)
POST /api/databases/:name/attach       — Attach/create a database
POST /api/databases/:name/detach       — Detach a database (keeps file)
DELETE /api/databases/:name            — Detach and delete the database file
GET  /api/databases/:name/stats        — Detailed stats for one database
POST /api/databases/:name/vacuum       — Run VACUUM on a specific database
POST /api/databases/:name/export       — Download a database file
POST /api/databases/:name/import       — Upload/replace a database file
```

### Frontend: Settings > Databases Tab

```
┌─────────────────────────────────────────────────────────────┐
│  Databases                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ● contacts.db (primary)              48.2 MB                │
│    12,847 contacts · 3 FTS indexes                          │
│                                                              │
│  ● gmail.db                           124.5 MB               │
│    47,291 email subjects                                     │
│    Last synced: 2 hours ago                                  │
│    [Vacuum] [Export] [Delete]                                │
│                                                              │
│  ● imessage.db                        892.1 MB               │
│    156,423 messages                                          │
│    Last imported: Feb 14, 2026                               │
│    [Re-import] [Vacuum] [Export] [Delete]                    │
│                                                              │
│  ○ whatsapp.db                        Not imported            │
│    [Import WhatsApp Export]                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Frontend: Contact Detail — Unified Timeline

Replace the current `EmailHistorySection` with a unified `CommunicationTimeline` component that shows all message sources interleaved chronologically:

```
┌──────────────────────────────────────────────────────────────┐
│  Communication (456)          [Gmail] [iMessage] [WhatsApp]  │
│                               ↑ source filter toggles        │
├──────────────────────────────────────────────────────────────┤
│  📧 ← Re: Project proposal update              Feb 15       │
│  💬 ← Hey, are you coming to dinner tonight?   Feb 15       │
│  💬 → Yes! What time?                          Feb 15       │
│  📱 ← Check out this photo from the trip       Feb 14       │
│  📧 → Meeting notes from Tuesday               Feb 13       │
│                                                              │
│  [Show more...]                                              │
└──────────────────────────────────────────────────────────────┘
```

- Source icons: 📧 Gmail, 💬 iMessage, 📱 WhatsApp
- Filter toggles let users show/hide specific sources
- Click-through: Gmail opens in Gmail, iMessage shows full message, WhatsApp shows full message
- Stats per source shown on hover/expand

---

## Phase 7: Update Existing Services

### `emailSyncService.ts`

Modify to write to `gmail.db` instead of `main.contact_emails_history`:

```typescript
// Before:
db.prepare('INSERT OR IGNORE INTO contact_emails_history ...').run(...)

// After:
if (isDatabaseAttached('gmail')) {
  db.prepare('INSERT OR IGNORE INTO gmail.messages ...').run(...)
}
```

The Gmail sync columns on `contacts` (`gmail_history_id`, `gmail_last_sync_at`) remain in `main` since they're per-contact sync state, not message data.

### Future: `messageImportService.ts` (iMessage)

Already designed in the iMessage import plan. Only change: write to `imessage.db` instead of a `messages` table in `main`.

### Future: `whatsappImportService.ts`

Parse WhatsApp chat export `.txt` files (format: `[DD/MM/YYYY, HH:MM:SS] Sender: Message`), match senders to contacts by name or phone number, write to `whatsapp.db`.

---

## Implementation Order

| Step | Description | Files |
|------|-------------|-------|
| 1 | Database manager service | `services/databaseManager.ts` |
| 2 | Hook into `getDatabase()` startup | `services/database.ts` |
| 3 | Gmail database schema + migration from `contact_emails_history` | `databaseManager.ts` |
| 4 | Update `emailSyncService.ts` to write to `gmail.db` | `services/emailSyncService.ts` |
| 5 | Update `emailSync.ts` routes to read from `gmail.db` | `routes/emailSync.ts` |
| 6 | Orphan cleanup in archive/delete/merge | `services/archiveService.ts`, `services/mergeService.ts` |
| 7 | iMessage database schema | `databaseManager.ts` |
| 8 | WhatsApp database schema | `databaseManager.ts` |
| 9 | Unified timeline API | `routes/timeline.ts` |
| 10 | Message search FTS | `services/database.ts` |
| 11 | Database management API | `routes/databases.ts` |
| 12 | Frontend: Databases settings tab | `components/SettingsView.tsx` |
| 13 | Frontend: Unified timeline component | `components/CommunicationTimeline.tsx` |
| 14 | Frontend: hooks and API client | `api/timelineHooks.ts`, `api/databaseHooks.ts` |

---

## Configuration

### Environment Variables

```
# Existing
DATABASE_PATH=./data/contacts.db

# New
MESSAGES_PATH=./data/messages          # Directory for message databases
GMAIL_DB_PATH=./data/messages/gmail.db       # Override default gmail db location
IMESSAGE_DB_PATH=./data/messages/imessage.db # Override default imessage db location
WHATSAPP_DB_PATH=./data/messages/whatsapp.db # Override default whatsapp db location
```

All new env vars are optional with sensible defaults derived from `DATABASE_PATH`.

---

## Key Decisions

- **ATTACH DATABASE over separate connections.** A single connection with attached databases enables cross-database queries and transactions. The alternative (multiple `better-sqlite3` instances) would require application-level joins and couldn't participate in shared transactions.
- **Common `messages` table name per database.** Each database uses the same table name (`messages`), qualified by schema name in queries (`gmail.messages`, `imessage.messages`). This enables generic code in the database manager while keeping each database self-contained.
- **Lazy database creation.** Databases are only created when the user first imports data for that source. Unused sources don't create empty files.
- **Migration of `contact_emails_history`.** The existing Gmail email history table moves to `gmail.db` as a one-time migration. This is the cleanest path since the data already matches the new schema.
- **Message FTS in main database.** The unified search index lives in `contacts.db` to keep it close to the contact FTS and enable combined search queries. Message databases remain pure data stores.
- **Application-level referential integrity.** Accept the lack of cross-database foreign keys as a trade-off. Message data is always re-importable from source, so occasional orphans are not catastrophic.

---

## Open Questions

1. **Message body in FTS?** Should we index full message bodies (iMessage text, WhatsApp messages) or just subjects/snippets? Full bodies give better search but significantly larger FTS index.
2. **Database size limits?** Should we warn users when a message database exceeds a threshold (e.g., 2 GB)?
3. **Auto-vacuum?** Should message databases use `auto_vacuum = INCREMENTAL` to reclaim space automatically, or leave it manual via the settings UI?
4. **Unified stats on dashboard?** The existing stats page could show cross-source communication stats (most contacted people across all channels, communication frequency trends).
5. **WhatsApp import format?** Support only the `.txt` export, or also try to read WhatsApp's local SQLite backup (`msgstore.db`) for Android users?

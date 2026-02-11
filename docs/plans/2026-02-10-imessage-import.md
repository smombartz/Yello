# Plan: Import iMessage/SMS Text Messages into Address Book

**Status:** Draft
**Date:** 2025-02-10

## Overview

Add the ability to import text message history from macOS's iMessage/SMS database (`~/Library/Messages/chat.db`) and display conversations on each contact's detail card. Also evaluate whether a desktop app could enable continuous/live message syncing.

---

## How iMessage Data is Stored on macOS

The Messages app stores everything in a SQLite database at:
```
~/Library/Messages/chat.db
```

### Key Tables

| Table | Purpose |
|-------|---------|
| `message` | Every sent/received message (text, timestamps, direction) |
| `handle` | Contact identifiers — phone numbers (E.164: `+14155551234`) and emails |
| `chat` | Conversations (1:1 style=43, group style=45) |
| `chat_message_join` | Links messages to conversations |
| `chat_handle_join` | Links participants to conversations |
| `attachment` | Media file metadata (paths to `~/Library/Messages/Attachments/`) |
| `message_attachment_join` | Links attachments to messages |

### Linking Messages to Contacts

```
message.handle_id → handle.ROWID → handle.id (phone number or email)
```

Our `contact_phones.phone` field already stores E.164 format — this is the **same format** as `handle.id`, making matching straightforward.

### Timestamps

Messages use "Mac epoch" timestamps — nanoseconds since 2001-01-01:
```
unix_timestamp = mac_timestamp / 1_000_000_000 + 978307200
```

### macOS Ventura+ Gotcha

Starting with macOS 13, message text is often stored **only** in the `attributedBody` BLOB column (an `NSKeyedArchiver`-serialized `NSAttributedString`), not in the plain `text` column. We need to handle both:
- Read `text` first (works for older messages)
- Fall back to extracting text from `attributedBody` binary blob

---

## Security & Permissions

| Constraint | Impact |
|------------|--------|
| **TCC / Full Disk Access** | The `~/Library/Messages/` directory is protected. The process reading it must have Full Disk Access granted in System Settings > Privacy & Security |
| **Read-only access** | Must open the database with `readonly: true` — Messages.app has it locked |
| **Not available in browsers** | A web app cannot access the filesystem. Our Node.js backend CAN access it if the terminal/process has Full Disk Access |
| **Mac App Store** | Sandboxed apps cannot access this path. Only direct-distributed apps can |

---

## Architecture: Four Approaches

### Approach A: Direct Read (requires Full Disk Access)

The Fastify backend reads `~/Library/Messages/chat.db` directly using `better-sqlite3` in read-only mode. This works because:
- Backend already uses `better-sqlite3`
- Backend runs in a terminal/process that can be granted Full Disk Access
- No new dependencies needed beyond what we have

**Flow:**
1. User clicks "Import Messages" in the web UI
2. Backend opens `~/Library/Messages/chat.db` (read-only)
3. Queries messages, matches `handle.id` to `contact_phones.phone` and `contact_emails.email`
4. Stores matched messages in our database
5. Frontend displays messages on contact cards

**Pros:** Uses existing stack, simple architecture, one-click import
**Cons:** Only imports when user triggers it, requires Full Disk Access for the Node process

### Approach B: User-Copied Database (Recommended — no special permissions)

The user manually copies `chat.db` to a known location, and the backend reads that copy. **No Full Disk Access needed** because the user performs the copy themselves via Finder.

**User steps:**
1. In Finder: Go → Go to Folder → `~/Library/Messages/`
2. Copy `chat.db` to a location our app can read (e.g. the app's `data/` directory)
3. In the app's Settings → Messages, specify the path or use default location
4. Click "Import Messages"

**Backend reads the copy using `better-sqlite3` — same import logic as Approach A**, just pointed at a different path.

**How the path resolution works:**
```typescript
// Settings stores the path to the user's copied chat.db
// Default locations to check (in order):
const IMESSAGE_DB_PATHS = [
  path.join(dataDir, 'chat.db'),                    // Copied into our data/ dir
  path.join(os.homedir(), 'Desktop', 'chat.db'),     // Copied to Desktop
  path.join(os.homedir(), 'Downloads', 'chat.db'),   // Copied to Downloads
];

// Or user can configure a custom path in Settings
const configuredPath = getSettingSync('imessage_db_path');
```

**Pros:**
- Zero permission requirements — user copies the file, our app just reads it
- Same `better-sqlite3` read logic as Approach A
- Works today with no macOS entitlements or TCC configuration
- User controls exactly which database snapshot they import
- Can also be used with a database copied from a different Mac

**Cons:**
- Manual step: user must copy the file (and re-copy for updates)
- Stale data — reflects messages at time of copy, not live
- User needs to know how to navigate to ~/Library/Messages/

**Why not upload via the web UI?** `chat.db` can be hundreds of MB to several GB for long-time iMessage users. Reading from a local path is instant; uploading through the browser would be slow and memory-intensive. Since both the frontend and backend run on the same machine in development, a local path read is the right call.

### Approach C: Desktop App (Electron/Tauri) with Live Sync

A desktop wrapper around the web app that can poll `chat.db` every few seconds for new messages.

**Pros:** Near-real-time message updates, native app experience
**Cons:** Significant new infrastructure (packaging, signing, notarization), still needs Full Disk Access

### Approach D: iPhone Backup Import

Read messages from an iTunes/Finder iPhone backup at:
```
~/Library/Application Support/MobileSync/Backup/<device-uuid>/
```

The messages database in the backup is `sms.db` (identified via `Manifest.db`), but has a **different schema** than the macOS `chat.db`. Encrypted backups require the backup password.

**Pros:** Works without Messages.app configured on Mac
**Cons:** Different schema, potentially encrypted, backup may be stale

---

## Recommended Implementation: Approach B (with easy upgrade to A)

### Phase 1: Database Schema & Import Engine

#### New Tables

```sql
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  handle_id TEXT NOT NULL,           -- original handle (phone/email)
  message_guid TEXT UNIQUE NOT NULL, -- from chat.db message.guid (dedup key)
  text TEXT,                         -- message body
  date TEXT NOT NULL,                -- ISO 8601 timestamp
  is_from_me INTEGER NOT NULL,       -- 1=sent, 0=received
  is_read INTEGER DEFAULT 0,
  service TEXT,                      -- "iMessage" or "SMS"
  chat_id TEXT,                      -- chat identifier for threading
  chat_style INTEGER,                -- 43=1:1, 45=group
  cache_has_attachments INTEGER DEFAULT 0,
  imported_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_contact ON messages(contact_id, date DESC);
CREATE INDEX idx_messages_guid ON messages(message_guid);
CREATE INDEX idx_messages_handle ON messages(handle_id);

CREATE TABLE IF NOT EXISTS message_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT,                     -- original filename
  mime_type TEXT,
  total_bytes INTEGER,
  stored_path TEXT                   -- path in our storage (if we copy them)
);
```

#### Import Service (`backend/src/services/messageImportService.ts`)

```typescript
// Pseudocode for the import flow:

1. Resolve chat.db path:
   - Check user-configured path in settings (imessage_db_path)
   - Fall back to default locations: data/chat.db, ~/Desktop/chat.db, ~/Downloads/chat.db
   - Optionally try ~/Library/Messages/chat.db (works if Full Disk Access granted)
   - Throw clear error if no database found at any location

2. Open the resolved path with better-sqlite3 (readonly: true, fileMustExist: true)

3. Query all handles → build phone/email → contact_id lookup map
   - Normalize handle.id phones to E.164
   - Match against contact_phones.phone and contact_emails.email

4. Query messages joined with handles:
   SELECT m.guid, m.text, m.attributedBody, m.date, m.is_from_me,
          m.is_read, m.service, m.cache_has_attachments,
          h.id as handle_identifier,
          c.chat_identifier, c.style as chat_style
   FROM message m
   LEFT JOIN handle h ON m.handle_id = h.ROWID
   LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
   LEFT JOIN chat c ON cmj.chat_id = c.ROWID
   WHERE h.id IN (matched handles)
   ORDER BY m.date

5. For each message:
   - Skip if message_guid already exists (idempotent re-import)
   - Extract text from m.text or decode m.attributedBody
   - Convert Mac nanosecond timestamp → ISO 8601
   - Insert into messages table with matched contact_id

6. Return import stats:
   { total, imported, skipped, unmatchedHandles[], dbPath, dbModified }
```

**Upgrade path to Approach A:** The import service is identical for both approaches — the only difference is the resolved path. If the user later grants Full Disk Access to their terminal, the service automatically picks up `~/Library/Messages/chat.db` without any code changes.

#### attributedBody Decoder

For macOS Ventura+ messages where `text` is NULL:

```typescript
function extractTextFromAttributedBody(blob: Buffer): string | null {
  // The NSAttributedString binary contains the plain text
  // embedded between known byte markers.
  // Strategy: search for the text between streamtyped markers
  // using known patterns from the typedstream format.
  // Fallback: use child_process to call plutil for conversion.
}
```

### Phase 2: API Endpoints

```
POST /api/messages/import
  - Triggers the import process
  - Optional body: { dbPath?: string }  (override the configured path)
  - Returns: { total, imported, skipped, unmatchedHandles[], dbPath, dbModified }

GET /api/contacts/:id/messages?limit=50&offset=0
  - Returns paginated messages for a contact
  - Response: { messages: Message[], total: number }

GET /api/messages/stats
  - Returns: { totalMessages, contactsWithMessages, lastImportDate }

GET /api/messages/detect-db
  - Checks all default paths for chat.db, returns which ones exist
  - Returns: { found: { path, size, modified }[], configured: string | null }

PUT /api/settings/imessage-db-path
  - Save a custom path to chat.db
  - Body: { path: string }
  - Validates the file exists and is a valid SQLite database with expected tables
```

### Phase 3: Frontend — Messages Section on Contact Card

Add a new "Messages" section to `ContactRowExpanded`:

```
┌─────────────────────────────────────────────┐
│ 💬 Messages (147)                           │
├─────────────────────────────────────────────┤
│ ← Hey, are you coming to dinner tonight?    │  Feb 8
│ → Yes! What time?                           │  Feb 8
│ ← 7pm at the Italian place                  │  Feb 8
│ → Perfect, see you there                    │  Feb 8
│                                             │
│ [Show older messages...]                    │
└─────────────────────────────────────────────┘
```

- Chat bubble style: left-aligned (received) vs right-aligned (sent)
- Grouped by date
- Initially show last 20 messages, paginate older
- Show message count in section header
- Indicate iMessage vs SMS with subtle icon

### Phase 4: Import UI in Settings

Add a "Messages" tab to the Settings page:

**Database Location Section:**
- Auto-detect: checks default paths (`data/chat.db`, `~/Desktop/chat.db`, `~/Downloads/chat.db`, `~/Library/Messages/chat.db`)
- Show which paths were found with file size and last-modified date
- Custom path input field for non-standard locations
- Instructions box: "To import messages, copy `chat.db` from `~/Library/Messages/` to your Desktop or this app's data folder"
- Validation: confirms the file is a valid iMessage database before importing

**Import Section:**
- **Import button** — triggers POST /api/messages/import
- **Progress indicator** during import
- **Stats display** — total messages, contacts matched, last import date
- **Unmatched handles** — show phone numbers/emails that couldn't be matched to contacts (with option to manually map them)
- **Re-import button** — only imports new messages since last import (uses message_guid dedup)
- **Note:** "For fresh messages, re-copy chat.db and import again. Existing messages won't be duplicated."

---

## Can a Desktop App Easily Import New Messages?

**Yes, significantly easier.** Here's the comparison:

| Feature | Web App (current) | Desktop App (Electron/Tauri) |
|---------|-------------------|------------------------------|
| Initial import | Manual trigger via UI | Manual trigger or automatic on launch |
| Live new messages | Not practical — user must re-import | **Poll chat.db every 2-5 seconds** for new messages |
| Full Disk Access | Granted to terminal/Node process | Granted to the app binary itself |
| Background sync | Only while dev server runs | **Can run as a persistent background process or menu bar app** |
| Notification on new messages | No | Possible (though redundant with macOS notifications) |

### How Live Polling Would Work

```typescript
// Track the highest ROWID we've seen
let lastSeenRowId = getLastImportedRowId();

setInterval(() => {
  const newMessages = chatDb.prepare(`
    SELECT * FROM message
    WHERE ROWID > ?
    ORDER BY ROWID ASC
  `).all(lastSeenRowId);

  for (const msg of newMessages) {
    // Match to contact, insert into our DB
    lastSeenRowId = msg.ROWID;
  }
}, 3000); // every 3 seconds
```

This is essentially what the `osa-imessage` npm package does. A desktop app makes this natural because:
- It's a long-running process
- Users expect to grant desktop apps Full Disk Access
- The app can sit in the menu bar and sync in the background

### Recommendation

For **now**: Implement Approach A (backend import endpoint) in the web app. This gives you the data and UI without new infrastructure.

For **later**: If continuous sync is important, wrap the web app in Tauri (Rust + WebView). The Rust backend can poll chat.db efficiently, and you keep the React frontend as-is. Tauri adds ~10MB to the binary vs Electron's ~150MB.

---

## Matching Strategy: handle.id → contacts

The critical piece is matching iMessage handles to contacts in our database.

### Primary Match: Phone Numbers
```sql
-- handle.id stores E.164: "+14155551234"
-- contact_phones.phone stores E.164: "+14155551234"
-- Direct match!
SELECT c.id FROM contacts c
JOIN contact_phones cp ON c.id = cp.contact_id
WHERE cp.phone = ?  -- handle.id value
```

### Secondary Match: Email Addresses
```sql
-- handle.id stores email: "user@example.com"
-- contact_emails.email stores: "user@example.com"
SELECT c.id FROM contacts c
JOIN contact_emails ce ON c.id = ce.contact_id
WHERE LOWER(ce.email) = LOWER(?)  -- handle.id value
```

### Edge Cases
- A handle may match multiple contacts (duplicates in address book) — take first match or flag for review
- Some handles won't match any contact — track these as "unmatched" and show in import report
- Group messages: link message to each participant's contact, flag as group conversation

---

## Estimated Scope

| Phase | Work |
|-------|------|
| Phase 1: Schema + Import Engine | New table, import service, attributedBody decoder |
| Phase 2: API Endpoints | 3 new routes |
| Phase 3: Frontend Messages Section | New component on contact card |
| Phase 4: Settings UI | Import trigger, stats, unmatched handles |

---

## Open Questions

1. **Attachments**: Should we copy attachment files (images/videos) into our storage, or just record metadata? Copying gives independence but uses disk space.
2. **Group messages**: Show on each participant's card? Show as a separate section? Skip entirely?
3. **Message search**: Add messages to FTS5 index for full-text search across messages?
4. **Privacy**: Should there be a way to exclude certain contacts or conversations from import?
5. **Re-import frequency**: For the web app, should we offer a "check for new messages" button on individual contact cards?

# Gmail Email History — Per-Contact Sync

**Status:** Implemented
**Date:** 2026-02-10

## Overview

Show email history (subject lines) on each contact's detail page by syncing from Gmail. Emails are synced per-contact on demand, stored locally in SQLite, and link back to Gmail when clicked. Supports both sent and received emails across all time.

## Data Model

### New table: `contact_emails_history`

```sql
CREATE TABLE contact_emails_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL UNIQUE,
  thread_id TEXT NOT NULL,
  subject TEXT,
  date TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
  snippet TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_email_history_contact ON contact_emails_history(contact_id, date DESC);
CREATE INDEX idx_email_history_gmail_id ON contact_emails_history(gmail_message_id);
```

### New columns on `contacts`

```sql
ALTER TABLE contacts ADD COLUMN gmail_history_id TEXT;
ALTER TABLE contacts ADD COLUMN gmail_last_sync_at TEXT;
```

- `gmail_history_id` — Gmail's history ID for incremental syncs per contact
- `gmail_last_sync_at` — timestamp of last sync; NULL = never synced

## Backend

### Service: `backend/src/services/emailSyncService.ts`

**Per-contact full sync:**
1. Look up all email addresses for the contact from `contact_emails`
2. Query Gmail API: `GET /gmail/v1/users/me/messages?q=from:addr1 OR to:addr1 OR from:addr2 OR to:addr2`
3. Paginate through results (100 per page using `nextPageToken`)
4. Batch-fetch metadata: `POST /gmail/v1/users/me/messages/batchGet` with `format=metadata&metadataHeaders=Subject,From,To,Cc,Date`
5. Determine direction: if `From` matches the user's own address → outbound, otherwise → inbound
6. Insert into `contact_emails_history`, skip duplicates on `gmail_message_id`
7. Store the latest `historyId` on the contact row + update `gmail_last_sync_at`

**Per-contact incremental sync:**
1. Use `GET /gmail/v1/users/me/history?startHistoryId={contact.gmail_history_id}&historyTypes=messageAdded`
2. Filter returned messages to only those involving this contact's addresses
3. Fetch metadata, match direction, insert new rows
4. Update `gmail_history_id`

**Auto-refresh on login:**
- Loop through contacts where `gmail_last_sync_at IS NOT NULL`
- Run incremental sync for each
- Throttle to max 50 contacts per login to stay within rate limits

### Routes: `backend/src/routes/emailSync.ts`

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/contacts/:id/email-sync` | Full sync for a contact |
| `POST` | `/api/contacts/:id/email-sync/refresh` | Incremental sync for a contact |
| `GET` | `/api/contacts/:id/email-history` | Get email history (paginated, with stats) |

### GET response shape

```json
{
  "emails": [
    {
      "id": 1,
      "gmailMessageId": "18f1a2b3c4d5e6f7",
      "threadId": "18f1a2b3c4d5e6f0",
      "subject": "Re: Project proposal update",
      "date": "2026-02-10T14:30:00Z",
      "direction": "inbound",
      "snippet": "Thanks for the update, I'll review..."
    }
  ],
  "total": 47,
  "avgPerMonth": 3.2,
  "last30Days": 5,
  "hasMore": true,
  "nextCursor": "2024-06-15T..."
}
```

## Frontend

### New component: `EmailHistorySection.tsx`

Placed in `ContactRowExpanded` after existing sections (Notes, Categories, Meta Data).

**Three states:**

1. **Never synced** — call-to-action with "Sync Emails" button
2. **Syncing** — inline spinner with "Syncing emails..." text
3. **Synced** — full display:
   - Stats line: "47 total · ~3/month · 5 in last 30 days"
   - Muted "Last synced 2 hours ago" with refresh icon button
   - Email list sorted newest first, 10 at a time:
     - Directional arrow (← inbound, → outbound) with subtle color tint
     - Subject line (truncated with ellipsis)
     - Relative date on the right
   - Each row clickable → opens `https://mail.google.com/mail/u/0/#all/{threadId}` in new tab
   - "Show more" button loads next 10

### Hooks: `frontend/src/api/emailHooks.ts`

- `useContactEmailHistory(contactId)` — `useInfiniteQuery` for paginated email list with stats
- `useEmailSync(contactId)` — mutation hook for triggering full sync
- `useEmailRefresh(contactId)` — mutation hook for incremental refresh

### Styles

New `/* Email History Section */` block in `index.css`, following existing section patterns.

## OAuth Re-auth

Adding `gmail.readonly` scope requires re-consent from existing users.

**Lazy re-auth approach:**
- Scope is NOT added to normal login flow
- When user clicks "Sync Emails" and backend gets `403`/`401` from Gmail API, return `{ error: 'gmail_scope_required' }`
- Frontend shows "Grant Gmail access to sync emails" button
- Button redirects to Google OAuth with expanded scope: `https://www.googleapis.com/auth/gmail.readonly`
- After re-auth, user lands back on contact detail page
- Once granted, scope persists — no further prompts

Users who never use email sync never see a scope prompt.

## Key Decisions

- **Per-contact sync** (not full Gmail sync) — user has 200K emails; per-contact scoping keeps API calls and storage minimal
- **All-time history** — no date cutoff, sync everything for each contact
- **Both sent and received** — direction stored as `inbound`/`outbound`
- **Local storage in SQLite** — fast display, no API call on repeat views
- **Manual first sync + auto refresh** — user triggers initial sync per contact, incremental sync runs on login for previously-synced contacts
- **Single Google account** — uses the existing OAuth login, no multi-account support

# iCloud Contacts Sync — Design

**Status:** Approved
**Date:** 2026-03-31
**Direction:** One-way (iCloud → Yello)
**Protocol:** CardDAV via `tsdav` library

## Overview

Import contacts from Apple Contacts/iCloud into Yello via the CardDAV protocol. Contacts are fetched, parsed, scored against existing contacts for duplicates, and presented in a pre-import review screen before committing. Reuses the existing vCard parser, deduplication scoring, and merge logic.

## Authentication & Credentials

- User provides their Apple ID email and an app-specific password (generated at appleid.apple.com)
- Credentials stored encrypted in the per-user `user_settings` table, same pattern as Google OAuth tokens in `googleAuthService.ts`
- Settings UI: new "Apple Contacts" section in SettingsView with email input, masked password input, "Test Connection" button, help link for generating app-specific passwords, and "Disconnect" button
- Backend `icloudService.ts` uses `tsdav` DAVClient with Basic auth, handles iCloud service discovery (SRV records → principal URL → address book home)
- Exposes `testConnection(email, password)` and `fetchAllContacts(email, password)` methods

## Fetch & Parse Pipeline

When the user clicks "Import from iCloud":

1. **Fetch** — `icloudService.fetchAllContacts()` uses tsdav to PROPFIND the address book, then REPORT to get all vCard objects
2. **Parse** — Each vCard string fed through existing `vcardParser.parseVCards()` — no new parsing code
3. **Return** — Parsed contacts returned to frontend as a preview list (not yet saved to DB)

### Endpoint

`POST /api/icloud/fetch` — no body (credentials from stored settings), returns:

```typescript
{
  contacts: ParsedContact[],
  errors: ParseError[],
  total: number
}
```

Photos embedded in iCloud vCards are included in `ParsedContact.photoBase64` but not processed/stored until import time. Rate limited to one fetch at a time per user, 120-second timeout.

## Detect-on-Import & Duplicate Matching

After fetch, the frontend sends contacts to the backend for matching:

1. **Score** each fetched contact against all existing contacts using the recommended dedup algorithm — email (+1), phone (+1), social profile (+1), name (+1)
2. **Categorize** each as:
   - **Match** (score >= 2, or exact email/phone match) — needs user review
   - **New** (no matches) — safe to import directly

### Endpoint

`POST /api/icloud/preview-import` — accepts array of ParsedContacts, returns:

```typescript
{
  newContacts: ParsedContact[],
  matches: {
    incoming: ParsedContact,
    existing: ContactDetail,
    confidence: 'very_high' | 'high' | 'medium',
    matchReasons: string[]  // e.g. ["email: john@example.com", "name: John Smith"]
  }[],
  stats: { total: number, new: number, matched: number }
}
```

Reuses `nameMatchingService` for fuzzy name/nickname matching and scoring logic from `deduplicationService`. Main new code adapts the scoring to compare `ParsedContact` against DB contacts (rather than DB-vs-DB).

## Pre-Import Review UI

A modal or page shown after preview-import returns:

1. **Summary bar** — "Found 342 contacts: 327 new, 15 match existing contacts"
2. **Matches review** (shown first) — Side-by-side cards:
   - Left: incoming iCloud contact (name, email, phone, photo)
   - Right: existing Yello contact
   - Match reasons as tags ("Email match", "Name match")
   - Per-match actions: **Merge**, **Import as new**, **Skip**
   - Bulk actions: "Merge all", "Skip all matches"
3. **New contacts list** — Scrollable list, "Select all" checked by default, individual deselect available
4. **Bottom action bar** — "Import X contacts (Y merges, Z new)" button

Visual pattern follows existing `DeduplicationView` merge UI, adapted for incoming-vs-existing.

## Import Execution

### Endpoint

`POST /api/icloud/import` — accepts:

```typescript
{
  newContacts: ParsedContact[],
  merges: {
    incomingContact: ParsedContact,
    existingContactId: number,
    conflictResolutions?: Record<string, 'incoming' | 'existing'>
  }[],
  skipped: number
}
```

### Processing (single transaction per contact)

**New contacts:** Existing import pipeline — insert contact + related records, process photos via `photoProcessor`, update FTS index.

**Merges:**
- Union multi-value fields (emails, phones, addresses, etc.) using mergeService dedup rules (case-insensitive email, exact phone, composite address key)
- Scalar conflicts (name, company, title, birthday) resolved by user's choices
- Process incoming photo if existing contact has none, otherwise keep existing
- Update FTS index

### Response

```typescript
{ imported: number, merged: number, skipped: number, errors: ParseError[] }
```

## New Files

| File | Purpose |
|------|---------|
| `backend/src/services/icloudService.ts` | tsdav client, fetch, test connection |
| `backend/src/routes/icloud.ts` | 4 endpoints: settings, fetch, preview-import, import |
| `frontend/src/components/ICloudImportView.tsx` | Pre-import review UI |
| `frontend/src/api/icloudHooks.ts` | TanStack Query hooks |

## Existing Code Reused

| Module | What's reused |
|--------|---------------|
| `vcardParser.ts` | Parse fetched vCards |
| `deduplicationService.ts` | Recommended scoring algorithm |
| `nameMatchingService.ts` | Fuzzy name/nickname matching |
| `mergeService.ts` | Field-level merge logic, dedup rules |
| `importService.ts` | Contact creation pipeline |
| `photoProcessor.ts` | Photo processing and storage |
| `SettingsView.tsx` | UI for credential management |

## Dependencies

- `tsdav` — TypeScript CardDAV/CalDAV client (~50KB)

## Future Considerations

- Incremental sync using CardDAV sync tokens (CTag/ETag)
- Two-way sync (Yello → iCloud)
- Scheduled/automatic background sync

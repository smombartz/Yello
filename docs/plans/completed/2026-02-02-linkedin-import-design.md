# LinkedIn Contacts Import - Design Document

**Date:** 2026-02-02

## Overview

Add a feature to import LinkedIn connections from a CSV export file. The import will:
- Match existing contacts by email (first) or LinkedIn URL (fallback)
- Only add missing data to existing contacts (never overwrite)
- Create new contacts when no match found
- Add "LinkedIn Connection" category to all processed contacts
- Store connection date in notes as "LinkedIn connection since [date]"

## CSV Format

LinkedIn exports connections as CSV with these columns:
```
First Name,Last Name,URL,Email Address,Company,Position,Connected On
Oliver,Smith,https://www.linkedin.com/in/oliver-smith-616650199,,Obscurion Talent,Founder,03 Jan 2026
```

Note: First 3 lines contain notes/header, actual data starts on line 4.

## Matching Logic

For each CSV row:
1. **If email exists** → query `contact_emails` table for match
2. **Else if LinkedIn URL exists** → query `contact_social_profiles` where `platform='linkedin'` and `profile_url` matches
3. **If match found** → update only empty fields:
   - Add LinkedIn social profile if missing
   - Set company if empty
   - Set title (position) if empty
   - Append "LinkedIn connection since [date]" to notes if not present
   - Add "LinkedIn Connection" category if not present
4. **If no match** → create new contact with all available data + category

**Duplicate detection:** Track processed LinkedIn URLs within the same import to skip duplicate rows.

## API Design

### Endpoint
`POST /api/settings/import-linkedin`

### Request Body
```typescript
interface ImportLinkedInRequest {
  contacts: Array<{
    firstName: string;
    lastName: string;
    url: string;
    email: string;
    company: string;
    position: string;
    connectedOn: string;
  }>;
}
```

### Server-Sent Events
```typescript
// Progress updates
{ event: 'progress', data: { current: 50, total: 500, created: 20, updated: 25, skipped: 5 } }

// Completion
{ event: 'complete', data: { created: 180, updated: 250, skipped: 70, failed: 0, errors: [] } }

// Error
{ event: 'error', data: { error: 'Invalid CSV format' } }
```

## Service Interface

**File:** `backend/src/services/linkedinImportService.ts`

```typescript
interface LinkedInContact {
  firstName: string;
  lastName: string;
  linkedinUrl: string;
  email: string | null;
  company: string | null;
  position: string | null;
  connectedOn: string | null;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

interface ProgressUpdate {
  current: number;
  total: number;
  created: number;
  updated: number;
  skipped: number;
}

function importLinkedInContacts(
  contacts: LinkedInContact[],
  onProgress?: (progress: ProgressUpdate) => void
): Promise<ImportResult>
```

## Frontend Design

### UI Layout
Collapsible card section in Settings (after "Fetch Contact Photos", before "Danger Zone"):

```
┌─ Import LinkedIn Contacts ─────────────── [▼ expand/collapse]
│
│  Import your LinkedIn connections from a CSV export.
│  To export: LinkedIn → Settings → Data Privacy → Get a copy of your data
│
│  [Choose File] connections.csv
│  [Import Contacts]
│
│  ┌─ Import Status ────────────────────────────────────┐
│  │ ████████████░░░░░░░░░░░░░░░░░░  156 / 487          │
│  │                                                     │
│  │  Created:  89    Updated:  52    Skipped: 15       │
│  └─────────────────────────────────────────────────────┘
│
└────────────────────────────────────────────────────────────
```

### Behavior
- Card starts collapsed by default
- Progress section appears once import starts
- After completion, stats remain visible (persistent, not toast)
- Shows "Import complete" label with final counts

### Hook
`useImportLinkedInStream()` - mirrors `useFetchContactPhotosStream()`:
- Parses CSV file client-side
- Sends parsed data to backend
- Receives SSE progress events
- Returns `{ isImporting, progress, importResult, startImport, cancel }`

## Files to Modify/Create

| File | Changes |
|------|---------|
| `backend/src/services/linkedinImportService.ts` | New - core import logic |
| `backend/src/routes/settings.ts` | Add SSE endpoint |
| `frontend/src/api/settingsHooks.ts` | Add `useImportLinkedInStream()` hook |
| `frontend/src/components/SettingsView.tsx` | Add collapsible import section |
| `frontend/src/index.css` | Styles for collapsible card & progress |

## Implementation Order

1. Create `linkedinImportService.ts` with import logic
2. Add API endpoint to `settings.ts`
3. Add frontend hook for SSE streaming
4. Add UI components to SettingsView
5. Add CSS styles

## Edge Cases

- Empty email fields in CSV (common - LinkedIn restricts this)
- Duplicate rows in same CSV file (skip, count as skipped)
- Contact already has LinkedIn profile (skip adding duplicate social profile)
- Contact already has "LinkedIn Connection" category (skip adding duplicate)
- Malformed CSV rows (log error, continue processing)
- Quoted fields containing commas (handle in CSV parsing)

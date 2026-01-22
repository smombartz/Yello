# Contact Manager MVP — Product Requirements Document

## Overview

A personal contact manager that imports contacts from VCF files and displays them in a fast, searchable list. Built for a single user managing 10,000+ contacts with photos.

## Problem Statement

Existing contact managers either lock you into an ecosystem (Apple, Google) or are bloated with features. I need a simple tool to:
- Import my existing contacts from various sources (exported as VCF)
- Browse and search contacts quickly
- Own my data in a portable format (SQLite)

## MVP Scope

### In Scope
- Import contacts from VCF files (single or multi-contact files)
- Display contacts in a virtualized row-based list
- Search contacts by name, email, company
- View contact details
- Handle contact photos (extract, resize, display)
- Deploy to Railway with persistent storage

### Out of Scope (Future)
- Google Contacts sync
- iCloud sync
- Duplicate detection and merging
- Contact editing/creation
- Contact groups/tags
- Export functionality
- Multi-user support
- Authentication

---

## User Stories

### Import

**US-1: Import VCF file**
> As a user, I want to upload a VCF file so that my contacts are added to the system.

Acceptance criteria:
- Accept `.vcf` files up to 100MB
- Parse vCard 2.1, 3.0, and 4.0 formats
- Handle multi-contact VCF files (multiple BEGIN:VCARD blocks)
- Extract and store: name, email(s), phone(s), company, title, address(es), photo, notes
- Show progress during import
- Display summary after import (X contacts added, Y photos processed)
- Handle malformed vCards gracefully (skip bad entries, continue import)

**US-2: Import feedback**
> As a user, I want to see what went wrong if some contacts fail to import.

Acceptance criteria:
- Show count of failed entries
- Provide downloadable error log with line numbers and reasons

---

### Contact List

**US-3: View contact list**
> As a user, I want to see all my contacts in a scrollable list so I can browse them.

Acceptance criteria:
- Display contacts in rows with: photo thumbnail (48px), name, company, primary email, primary phone
- Sort alphabetically by last name, then first name
- Virtualized rendering (only visible rows in DOM)
- Handle 10,000+ contacts without performance degradation
- Show total contact count

**US-4: Search contacts**
> As a user, I want to search my contacts by typing in a search box.

Acceptance criteria:
- Search box at top of list
- Search across: name, email, company
- Results update as user types (debounced 200ms)
- Highlight matching text in results
- Show "No results" state
- Clear search button

---

### Contact Detail

**US-5: View contact details**
> As a user, I want to click a contact to see all their information.

Acceptance criteria:
- Click row to open detail view (slide-in panel or modal)
- Display all available fields:
  - Photo (200px)
  - Full name
  - All email addresses (with type labels: work, home, etc.)
  - All phone numbers (with type labels)
  - Company and title
  - All addresses (formatted)
  - Notes
- Click email to open mailto: link
- Click phone to open tel: link
- Close button returns to list

---

## Technical Requirements

### Data Model

**Contact**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | INTEGER | Yes | Auto-increment primary key |
| first_name | TEXT | No | |
| last_name | TEXT | No | |
| display_name | TEXT | Yes | Computed or from FN field |
| company | TEXT | No | |
| title | TEXT | No | |
| notes | TEXT | No | |
| photo_hash | TEXT | No | MD5 hash for photo filename |
| raw_vcard | TEXT | No | Original vCard for data preservation |
| created_at | DATETIME | Yes | |
| updated_at | DATETIME | Yes | |

**ContactEmail**
| Field | Type | Required |
|-------|------|----------|
| id | INTEGER | Yes |
| contact_id | INTEGER | Yes (FK) |
| email | TEXT | Yes |
| type | TEXT | No | work, home, other |
| is_primary | BOOLEAN | Yes |

**ContactPhone**
| Field | Type | Required |
|-------|------|----------|
| id | INTEGER | Yes |
| contact_id | INTEGER | Yes (FK) |
| phone | TEXT | Yes | Stored in E.164 format |
| phone_display | TEXT | Yes | Formatted for display |
| type | TEXT | No | mobile, work, home, other |
| is_primary | BOOLEAN | Yes |

**ContactAddress**
| Field | Type | Required |
|-------|------|----------|
| id | INTEGER | Yes |
| contact_id | INTEGER | Yes (FK) |
| street | TEXT | No |
| city | TEXT | No |
| state | TEXT | No |
| postal_code | TEXT | No |
| country | TEXT | No |
| type | TEXT | No | work, home, other |

**FTS5 Virtual Table**
```sql
CREATE VIRTUAL TABLE contacts_fts USING fts5(
  display_name,
  company,
  content='contacts',
  content_rowid='id',
  tokenize='porter unicode61',
  prefix='2 3'
);
```

Separate index for email search:
```sql
CREATE VIRTUAL TABLE emails_fts USING fts5(
  email,
  content='contact_emails',
  content_rowid='id'
);
```

---

### API Endpoints

**Import**
```
POST /api/import
Content-Type: multipart/form-data
Body: file (VCF file)

Response 200:
{
  "imported": 150,
  "failed": 3,
  "photosProcessed": 89,
  "errors": [
    { "line": 234, "reason": "Missing required FN field" }
  ]
}
```

**List Contacts**
```
GET /api/contacts?page=1&limit=50&search=john

Response 200:
{
  "contacts": [
    {
      "id": 1,
      "displayName": "John Smith",
      "company": "Acme Inc",
      "primaryEmail": "john@acme.com",
      "primaryPhone": "(555) 123-4567",
      "photoUrl": "/photos/thumbnail/a1/a1b2c3d4.jpg"
    }
  ],
  "total": 10432,
  "page": 1,
  "totalPages": 209
}
```

**Get Contact Detail**
```
GET /api/contacts/:id

Response 200:
{
  "id": 1,
  "firstName": "John",
  "lastName": "Smith",
  "displayName": "John Smith",
  "company": "Acme Inc",
  "title": "CEO",
  "emails": [
    { "email": "john@acme.com", "type": "work", "isPrimary": true },
    { "email": "john.smith@gmail.com", "type": "home", "isPrimary": false }
  ],
  "phones": [
    { "phone": "+15551234567", "display": "(555) 123-4567", "type": "mobile", "isPrimary": true }
  ],
  "addresses": [
    { "street": "123 Main St", "city": "New York", "state": "NY", "postalCode": "10001", "country": "USA", "type": "work" }
  ],
  "notes": "Met at conference 2024",
  "photoUrl": "/photos/medium/a1/a1b2c3d4.jpg",
  "createdAt": "2025-01-20T10:30:00Z",
  "updatedAt": "2025-01-20T10:30:00Z"
}
```

**Get Contact Count**
```
GET /api/contacts/count

Response 200:
{ "total": 10432 }
```

---

### Photo Processing

On import, for each contact with an embedded photo:
1. Extract base64 photo data from vCard
2. Generate MD5 hash of contact ID for filename
3. Create directory structure: `/data/photos/{size}/{hash[:2]}/`
4. Generate four sizes using Sharp:
   - `thumbnail`: 48x48px, 80% quality (~3KB)
   - `small`: 96x96px, 82% quality (~8KB)
   - `medium`: 200x200px, 85% quality (~20KB)
   - `large`: 400x400px, 88% quality (~40KB)
5. Use `fit: 'cover'` and `position: 'attention'` for smart cropping
6. Save as progressive JPEG with mozjpeg compression
7. Store hash in contact record

Serve photos via static file route: `GET /photos/:size/:prefix/:hash.jpg`

---

### Performance Requirements

| Metric | Target |
|--------|--------|
| Initial page load | < 2 seconds |
| Search response | < 100ms |
| List scroll | 60fps (no jank) |
| Import 1,000 contacts | < 30 seconds |
| Import 10,000 contacts | < 5 minutes |
| Memory usage (10K contacts loaded) | < 200MB browser |

---

### Error Handling

| Scenario | Behavior |
|----------|----------|
| VCF parse error on single contact | Log error, skip contact, continue import |
| Invalid photo data | Skip photo, import contact without photo |
| File too large (>100MB) | Reject with clear error message |
| Non-VCF file | Reject with "Please upload a .vcf file" |
| Database write failure | Rollback transaction, return error |
| Photo processing failure | Log error, continue without photo |

---

## UI/UX Requirements

### Layout
- Single-page application
- Header: App name, import button, search box
- Main area: Contact list (full height, virtualized)
- Detail panel: Slides in from right on contact click

### Visual Design
- Use Pico CSS defaults (minimal customization)
- Light/dark mode via system preference
- Contact rows: 64px height, subtle hover state
- Photos: Circular crop with fallback initials avatar
- Responsive: Works on tablet (768px+), desktop optimized

### States
- Empty state: "No contacts yet. Import a VCF file to get started."
- Loading state: Skeleton rows during initial load
- Search empty state: "No contacts match '[query]'"
- Import progress: Modal with progress bar and status text

---

## Deployment Requirements

### Railway Configuration
- Node.js 20 runtime
- Persistent volume mounted at `/data` (1GB initial)
- Environment variables:
  - `NODE_ENV=production`
  - `DATABASE_PATH=/data/contacts.db`
  - `PHOTOS_PATH=/data/photos`
  - `PORT=3000` (Railway sets this)

### Build Process
1. Install dependencies
2. Build frontend (Vite)
3. Frontend static files served by Fastify

### Health Check
```
GET /health
Response 200: { "status": "ok", "contacts": 10432 }
```

---

## Success Metrics

MVP is successful if:
- Can import a 10,000-contact VCF file without errors
- Can scroll through full contact list at 60fps
- Search returns results in under 100ms
- Works reliably on Railway for 1 month without intervention

---

## Open Questions

1. Should we support CSV import in MVP? **Decision: No, VCF only for MVP**
2. Should contacts be editable in MVP? **Decision: No, read-only for MVP**
3. Should we add authentication? **Decision: No, single-user assumed for MVP**

---

## Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Backend setup | 2-3 hours | Fastify server, SQLite schema, health check |
| Import endpoint | 3-4 hours | VCF parsing, photo processing, database writes |
| Contact API | 2-3 hours | List, search, detail endpoints |
| Frontend scaffold | 2-3 hours | Vite, React, Pico CSS, routing |
| Contact list | 3-4 hours | Virtual scrolling, search, row rendering |
| Contact detail | 2-3 hours | Detail panel, field display |
| Import UI | 2-3 hours | Upload modal, progress, error display |
| Railway deployment | 1-2 hours | Dockerfile, volume config, env vars |
| Testing & polish | 2-3 hours | Edge cases, error states, performance |

**Total estimate: 20-28 hours**

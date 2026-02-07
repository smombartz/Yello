# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow: Planning & Documentation

1. **After brainstorming** - Save the plan to `docs/plans/YYYY-MM-DD-feature-name.md`
2. **After completing a plan** - Update the plan file (mark as "Implemented") and update this CLAUDE.md if the feature adds new environment variables, services, or patterns

Plans location: `docs/plans/`

## Build & Development Commands

**Root (runs both concurrently):**
```bash
npm run dev
```

**Backend (`backend/`):**
```bash
npm run dev          # Start dev server with tsx watch (port 3000)
npm run build        # Compile TypeScript to dist/
npm test             # Run tests with vitest
npm run test:watch   # Run tests in watch mode
```

**Frontend (`frontend/`):**
```bash
npm run dev          # Start Vite dev server (port 5173)
npm run build        # Type check + Vite build
npm run lint         # Run ESLint
```

**Testing servers:** Always shut down dev servers after testing:
```bash
kill $(lsof -ti :3000) 2>/dev/null  # Stop backend
kill $(lsof -ti :5173) 2>/dev/null  # Stop frontend
```

## Architecture Overview

This is a monorepo contact management application with separate frontend and backend packages.

### Tech Stack
- **Frontend:** React 19, TypeScript, Vite, TanStack Query (data fetching), TanStack Virtual (virtualized lists), React Router, Leaflet (maps), Pico CSS
- **Backend:** Node.js 20, Fastify 5, better-sqlite3, Sharp (image processing), TypeBox (validation)
- **Database:** SQLite with WAL mode and FTS5 full-text search

### Communication Flow
- Frontend (port 5173) proxies `/api`, `/photos`, `/health` to backend (port 3000)
- Authentication via Google OAuth with session cookies
- API uses JSON; file uploads use multipart/form-data (100MB limit)

### Key Directories

**Backend (`backend/src/`):**
- `routes/` - API endpoint handlers (contacts, duplicates, cleanup, import, auth, archive, map, settings)
- `services/` - Business logic (database, vcardParser, photoProcessor, mergeService, nameMatchingService, geocoding)
- `schemas/` - TypeBox validation schemas
- `middleware/auth.ts` - OAuth cookie validation

**Frontend (`frontend/src/`):**
- `components/` - React components (ContactList, DeduplicationView, CleanupView, MapView, SettingsView, etc.)
- `api/` - API client and TanStack Query hooks (hooks.ts, deduplicationHooks.ts, cleanupHooks.ts, etc.)
- `contexts/AuthContext.tsx` - Auth state management

### Database Schema
Main tables: `contacts`, `contact_emails`, `contact_phones`, `contact_addresses`, `contact_social_profiles`, `contact_categories`, `users`

FTS5 virtual tables for full-text search on display_name, company, email with prefix tokenization.

## Key Patterns

### API & Data Fetching
- TanStack Query for caching and synchronization
- Optimistic updates on mutations
- Query invalidation after mutations
- Custom hooks per domain (useContacts, useContactDetail, useDuplicates, etc.)

### Frontend
- Virtualized lists for 10K+ contacts performance
- `ProtectedRoute`/`PublicRoute` wrappers for auth
- CSS variables with `--stitch-*` prefix for design system

### Backend
- Fastify plugins for modularity
- TypeBox schemas validate all inputs
- better-sqlite3 prepared statements with transactions
- Sharp pipeline generates 4 image sizes (thumbnail, small, medium, large)

## Environment Variables

**Backend:**
```
DATABASE_PATH=./data/contacts.db
PHOTOS_PATH=./data/photos
PORT=3000
SESSION_SECRET=<required for production>
GOOGLE_CLIENT_ID=<OAuth>
GOOGLE_CLIENT_SECRET=<OAuth>
HERE_API_KEY=<for geocoding - get from developer.here.com>
```

## Photo URL Construction
```typescript
const photoUrl = `/photos/thumbnail/${hash.slice(0, 2)}/${hash}.jpg`
```

## Search Implementation
FTS5 with prefix search: `"john sm"` becomes `"john* sm*"` for type-ahead matching.

## Geocoding

Address geocoding uses **HERE.com API** (requires `HERE_API_KEY` env var).

- Free tier: 250,000 requests/month
- Service location: `backend/src/services/geocoding.ts`
- Addresses table has `latitude`, `longitude`, and `geocoded_at` columns
- Cleanup UI provides bulk geocoding under Addresses > Geocoding tab

## vCard Parsing & Contact Data Structure

### Parser Location
`backend/src/services/vcardParser.ts` - Uses `ical.js` for parsing with `libphonenumber-js` for phone normalization.

### ParsedContact Structure
```typescript
interface ParsedContact {
  firstName: string | null;
  lastName: string | null;
  displayName: string;           // Required - falls back to N field if FN missing
  company: string | null;
  title: string | null;
  notes: string | null;
  birthday: string | null;
  emails: ParsedEmail[];         // { email, type, isPrimary }
  phones: ParsedPhone[];         // { phone (E.164), phoneDisplay, countryCode, type, isPrimary }
  addresses: ParsedAddress[];    // { street, city, state, postalCode, country, type }
  categories: string[];          // From CATEGORIES field
  instantMessages: ParsedInstantMessage[];  // From IMPP field
  urls: ParsedUrl[];             // { url, label, type } - labels from X-ABLabel
  relatedPeople: ParsedRelatedPerson[];     // From X-ABRELATEDNAMES
  socialProfiles: ParsedSocialProfile[];    // From X-SOCIALPROFILE { platform, username, url }
  photoBase64: string | null;    // Embedded photo data
  rawVcard: string;              // Original vCard text preserved
}
```

### Parsing Flow
1. **Line unfolding** - vCard lines starting with whitespace continue previous line
2. **Split into blocks** - Separate by `BEGIN:VCARD`
3. **Parse each vCard** with ical.js:
   - `FN` → displayName (required, falls back to constructing from `N`)
   - `N` → [lastName, firstName, ...] (structured name)
   - `TEL` → phones (normalized to E.164 format)
   - `EMAIL` → emails
   - `ADR` → addresses [PO, ext, street, city, state, postal, country]
   - `ORG` → company
   - `PHOTO` → base64 data (handles data URI and ENCODING=B formats)
   - `BDAY` → birthday
   - `CATEGORIES` → categories array
   - `IMPP` → instant messages
   - `URL` → urls with labels from associated `X-ABLabel`
   - `X-SOCIALPROFILE` → social profiles with platform/username
   - `X-ABRELATEDNAMES` → related people

### vCard Edge Cases Handled
- **Versions 2.1, 3.0, 4.0** - All supported
- **Quoted-printable encoding** - Decoded before processing
- **Line folding** - Unfolded before parsing
- **Missing FN** - Constructed from N field as "First Last"
- **TYPE parameters** - Extracted from `TYPE=work` or `TYPE=work,voice`
- **Item groups** - `item3.URL` linked to `item3.X-ABLabel` for URL labels
- **Phone normalization** - All phones converted to E.164 with display format preserved
- **Primary flags** - First of each type (email, phone) marked as primary

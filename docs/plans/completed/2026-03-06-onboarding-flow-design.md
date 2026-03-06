# Onboarding Flow Design

**Status:** Implemented
**Date:** 2026-03-06

## Overview

A dedicated `/onboarding` route that guides new users through three steps: setting up their profile photo, importing contacts from VCF, and importing LinkedIn connections. Uses accordion-style collapsible cards with one section open at a time. Always skippable.

## Trigger Logic

- **First login:** OAuth callback redirects to `/onboarding` instead of `/dashboard` when `has_onboarded` is false.
- **Zero contacts (first time):** Catch-all redirect checks `has_onboarded` flag; if false, redirects to `/onboarding`.
- **Skippable:** "Skip to Dashboard" link always visible. Sets `has_onboarded = true` and navigates to `/dashboard`.
- **One-time only:** Once `has_onboarded` is true, auto-redirects stop. User can still visit `/onboarding` manually.

## Database Changes

**`auth.db` — `users` table:**
- Add column: `has_onboarded BOOLEAN DEFAULT 0`

**New endpoint:**
- `PATCH /api/auth/onboarded` — sets `has_onboarded = 1` for the current user

## Page Layout

- Dedicated `/onboarding` route, protected, inside `Layout` (NavRail visible)
- Centered container, max-width ~640px
- Heading: "Welcome to Yello" with subtitle
- Three `<details>` elements (Pico CSS), JavaScript-controlled to allow only one open at a time
- "Skip to Dashboard" link at top-right
- "Go to Dashboard" primary button at bottom (always visible)

## Section 1: Set Up Your Profile

- Displays current avatar (Google/Gravatar auto-fetched) at ~120px circle
- User's display name and email below
- "Upload Photo" button — native file picker (jpeg, png, webp)
- Uploads immediately via `POST /api/profile-images/upload` (new endpoint)
- Spinner during upload, then swaps to new photo with checkmark

**New endpoint:** `POST /api/profile-images/upload`
- Multipart/form-data, single image file
- Sharp pipeline: thumbnail, small, medium, large
- Stores in `profile_images` with `source = 'user_uploaded'`, sets as primary
- Returns image hash/URL

## Section 2: Import from Contacts (VCF)

- Intro text: "Import contacts from your phone or email client"
- Nested `<details>` with export instructions:
  - **iPhone/iCloud:** icloud.com/contacts → Select All → Export vCard
  - **Google Contacts:** contacts.google.com → Export → vCard format
  - **Outlook:** File → Open & Export → Export to a file
- File picker (accept: `.vcf, .vcard`)
- Uploads via existing `POST /api/import`
- Shows spinner, then result summary ("Imported 234 contacts, 45 photos processed")
- Note for large files: "This may take a moment for large files"
- On success: checkmark on header, auto-opens LinkedIn section

**Reuses:** Existing `useImportVcf()` hook and import route.

## Section 3: Import from LinkedIn (CSV)

- Intro text: "Import your LinkedIn connections"
- Nested `<details>` with step-by-step instructions:
  1. Go to linkedin.com → profile icon → Settings & Privacy
  2. Select Data privacy → Get a copy of your data
  3. Select Connections only
  4. Click Request archive (LinkedIn emails download link, can take minutes to hours)
  5. Download ZIP, extract, find `Connections.csv`
  6. Upload that CSV file below
- File picker (accept: `.csv`)
- Parses client-side with existing `parseLinkedInCsv()`
- Streams via existing `useImportLinkedInStream()`
- Real-time progress: "Created: 12 / Updated: 3 / Skipped: 1"
- On completion: checkmark on header

**Reuses:** Existing LinkedIn import parsing and streaming hooks.

## Accordion Behavior

- First section open by default
- Only one open at a time (JS-controlled)
- Each section header has icon and title
- After successful action: checkmark on header, auto-opens next section

## Completion Flow

- "Go to Dashboard" / "Skip to Dashboard" calls `PATCH /api/auth/onboarded`, navigates to `/dashboard`
- If all three sections have checkmarks: auto-call endpoint, show "You're all set!" message, redirect after 1.5s

## Edge Cases

- **Returning user with zero contacts:** `has_onboarded = true` means no onboarding redirect, just empty dashboard
- **Direct URL access:** `/onboarding` always accessible as protected route, but auto-redirects stop after flag is set
- **Import errors:** Inline error messages within the section, no collapse or advance on failure
- **Large VCF files:** Existing 100MB limit and 30s timeout apply, note shown to user

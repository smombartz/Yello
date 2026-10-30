# Recent card & Recent changes page

Roadmap item `ccyvry`.

## Goal

- Dashboard "Recently Added" card becomes "Recent": contacts added, imported, synced or updated in the
  last 7 days, shown with the photo-and-name tiles from the Birthdays work.
- Fix "-1 days ago": contact timestamps are SQLite UTC (`YYYY-MM-DD HH:MM:SS`, no zone), which the
  browser parsed as local time, so west of UTC a fresh contact looked like it was in the future.
- New page `/dashboard/recent` listing recent changes (last 30 days) by kind, linked from the card.
- The tile grid becomes one reusable component used by Birthdays and Recent.

## Approach

### Data: record where each contact came from
- New column `contacts.created_via` (TEXT, NULL for contacts created before this change), set by every
  insert path:
  - `manual` (Add Contact), `profile` (own card), `demo`
  - `vcf_import`, `icloud_import`, `google_import`, `linkedin_import`
  - `icloud_sync`, `google_sync` (sync pulls and the cutover)
- `insertParsedContact` takes a `createdVia` option; the other insert sites pass it in their SQL.

### Backend (`routes/stats.ts`)
- Timestamps go out as ISO with `Z` (`toIsoUtc`), so the browser reads them as UTC.
- Event rules, per contact:
  - creation in the window → `added` / `imported` / `synced` (from `created_via`; NULL → `added`)
  - `updated_at` in the window and more than 5 minutes after creation, not archived → `updated`
  - `archived_at` in the window → `archived`
- `GET /api/stats/recent?days=30` → `{ days, counts, events }`, each kind capped at 300 newest.
- Dashboard `recent`: newest 12 contacts changed in the last 7 days (one entry per contact, its latest
  non-archive event). Replaces `recentlyAdded` / `recentlyModified`.
- Window comparisons use `julianday()` on both sides (the old string compare against an ISO `T` value
  was off by up to a day).

### Frontend
- `ContactTileGrid` (generalised from `BirthdayGrid`): tiles with a portalled tooltip, each tile gives
  its own tooltip title/line and aria label. CSS classes `contact-tile*`.
- `utils/relativeTime.ts`: `parseServerTime` (handles both ISO and bare SQLite UTC), `formatRelativeDay`
  ("Today", "Yesterday", "3 days ago", then a date; never negative).
- `RecentView` at `/dashboard/recent`: Tabs filter (All + kinds with counts), one card per kind.
- Dashboard card renamed "Recent", tiles, footer link "See all recent changes".

## Steps
- [x] `created_via` column + set at every insert path + docs/database.md
- [x] `/api/stats/recent`, dashboard `recent`, UTC timestamps, tests
- [x] `ContactTileGrid` replaces `BirthdayGrid`
- [x] Relative-time util (fixes "-1 days ago")
- [x] Recent page + route + dashboard card + link
- [x] Build, tests, docs, log

## Changes

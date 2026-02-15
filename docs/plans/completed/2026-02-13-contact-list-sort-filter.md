# Contact List Sort & Filter

**Status:** Ready for implementation
**Date:** 2026-02-13

## Overview

Add sort and filter controls to the contact list toolbar, next to the existing list/grid view toggle.

## UI Layout

Toolbar row: `[List/Grid toggle] [Sort dropdown] [Filter button] [active filter chips...] ---- [Selection actions]`

- **Sort dropdown**: `<select>` with options:
  - `A → Z` (default, current behavior)
  - `Z → A`
  - `Newest first` (by `created_at`)
  - `Oldest first` (by `created_at` ascending)
  - `Recently updated` (by `updated_at`)
  - `Last contacted` (by most recent email in `contact_emails_history`, nulls last)

- **Filter button**: Opens a popover with toggle filters. Each filter is three-state: Any (default) / Yes / No.
  - Has Photo
  - Has Email
  - Has Phone
  - Has Address
  - Has Birthday
  - Has LinkedIn Enrichment
  - Has Instagram (social profile)
  - Has LinkedIn (social profile)

- **Active filter chips**: Dismissible chips next to filter button showing active filters (e.g. `✕ Has photo` `✕ No email`).

## Backend API

### New query parameters on `GET /api/contacts`

- `sort` — string enum: `name-asc` | `name-desc` | `newest` | `oldest` | `updated` | `last-contacted`
  - Default: `name-asc`
- `filter` — comma-separated string of active filters
  - Values: `has-photo`, `no-photo`, `has-email`, `no-email`, `has-phone`, `no-phone`, `has-address`, `no-address`, `has-birthday`, `no-birthday`, `has-enrichment`, `no-enrichment`, `has-instagram`, `no-instagram`, `has-linkedin`, `no-linkedin`
  - Example: `filter=has-photo,no-email`

### SQL mapping

**Sorts → ORDER BY:**
- `name-asc`: `ORDER BY c.last_name, c.first_name, c.display_name` (current)
- `name-desc`: `ORDER BY c.last_name DESC, c.first_name DESC, c.display_name DESC`
- `newest`: `ORDER BY c.created_at DESC`
- `oldest`: `ORDER BY c.created_at ASC`
- `updated`: `ORDER BY c.updated_at DESC`
- `last-contacted`: `ORDER BY last_contact_date DESC NULLS LAST` (via subquery on `contact_emails_history`)

**Filters → WHERE conditions:**
- `has-photo` / `no-photo` → `c.photo_hash IS NOT NULL` / `IS NULL`
- `has-email` / `no-email` → `EXISTS (SELECT 1 FROM contact_emails WHERE contact_id = c.id)` / `NOT EXISTS`
- `has-phone` / `no-phone` → `EXISTS (SELECT 1 FROM contact_phones WHERE contact_id = c.id)` / `NOT EXISTS`
- `has-address` / `no-address` → `EXISTS (SELECT 1 FROM contact_addresses WHERE contact_id = c.id)` / `NOT EXISTS`
- `has-birthday` / `no-birthday` → `c.birthday IS NOT NULL` / `IS NULL`
- `has-enrichment` / `no-enrichment` → `EXISTS (SELECT 1 FROM linkedin_enrichment WHERE contact_id = c.id)` / `NOT EXISTS`
- `has-instagram` / `no-instagram` → `EXISTS (SELECT 1 FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'instagram')` / `NOT EXISTS`
- `has-linkedin` / `no-linkedin` → `EXISTS (SELECT 1 FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin')` / `NOT EXISTS`

**Last contacted subquery:**
```sql
LEFT JOIN (
  SELECT contact_id, MAX(date) as last_contact_date
  FROM contact_emails_history
  GROUP BY contact_id
) lc ON lc.contact_id = c.id
```
Only joined when `sort=last-contacted`. Designed so a future `contact_interactions` union table can replace this subquery.

## Frontend

### State (in `ContactsPage.tsx`)
- `sort: string` — default `'name-asc'`
- `filters: Set<string>` — default empty

Passed as props to `ContactList`, then to `useContacts` hook.

### TanStack Query key
```
['contacts', { page, limit, search, category, sort, filter }]
```
Changing sort or filter resets page to 1.

### New component: `ContactFilters.tsx`
- Filter button with active count badge
- Popover panel with filter groups
- Three-state toggles per filter (Any / Yes / No)
- Calls `onFilterChange(filters: Set<string>)`

### Sort control
Plain `<select>` in the toolbar, styled to match existing buttons.

### Filter chips
Inline dismissible chips rendered from active filters Set.

## Files to modify

- `backend/src/routes/contacts.ts` — add sort/filter query params, SQL generation
- `frontend/src/api/hooks.ts` — extend `useContacts` with sort/filter params
- `frontend/src/components/ContactsPage.tsx` — add sort/filter state
- `frontend/src/components/ContactList.tsx` — pass sort/filter props, render toolbar controls
- `frontend/src/components/ContactFilters.tsx` — **new** filter popover component
- `frontend/src/index.css` — styles for filter popover, chips, sort dropdown

## Future extensibility

The `last-contacted` sort queries `contact_emails_history` directly. When text/calendar sources are added, replace with a `UNION` across source tables or a materialized `contact_interactions` view. The API contract (`sort=last-contacted`) stays the same.

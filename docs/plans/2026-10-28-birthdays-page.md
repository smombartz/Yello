# Upcoming Birthdays limit & Birthdays page

Roadmap item `gulnne`.

## Goal

- Dashboard "Upcoming Birthdays" card shows only birthdays in the next 14 days (today included).
- A "See all birthdays" link under that list opens a new page listing every birthday.
- The "With Birthdays" stat card at the top of the dashboard opens the same page.

## Approach

### Backend (`backend/src/routes/stats.ts`)
- One birthday parser for every stored format (`--MM-DD`, `YYYY-MM-DD`, `YYYYMMDD`, Apple's
  `1604-MM-DD` yearless placeholder).
- Days-until counted on calendar dates, so a birthday today is `0` ("Today!"). The old code compared
  against the current time, which pushed today's birthday a year out.
- Both endpoints take an optional `?today=YYYY-MM-DD` so "today" is the user's local date rather than
  the server's (UTC on Railway).
- `GET /api/stats/dashboard` → `upcomingBirthdays` limited to `daysUntil <= 14`.
- New `GET /api/stats/birthdays` → every birthday, sorted by next occurrence.

### Frontend
- `utils/birthdays.ts`: shared date/age/days formatting (moved out of `DashboardView`).
- `api/dashboardHooks.ts`: send local `today`; new `useAllBirthdays()`.
- `BirthdaysView` at `/dashboard/birthdays` (keeps the Dashboard nav item active), breadcrumb back
  to Dashboard, name search, grouped by month in upcoming order (current month first).
- Dashboard: card footer link, clickable birthday stat card, empty text updated to "next 14 days".

## Steps
- [x] Backend parsing, 14-day limit, `/birthdays` endpoint
- [x] Frontend hook + shared formatting
- [x] Birthdays page + route + CSS
- [x] Dashboard link + stat card link
- [x] Build, tests, docs, log

## Changes

- 2026-10-28: Birthdays page shows each month's people in a grid, and birthday rows (page and
  dashboard card) use smaller avatars and text, at the user's request to save space.
- 2026-10-28: Rows replaced by tiles (photo on top, name underneath) in a shared `BirthdayGrid`;
  date and days-until moved into a hover tooltip. Supersedes the compact-row styling above.

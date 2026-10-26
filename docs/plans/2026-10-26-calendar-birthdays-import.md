# Import birthdays from the Google Calendar "Birthdays" export (production, s@mombartz.com)

One-off data task, not a feature. Source: `Contacts Backup/Birthdays_c_tt51i50a6e7mi54stdu59re414@group.calendar.google.com.ics`.

## Approach

1. [x] Parse the ICS (320 events): strip the `GEB ` prefix, trailing `?` / `'s`; drop non-birthdays
   (`Sankt Martin`, `Cooking`). One date per person, preferring the event that still recurs
   (Sophie von Canal: 02-11 over the retired 02-04; Khaled Sharaf: 11-20). 272 distinct names.
2. [x] **Dates go in without a year** (`--MM-DD`). The DTSTART years are when the calendar events
   were created (2001–2026), not birth years.
3. [x] Match against production contacts through the signed-in browser session (read-only API):
   exact/all-token name matches with no close rival are auto-matched (149); 19 already have the same
   date and are left alone; 104 need a human choice (incl. 9 with no candidate).
4. [x] Review page injected into the signed-in Yello tab (data never leaves the user's own origin):
   tabs for *Needs a choice* / *Matched by exact name* / *Already has this birthday*, per-row search
   over all contacts, warnings where a contact's existing birthday would be replaced. Save stores the
   choices in `window.__choices` and `localStorage.bdayChoices`.
5. [x] Fix iCloud export of yearless birthdays first: `vcardGenerator` turned `--12-29` into the
   invalid `BDAY:1229`; it now writes `BDAY;X-APPLE-OMIT-YEAR=1604:16041229`.
6. [x] Deploy the fix (`8349619`, Railway deploy succeeded 16:52 UTC).
7. [x] Apply the saved choices from the tab through the normal API, so two-way sync picks them up:
   ticked 2+ contacts → `POST /api/duplicates/merge { contactIds, primaryContactId }` first; then
   `PUT /api/contacts/:id { birthday: "--MM-DD" }` on the kept contact; *create new* →
   `POST /api/contacts { displayName, firstName, lastName, birthday }`. Deduplicate by contact id.
8. [x] Read back each updated contact: all 241 carry the date, all 31 merged-away duplicates return 404.

## Changes

- 2026-10-26: review page reworked at the user's request. Checkboxes instead of radios: every
  contact whose name is identical to the calendar name is pre-ticked (17 entries have 2–3 such
  duplicates), and ticking 2+ merges them into the one marked *keep* (default: the one with the most
  title/company/email/birthday data) before the birthday is added. Added *Create a new contact*
  (editable name) to every entry. Single close matches (e.g. Alex → Alexandra Checkiewicz) are
  pre-ticked under *Check*. Tabs: Same name, will merge (17) / Check (69) / No match (9) /
  Exact name match (152) / Already has this birthday (25).
- 2026-10-26: applied 245 saved choices (241 contacts after spelling-variant duplicates): 27 merges,
  14 new contacts, 167 birthdays set, 60 already had the date. The first pass ran into the API's
  100 requests/minute limit (`@fastify/rate-limit` in `server.ts`) after ~55 writes; it was stopped
  and rerun as an idempotent pass (checks which contacts still exist / already merged / already
  dated before acting, ~80 req/min, waits out 429s). No errors, no existing birthday replaced.
  iCloud sync was already paused before this ("Could not sign in to iCloud: cannot find homeUrl",
  since 13:36 UTC), so the changes reach iCloud only once it is reconnected; Google syncs normally.

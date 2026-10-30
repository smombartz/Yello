# BDay 2026 group on production

**Goal:** the "BDay 2026" group (contact category) exists on production for s@mombartz.com, with the same 74 contacts as the local copy.

**Why this is needed:** the 74 assignments were written to the local dev database (`backend/data/users/3/contacts.db`). Production is on Railway with its own `/data` volume and different contact IDs.

## Steps

- [x] Install the Railway CLI (`/opt/homebrew/bin/railway`, v5.71.0)
- [ ] User runs `railway login` (interactive, browser)
- [ ] Link the CLI to the Yello project and production service
- [ ] Locate the production user database for s@mombartz.com (`/data/users/<id>/contacts.db`)
- [ ] Back up the production database on the volume before any write
- [ ] Match the 74 names (from `scratchpad/bday_local.csv`) to production contacts by display name; stop if any name is missing or duplicated
- [ ] Insert `BDay 2026` categories in one transaction, skipping existing rows
- [ ] Verify: 74 active contacts carry the category, and `/api/contacts/groups` shows it

## Changes

- 2026-10-30: plan created after discovering the local-only write.

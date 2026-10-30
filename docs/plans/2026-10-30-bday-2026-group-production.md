# BDay 2026 group on production

**Goal:** the "BDay 2026" group (contact category) exists on production for s@mombartz.com, with the same 74 contacts as the local copy.

**Why this is needed:** the 74 assignments were written to the local dev database (`backend/data/users/3/contacts.db`). Production is on Railway with its own `/data` volume and different contact IDs.

## Steps

- [x] Install the Railway CLI (`/opt/homebrew/bin/railway`, v5.71.0)
- [x] User runs `railway login` (interactive, browser)
- [x] Link the CLI to the Yello project and production service
- [x] Locate the production user database for s@mombartz.com: user 1, `/data/users/1/contacts.db`
- [x] Back up the production database on the volume before any write: `/data/users/1/contacts-before-bday2026-20261030.db`
- [x] Match the 74 names (from `scratchpad/bday_local.csv`) to production contacts by display name; stop if any name is missing or duplicated
- [x] Insert `BDay 2026` categories in one transaction, skipping existing rows (74 inserted)
- [x] Verify: 74 active contacts carry the category (DB check; UI check is the user's)

## Changes

- 2026-10-30: plan created after discovering the local-only write.
- 2026-10-30: SSH needed a key. `id_ed25519` is passphrase-protected, so a dedicated passphrase-free
  key `~/.ssh/railway_ed25519` was generated and registered with Railway. The `ssh.railway.com` host
  key (`SHA256:+S1xg92FrnHz6pY3bpkmh1OGtWQGNANXilPzlxA7B1g`) was added to `known_hosts` with the
  user's approval.
- 2026-10-30: 4 production names differed from the local copy and were matched explicitly:
  Katrina → Katrina Kaufman (#34756), Joshua Keay → Josh Keay (#34784), Nicola 🇺🇲 → Nicola 🇺🇸
  (#36224), George Surov → #37937 (the double-spaced card).

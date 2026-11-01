# Older message history: Gmail beyond 2 years, WhatsApp from an iPhone backup

Follow-up to `2026-10-31-top-contacts-messages.md`.

## Context

- **Gmail** scans the last 730 days on the first run, then only new mail. The user wants older mail too.
- **WhatsApp** on the Mac starts in 2023 for the user. The Mac app only holds the history the phone sent over when it was linked; older messages live on the iPhone.
- **Gmail:** a *Scan older emails* option where the user picks how far back (5 years, 10 years, all mail).
- **WhatsApp:** read WhatsApp's database from an iPhone backup made with Finder on this Mac.

## Gmail: scan older mail

1. ✅ `POST /api/messages/gmail/scan` takes `older: '5y' | '10y' | 'all'`. Without it, the scan is as before (first scan 2 years, then new mail).
2. ✅ An older scan covers `[target, covered_from − 1]`; *all* goes back to 2004-01-01 (Gmail's launch). Nothing to do → `409 already_covered`.
3. ✅ Every scan works in **calendar-year windows, newest first**, each saved as soon as it's counted (`saveTally` per window), so a long scan that stops keeps the finished years and `covered_from` moves back with them. All windows' message ids are listed first for an overall progress total.
4. ✅ Window queries: `after:` one day before the window and `before:` two days after (Gmail's dates are Pacific time); `saveTally` drops days outside the window, so boundary mail is counted once, in its own window.
5. ✅ Sources card: once Gmail has data, *Scan older emails* with 5 years / 10 years / All mail (choices already covered are hidden).

## WhatsApp: iPhone backup

6. ✅ `electron/src/messageActivity/iphoneBackup.ts`:
   - Lists backups in `~/Library/Application Support/MobileSync/Backup/*` (device name and date from `Info.plist`, encryption from `Manifest.plist`), newest first. Same Full Disk Access as the Mac databases.
   - Finds `ChatStorage.sqlite` (domain `AppDomainGroup-group.net.whatsapp.WhatsApp.shared`) and its `-wal` in `Manifest.db`, copies them to a temp folder, reads them with `readWhatsApp`, deletes the copy.
   - **Encrypted backups:** the user types the backup password (never stored). Keybag from `Manifest.plist` → passcode key (PBKDF2-SHA256 `DPSL`/`DPIC`, then PBKDF2-SHA1 `SALT`/`ITER`) → class keys (AES key unwrap) → `ManifestKey` decrypts `Manifest.db`; each file's key sits in its `Files.file` NSKeyedArchiver blob. AES-256-CBC, zero IV. A small binary-plist parser, no new dependencies.
7. ✅ Only days **before the Mac's own WhatsApp history** are uploaded (cut-off = the Mac database's first day), so the two sources never count the same day twice and Mac rescans don't touch the older days.
8. ✅ IPC: `messages:backups` (list) and `messages:scan-backup` (backup id, password?, untilDay), worker thread like the other scans.
9. ✅ WhatsApp card: *Older history from an iPhone backup* (pick a backup when there are several, password field when encrypted).

## Verification

- Backend tests: year windows, older range, `already_covered`.
- Electron tests: a fake unencrypted backup, and an encrypted one built with the same scheme (round trip), including a wrong password.
- Not verifiable here: the user's real backups and mailbox (this shell has no Full Disk Access). The user tries it in the desktop app.

## Changes

- **Backup days vs Mac days:** instead of cutting the backup off at the Mac database's first day (step 7 as first written), the backup is used for every day up to the day before it was made, and replaces the Mac's counts for those days. The phone has the complete history; the Mac's earliest messages can be scattered older ones loaded on demand, which would make a "first day" cut-off drop most of the backup. The Mac's scans still cover everything after the backup. A full Mac rescan of WhatsApp starts the day after the imported backup (remembered per Mac in `localStorage`), so it doesn't replace the backup's days with the Mac's partial ones.
- **Only the newest Gmail window is "final":** `ingestActivity` with `final` marks the source idle, so the earlier windows save without it and the scan keeps showing as running.

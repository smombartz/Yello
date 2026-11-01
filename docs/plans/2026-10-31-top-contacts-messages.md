# Top contacts from message activity (Gmail, iMessage, WhatsApp, Instagram, LinkedIn)

## Context

The goal is to see who the user actually talks to most, ranked by how many messages go back and forth and how often, across five channels. Yello has a start on Gmail already: the `gmail.readonly` scope, `emailDiscoveryService.discoverContacts` (scans the last N messages and counts them per contact) and `contact_emails_history`. There is nothing for the other channels. A 2026-02-10 iMessage plan (`docs/plans/2026-02-10-imessage-import.md`) was never built, and it assumed a local backend.

Constraints:
- **The backend runs on Railway.** It can't see the Mac's `~/Library/Messages/chat.db` (about 920 MB, confirmed on this Mac) or WhatsApp's `ChatStorage.sqlite`. Both are blocked by macOS until the reading app has **Full Disk Access**.
- **Electron is a thin client.** It has no preload, no IPC and no file access today. It ships Electron 44 / Node 24.21, so the built-in **`node:sqlite`** module is available (verified) and no native module is needed.
- **Instagram and LinkedIn** have no API for DMs. The only source is each platform's data export (Instagram JSON zip, LinkedIn `messages.csv`).

Decisions made with the user:
- The desktop app reads iMessage and WhatsApp locally and uploads **only per-person daily counts**, never message text.
- Instagram and LinkedIn come in through export upload.
- Ranking offers both a recency-weighted score and raw counts, with a switch between them.

## Approach

### Core idea: one aggregate format for every channel
Every source boils down to rows of `(channel, handle, day, sent, received, group_received)` plus a handle directory. The handle is a normalized phone, email, username or profile URL. Matching and ranking happen once, on the server, over these rows. No message bodies are stored anywhere.

### 1. Schema (per-user DB, `backend/src/services/userDatabase.ts` + `docs/database.md`)
- **`message_activity`**: `channel` (CHECK in gmail/imessage/whatsapp/instagram/linkedin), `handle`, `day` (YYYY-MM-DD local), `sent`, `received`, `group_received`. PK `(channel, handle, day)`.
- **`message_handles`**: `channel`, `handle`, `handle_kind` (phone/email/username/url/opaque), `display_name`, `contact_id` (NULL until matched, ON DELETE SET NULL), `match_source` (auto_phone/auto_email/auto_profile/name/manual/ignored), `first_day`, `last_day`. PK `(channel, handle)`, index on `contact_id`.
- **`message_sources`**: `channel` PK, `last_imported_at`, `covered_through` (day), `status`, `error`.
- Ingest is idempotent: for the day range an upload covers, delete that channel's rows in the range and insert the new ones. A re-scan replaces data instead of double-counting it.

### 2. Matching (new `backend/src/services/messageMatching.ts`)
- **Phones** (iMessage, WhatsApp): normalize to E.164 with `libphonenumber-js`, the same `parsePhoneNumberFromString(.., 'US')` approach as `googlePeopleService.ts`. Pull it out into a shared `toE164()` helper. Match against `contact_phones.phone`, falling back to a last-9-digits comparison for numbers that were stored without a country code.
- **Emails** (Gmail, iMessage email handles): lowercase match on `contact_emails.email` (already indexed NOCASE).
- **Instagram:** username against `contact_social_profiles` (platform `instagram`, `username` or `profile_url`).
- **LinkedIn:** normalized `/in/<slug>` URL against `contact_social_profiles` (platform `linkedin`).
- **Name suggestions:** when the above fails and the source has a display name (WhatsApp partner name, Instagram and LinkedIn names), a unique exact `display_name` match becomes a *suggestion* rather than a link.
- Auto-matching re-runs for unmatched handles after every ingest and when the Top contacts page loads. It's cheap: a few thousand handles.

### 3. Matching UX: "Who is this?" review queue
On the Top contacts page, a "Needs a match" tab lists unmatched handles **you have sent at least one message to**. That filter drops newsletters and spam. They're sorted by volume, and each row shows channel, handle, display name, message count and last date. Actions:
- **Accept suggestion**: one click, plus "Accept all name suggestions" in bulk.
- **Pick contact…**: the existing contact search. Linking can **also add the phone, email or profile to the contact** (on by default), which improves the address book and syncs to iCloud/Google. That means `/api/messages/handles` goes into `EDITING_PREFIXES` in `syncScheduler.ts`.
- **New contact** (prefilled), **Ignore** (hidden for good), and **Unlink** for wrong matches.

### 4. Ranking (`GET /api/messages/top`)
- **Score mode:** Σ over days of `(sent + received + 0.25·group_received) · 0.5^(age_days/180)`, times a reciprocity factor `0.5 + 0.5·min(s,r)/max(s,r)` so one-way traffic ranks lower.
- **Count mode:** plain totals over a chosen window (30 d, 90 d, 1 y, all), optionally filtered to one channel.
- Grouped by `contact_id` across channels. Each row returns per-channel counts, the last contact date and a 12-month sparkline series.

### 5. Gmail (server-side, existing token)
New `backend/src/services/gmailActivityService.ts`, reusing `gmailFetch`, `fetchMessageMetadata`, `extractEmailAddresses` and `getHeader` from `emailSyncService.ts` and `getValidAccessToken`.
- **First run:** the last 2 years. After that, incremental from `covered_through` using `after:`.
- **Counting:** a message labelled SENT adds +1 sent to each To/Cc address, otherwise +1 received for From. The query excludes `category:promotions/social/updates/forums`, and messages with `List-Unsubscribe` or `Precedence: bulk` are skipped.
- **Runs as a background job:** reuse the `import_jobs` pattern (`importJobService.ts`, `kind = 'gmail_activity'`) so `BackgroundJobPill` shows progress. If a column doesn't fit, adapt it.
- If the scope is missing, return `gmail_scope_required` and send the user to the existing `/api/auth/google/gmail` re-auth.

### 6. iMessage + WhatsApp (Electron desktop app)
- **New `electron/src/preload.ts`:** `contextBridge` exposes `window.yelloDesktop.messages.{status(), scan(channel, sinceDay), openFullDiskAccessSettings()}`. Main's `webPreferences` gains `preload`, and `sandbox: true` stays.
- **New `electron/src/messageReaders.ts`:** `ipcMain.handle` handlers check that `event.senderFrame.url` passes `isAppUrl`. Both databases are opened read-only with `node:sqlite`, aggregated by handle and day, and only counts are returned.
  - **iMessage (`chat.db`):** join `message` → `chat_message_join` → `chat`. In 1:1 chats (`chat.style = 43`) the handle comes from `chat_handle_join` and both directions count. In groups only `received` from `message.handle_id` counts. Skip reactions (`associated_message_type != 0`) and system items (`item_type != 0`). Dates are nanoseconds since 2001-01-01; older rows are in seconds, so detect magnitude.
  - **WhatsApp:** `~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite`, tables `ZWAMESSAGE`, `ZWACHATSESSION` and `ZWAGROUPMEMBER`; `ZMESSAGEDATE` is seconds since 2001. 1:1 vs group comes from `ZSESSIONTYPE`, the handle from the `…@s.whatsapp.net` JID, and the display name from `ZPARTNERNAME`. `@lid` JIDs have no phone number, so they become `opaque` handles matched by name. **Verify the column names on the real file first** (step 6a): the schema isn't documented.
- **Permission flow:** if opening fails with `EPERM`/`authorization denied`, `status()` returns `needs_full_disk_access`. The UI then shows "Open System Settings" (`x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles`) and "Restart Yello".
- **Upload:** the renderer posts the aggregates to `POST /api/messages/activity` with the session cookie, chunked by year to stay under Fastify's body limit. Re-scans read from `covered_through − 2 days`. Automatic refresh (on launch and every 6 h while open) is an opt-in switch per channel, off by default (see Changes).

### 7. Instagram + LinkedIn (export upload, parsed in the browser)
- Parsed **client-side** with `@zip.js/zip.js` (random-access `BlobReader`), so multi-GB Instagram exports with media never upload. Only aggregates go to `POST /api/messages/activity`. This works in the browser and the desktop app alike.
- **Instagram:** `your_instagram_activity/messages/inbox/*/message_*.json`. Fix the export's latin1-mojibake text. The username comes from the thread folder (`username_123…`), with `sender_name` and `timestamp_ms`. Group threads (more than 2 participants) count as `group_received`.
- **LinkedIn:** `messages.csv` (on its own or inside the zip). Columns are FROM, SENDER PROFILE URL, TO, RECIPIENT PROFILE URLS and DATE, and the user's own profile URL tells sent from received.
- The UI gives short instructions for each, with links to each platform's export page (Instagram: JSON format, "Messages" only).

### 8. API + UI
- **New `backend/src/routes/messages.ts`** (prefix `/api/messages`, TypeBox schemas in `schemas/messages.ts`):
  - `GET /sources`
  - `POST /activity` (ingest)
  - `POST /gmail/scan`
  - `GET /top?mode=score|count&window=&channel=`
  - `GET /handles?status=unmatched|suggested|ignored`
  - `POST /handles/link`, `/handles/ignore`, `/handles/unlink`
- **`GET /api/contacts/:id/message-stats`** for a small "Messages" summary on `ContactDetailPage`.
- **Frontend:**
  - A new `TopContactsView` at `dashboard/top`, with a teaser card on `DashboardView` like the birthdays and recent cards. It has the ranked list, the score/count switch, the window picker, channel chips and the "Needs a match" tab.
  - A "Message sources" panel in `SettingsView` (Tools) with one row per channel showing status, last import and its action: Scan Gmail, Scan Mac (desktop only, otherwise "Available in the Yello desktop app"), Upload export.
- Optionally, extend `sort=last-contacted` (`routes/contacts.ts` ~474) to use `MAX(day)` across `message_activity` and not only Gmail history.

## Build order
Work on a new branch `feature/top-contacts` (off `master`), commit per step.

0. ✅ Copy this plan to `docs/plans/2026-10-31-top-contacts-messages.md` and add a roadmap item with these steps to `.dashcode/roadmap.json`.
1. ✅ Schema, ingest route, matching and the ranking endpoint, with Vitest tests for matching (E.164 variants, email case, LinkedIn URL forms), ingest idempotency and score math.
2. ✅ Gmail activity job, so there's real data to see.
3. ✅ Top contacts view and the review queue.
4. ✅ Electron preload and readers: iMessage, then WhatsApp. (6a, checking the schemas against the real files, is still open: it needs Full Disk Access, which this dev shell doesn't have. The readers check for the tables and columns they use and fail with a clear message if WhatsApp changed its layout.)
5. ✅ Instagram and LinkedIn export parsers.
6. ✅ Contact detail summary, last-contacted sort, docs (`docs/reference.md`, `docs/database.md`, `electron/README.md`) and log entries.

## Verification
- `cd backend && npx vitest run` (new tests for matching, ingest and ranking), plus `npm run build` in `frontend`.
- Exercise the API with curl against the running dev server: post a synthetic aggregate batch, then check `/top` in both modes and that `/handles` lists the unmatched ones; link, then re-check.
- Electron: `cd electron && npm run dev`. Before Full Disk Access, the status should report `needs_full_disk_access`. After granting it (to Electron in dev), a scan returns aggregates; spot-check two or three known contacts' counts against Messages and WhatsApp.
- Gmail: run the scan on the user's account and compare a couple of contacts with Gmail search counts.
- UI look and feel is checked by the user.

## Caveats to tell the user
- Full Disk Access is granted per app signature. The app isn't notarized, so a rebuilt desktop app may need re-granting. The desktop app also has to be rebuilt and reinstalled once to get the new preload; the web part updates as usual.
- WhatsApp desktop only holds the history that synced to the Mac. Some contacts appear as `@lid` IDs with no phone number and need a name match or a manual one.
- Instagram and LinkedIn are snapshots. Refreshing them means requesting a new export.
- Gmail's restricted scope is fine for the user's own account. Offering it to other users would need Google's security review.

## Changes

Changes made during implementation (2026-11-01):

- **Gmail scan doesn't reuse `import_jobs`.** `importRecovery` would try to resume any interrupted job as a VCF import. The scan keeps its own status and progress in `message_sources` (`status`, `progress_done`, `progress_total`); a scan cut off by a restart shows as failed on the next `GET /sources`.
- **`group_received` became `group_messages`.** Sent group messages count too: a message you send to a group counts as a group message for every member, and an email to 3+ people counts as a group email for each recipient.
- **Sources live on the Top contacts page (a "Sources" tab), not in Tools.** Everything for the feature is in one place, and it stays clear of `SettingsView`, which the Text Blast session was editing at the same time.
- **The per-contact summary route is `GET /api/messages/contacts/:id`,** not `/api/contacts/:id/message-stats`. It sits with the other message routes in `routes/messages.ts`.
- **Instagram people are `opaque` handles (`ig:<thread folder>`) matched by name.** Export folder names come from display names, not reliably from usernames, so auto-matching them to Instagram usernames could link the wrong person.
- **iMessage tells 1:1 chats from groups by participant count** (`chat_handle_join`) rather than `chat.style`, whose values aren't documented.
- **Detecting Full Disk Access:** macOS lets apps see these files but not open them, and SQLite only reports "unable to open database file". The status check tries a plain file open first, which returns `EPERM`.
- **Shared working tree:** a Text Blast session works in the same checkout at the same time. Its preload exposes `window.yelloDesktop.textBlast`; Top contacts adds the sibling key `messageActivity` and `messages:` IPC channels.
- **Automatic iMessage/WhatsApp refresh is opt-in (2026-11-01, user request).** Each desktop card has a *Refresh automatically* switch, off by default and stored per Mac. *Scan new messages* reads only from two days before the last imported day; *Rescan everything* stays for a full re-read. Counts are stored per day, so the incremental scan starts at a day boundary rather than an exact timestamp: re-reading those whole days replaces them cleanly instead of adding to them. The iMessage date filter was rewritten to hit the date index, so the incremental read no longer walks all of chat.db.

# Yello as source of truth: two-way sync with iCloud + Google Contacts


## Context

The user is moving off Apple Contacts (Mac, iPhone, iCloud) and Google Contacts (Gmail) onto Yello.

**Yello is the clean copy.** The user has deduplicated and merged many contacts in Yello. The Apple and Google address books are still uncleaned and full of the old duplicates. So the cutover must not union everything back in from the remotes.

The cutover does three things:
- **Imports two kinds of change from Apple/Google:**
  - updates to contacts that already exist in Yello
  - contacts created on the phone or in Gmail in the last 3 months
- **Replaces the remote address books** with Yello's clean list. The old duplicates get deleted from iCloud and Google.
- **Backs up first.** No remote data is deleted until a verified backup of that address book exists and the user has been walked through it.

After cutover, Yello is the source of truth and keeps iCloud and Google in sync.

Today Yello only *pulls*. iCloud is a full CardDAV pull via tsdav (`services/icloudService.ts`) and Google is a full People API pull (`services/googlePeopleService.ts`). Neither has etags, sync tokens, write-back, deletion handling or a scheduler, and Google scopes are read-only.

**Decisions (from the user):**
- **Ongoing sync:** two-way, Yello wins. Remote edits are pulled in. When both sides changed, Yello wins and the overwritten remote version is logged so it can be restored.
- **Cutover:** the Yello list is the base. Remote changes inside the import window (default 3 months, adjustable on the dry-run screen) are applied to matched contacts field by field. Multi-value additions are unioned and empty fields are filled. Only real scalar conflicts go to review. Remote contacts that are new inside the window are imported. Everything else that exists only on a remote gets deleted there, after backup.
- **Deletions:** archiving in Yello deletes the contact in Google and iCloud, and unarchiving re-creates it. A delete on the phone or in Google archives the contact in Yello; it never hard-deletes.
- **Devices:** Apple devices currently have both iCloud and Google Contacts turned on. After cutover, Google Contacts gets turned off on Apple devices, so devices read iCloud and Gmail reads Google.

**Refinement adopted:** "Yello wins" is applied **per field**, not per contact. If the phone changed a title and Yello changed a phone number, both survive. Only the fields both sides changed resolve to Yello. This still honours "Yello wins", and it can be switched to whole-contact if preferred.

## Key findings that shape the design

- `contacts.updated_at` is unreliable: about 20 write sites don't bump it. Change detection therefore uses a **content hash of a canonical per-provider projection**, not timestamps.
- `contacts.icloud_uid` is effectively the general vCard UID. Contacts created in the app have none.
- A **three-way baseline already exists**: `/data/users/<id>/archive/original-cards-<date>.vcf.gz`, written by `retireRawVcards` and tagged `X-YELLO-CONTACT-ID`. If a field equals the baseline on one side, only the other side changed, so it auto-resolves without review. This shrinks the review list dramatically.
- **Existing bugs:**
  - The `routes/icloud.ts` merge path calls `insert*.run(...)` with too few arguments (around lines 247-322), so the call throws.
  - The iCloud photo `source='icloud'` (lines 155 and 335) violates the `contact_photos` CHECK constraint.
  - Apple group cards (`X-ADDRESSBOOKSERVER-KIND:group`) get imported as fake contacts.
  - `mergeService` drops the secondary contact's `icloud_uid` and `google_resource_name`.
  - No OAuth flow sends `include_granted_scopes=true`, so re-consent can silently drop the Contacts scope.
- tsdav 2.1.8 already has `syncCollection`, `isCollectionDirty`, `addressBookMultiGet` and `createVCard`/`updateVCard`/`deleteVCard`.
- There is no scheduler. The model to follow is `importRecovery.ts`, which loops `listUserIds()` + `getUserDatabase()` and is called after `app.listen`.
- Another session has uncommitted work in `server.ts`, `tokenEncryption.ts` and `tokenKeyRotation.ts`. Don't touch the encryption files, and add the one-line scheduler start in `server.ts` only after that work is committed.

## Data model (`backend/src/services/userDatabase.ts` + `docs/database.md`)

**`contact_sync_links`**
- Columns: `contact_id` (FK, cascade), `provider` (`icloud|google`), `remote_id` (iCloud href or Google resourceName), `remote_uid`, `etag`, `local_hash`, `remote_hash`, `local_snapshot`, `remote_snapshot` (projection JSON, no photo bytes), `local_photo_hash`, `remote_photo_hash`, `status` (`active|pending_create|deleted|error`), `last_error`, `last_pulled_at`, `last_pushed_at`.
- Constraints: `UNIQUE(provider, remote_id)` and `UNIQUE(contact_id, provider)`.

**`sync_tombstones`**
- Filled by a `BEFORE DELETE ON contacts` trigger. This catches every hard-delete path without editing them: `archiveService.ts:192`, `mergeService.ts:486` and delete-all.
- The engine deletes the matching remote record. A tombstone also blocks the record from being re-imported.

**`sync_providers`** (one row per provider)
- `enabled`, `paused`
- `collection_url`, `sync_token`, `ctag`
- `last_run_at`, `last_success_at`, `last_error`, `consecutive_failures`
- `cutover_completed_at`
- `lock_holder`, `lock_until`: a lease, so overlapping Railway deploys can't sync the same user twice

iCloud credentials stay in `user_settings`, handled by `encryptToken`/`decryptToken`.

**Logs**
- `sync_runs`: trigger, counters, errors.
- `sync_remote_versions`: the recovery log. It stores the raw vCard or Person JSON for conflicts, remote deletes and cutover overwrites, kept for 180 days.

**Cutover**
- `sync_cutovers` is a durable job modelled on `import_jobs` and resumes on boot.
- `sync_cutover_items` holds the conflicts and possible matches with their resolutions.

**Contact UID**
- Backfill a `randomUUID()` UID for every contact once.
- Assign one at every create site: `contacts.ts:480`, `importService.insertContact`, and the Google and iCloud imports.

## Sync engine (`backend/src/services/sync/`)

**Run order (per user, under the lock):** pull iCloud, then pull Google, then push iCloud, then push Google. This way a phone edit reaches Google in the same run.

**Change detection**
- *Local changed* means `hash(project(local)) != local_hash`.
- *Remote changed* means `etag != link.etag` and `hash(project(remote)) != remote_hash`.
- If both projections are already equal, record both hashes and do nothing. This absorbs our own writes echoing back and recovers from a crash mid-push.
- Hash in chunks with `setImmediate` yields so better-sqlite3 doesn't block the event loop.

**Decision per changed contact:** diff the snapshots field family by field family.
- Remote-only changes are applied to Yello. Only *this* provider's link hashes are updated, so the other provider still sees the contact as changed and receives the push. This is how loops are prevented while edits still propagate.
- Fields changed on both sides resolve to Yello, and the remote payload goes to `sync_remote_versions`.
- **Remote deleted:**
  - If Yello is unchanged, archive the contact in Yello, which then deletes it from the other provider.
  - If Yello did change, re-create the remote record and log it.

**iCloud adapter (`icloudSyncAdapter.ts`)**
- **Pull:** use `isCollectionDirty` (ctag) to skip unchanged books. Fetch deltas with `syncCollection`; if the token is rejected, fall back to an etag diff. Then run `addressBookMultiGet` in batches of about 100, streamed, skipping group cards.
- **Push:** use `generateVcard` in a new `{ sync: true }` mode, which drops the stale imported `REV`/`PRODID` and the `X-YELLO-LINKEDIN` blob, adds a fresh `REV`, and sets UID to `remote_uid`. Writes are:
  - `PUT <book>/<uid>.vcf` with `If-None-Match: *` (create)
  - `PUT` with `If-Match: <etag>` (update)
  - `DELETE` with `If-Match: <etag>` (delete)
- **Errors:** on 412, re-fetch and re-decide. On 503, honour `Retry-After`.
- **After a push,** multiget the pushed cards and hash what the server actually stored, since iCloud rewrites cards.

**Google adapter (`googleSyncAdapter.ts` + `googlePersonMapper.ts`)**
- **Pull:** `people/me/connections` with `requestSyncToken`, then `syncToken`. A 410 or EXPIRED_SYNC_TOKEN triggers a full resync. Use the same `personFields` on every page. Only read field values whose source is `CONTACT`, never profile-sourced ones.
- **Push:**
  - Use `batchCreateContacts`/`batchUpdateContacts` (up to 200, with etag and an `updateMask` limited to mapped fields) and `batchDeleteContacts` (up to 500).
  - Send mutations sequentially, through a token bucket, with back-off on 429.
  - Photos go through a throttled `updateContactPhoto` queue at about one per second.
- **Identity:** write `clientData` `yelloUid` on every contact. **Never write `memberships`**, so Google labels are preserved.
- **Mapping:** extend the thin existing mapping to cover:
  - names (given, family, middle, prefix, suffix), nicknames
  - organizations (with department and title)
  - biographies for notes
  - birthdays, including Apple's no-year marker `1604` ↔ Google's year-less date
  - events, relations, imClients, genders, urls
  - social profiles, sent as typed urls
  - Apple label ↔ Google type tables

**Merge, archive and guards**
- `mergeService` hands the secondary contact's links to the primary contact. If the primary already has a link for that provider, the secondary's link becomes a tombstone, so the remote duplicate gets deleted.
- **Mass-change guard:** if a run would delete or archive more than max(20, 5%) of contacts, or create more than 300, that provider pauses and the UI asks for confirmation.
- `DELETE /api/contacts/all` returns 409 while sync is enabled.
- The legacy iCloud and Google import buttons become "Sync now" once sync is on, so they can't create unlinked duplicates.

## Backups and deletion safety (ships first, usable on its own)

**Backup function (`services/sync/remoteBackupService.ts`, `GET/POST /api/sync/backups`)**
- **One click** pulls the full iCloud book and the full Google contact list and stores them in `/data/users/<id>/backups/<provider>-<ts>/`. Each backup has three files, all downloadable:
  - **`<provider>.vcf`**, a single vCard file that re-imports natively. For iCloud, drag it into Contacts.app or import it at iCloud.com. For Google, use contacts.google.com › Import.
  - **The raw form for full fidelity:** the iCloud cards exactly as the server returned them, or the Google Person JSON with contactGroups.
  - **`manifest.json`**, with counts and a checksum.
- **Verification:** the backup re-parses its own `.vcf` and checks the card count against the remote count. A backup is only marked `verified` if the counts match.
- **Yello is backed up too:** each backup also takes a `db.backup()` snapshot of Yello itself.

**Deletion gate (enforced in the engine, not just the UI)**
- No remote delete runs for a provider (cutover, archive-propagation or mass-change) unless both are true:
  - that provider has a `verified` backup from the last 24 h;
  - the user has confirmed "I've downloaded / I have my own backup".
- **Ongoing sync:** single-contact deletes after cutover are covered by `sync_remote_versions`. Any run over the mass-change threshold needs a fresh backup again.

**Guide**
- A modal and checklist appear before the first deletion, with step-by-step instructions for native backups as a second safety net:
  - Mac Contacts › File › Export › Contacts Archive (.abbu)
  - iCloud.com › Contacts › select all › Export vCard
  - contacts.google.com › Export › Google CSV, or Google Takeout
- It also shows the deletion list: what will be removed from each remote, with names, so nothing disappears unseen.

**Restore**
- Any backup can be pushed back to its provider ("restore this backup to iCloud/Google"). This is an escape hatch that re-creates the deleted cards. It's built in Phase 4, alongside the cutover.

## Cutover reconciliation (`cutoverService.ts`, one durable job)

**Principle:** Yello's cleaned list is the base. Remotes only contribute recent changes.

1. **Backup:** a verified backup of both remotes and of the Yello database is required (see above). Pull and apply use exactly the backup's snapshots, so the outcome is deterministic.
2. **Match** each remote card to Yello using `matchIncomingContacts` (`icloudMatchingService.ts:226`). Extend it to index UIDs, resourceNames, links and the baseline-archive UIDs.
   - `very_high`/`high` matches link automatically. `medium` matches go to review.
   - **Several remote duplicates matching one Yello contact** is the normal case after the user's cleanup. The best match becomes the link. The others are **merged-from**: only their in-window changes are applied, and they're queued for remote deletion.
3. **Classify each remote card**, using the import window (default 3 months) plus the baseline archive (`original-cards-*.vcf.gz`, tagged `X-YELLO-CONTACT-ID`) to tell what is new and what changed.

   | Remote card | Signal | Action |
   |---|---|---|
   | Matched, changed in window | iCloud `REV` / Google `updateTime` inside window, and fields differ from baseline | Apply remote-changed fields field by field. Yello wins on fields it also changed. A true conflict goes to review, pre-selected with the newer side |
   | Matched, not changed in window | Outside window, or equal to baseline | Yello's version is pushed and overwrites it |
   | Unmatched, new in window | UID not in baseline and `REV`/`updateTime` inside window | **Import into Yello** (on by default; can be turned off per card in review) |
   | Unmatched, in baseline, contact gone from Yello | Removed or merged away during the user's cleanup | **Delete remotely** (after backup) |
   | Unmatched, old, not in baseline | Old remote-only clutter | **Delete remotely** by default. Listed in review with a "keep → import" toggle |
   | Archived in Yello | | Delete remotely. If the remote changed after the archive date, it goes to review as "restore?" |

   - **Merge-loss caveat:** the baseline links a card to a Yello id, but merges hard-delete the secondary contact's id. So a card from a merged-away contact is recognized by matching, not by id.
   - **Created dates aren't available:** neither CardDAV nor the People API exposes a creation date. "New in window" is approximated as not in baseline plus modified inside the window. For Google, which has no baseline, it is just modified inside the window. An old contact edited recently can therefore look new, which is why every import candidate is listed with a toggle.
   - **Photos:** a remote photo is taken only if Yello has none. They are never sent to review.
4. **Dry-run summary** (runs on a throwaway `db.backup()` copy):
   - **Coming into Yello:**
     - updates: N contacts, N fields
     - new: N contacts
     - for review: N conflicts, N possible matches
   - **Removed from each remote:**
     - N duplicates merged into a Yello contact
     - N removed in cleanup
     - N old remote-only
   - **Pushed to each remote:** N created, N updated
   - **Also shown:** a window selector (1, 3 or 6 months, or custom), the UID-match share, "accept all suggestions", and the full deletion list.
5. **Apply** to Yello in one transaction, then create links from the snapshots with `local_hash = NULL`.
6. **First push**, gated by the deletion gate:
   - creates: Yello contacts with no remote card
   - updates: linked contacts that differ
   - deletes: duplicates and remote-only clutter
   - the order is creates and updates first, deletes last, so a crash never leaves a contact missing on both sides
7. **Finish:** set `cutover_completed_at`, enable the scheduler, and show the runbook checklist.

## Scheduling and API

- **`syncScheduler.ts`:** a `setInterval` runs every `SYNC_INTERVAL_MINUTES` (default 10) and handles one user at a time.
  - Locking is an in-memory per-user promise map plus the database lease.
  - A provider auto-pauses on iCloud 401 or Google `invalid_grant`, and backs off after 5 failures.
- **Push-on-edit:** one global `onResponse` hook in `routes/sync.ts` catches 2xx non-GET responses under `/api/contacts|archive|duplicates|cleanup` and triggers a run, debounced 45 s. This avoids touching about 21 writer files.
- **`routes/sync.ts` (`/api/sync`):**
  - Status and control: `status`, `run`, `pause`, `resume`, `runs`.
  - Recovery: `remote-versions` (+ `/:id/restore`).
  - Setup: `icloud/enable` (pick the address book).
  - Cutover: `cutover` (+ `/:id`, `/:id/items`, `/:id/resolve`, `/:id/apply`, `/:id/abort`).
  - Backups: `backups`.
- **Google OAuth (`routes/auth.ts`):**
  - Add `/api/auth/google/contacts?write=1`, which requests `https://www.googleapis.com/auth/contacts`.
  - Add `include_granted_scopes=true` to all flows.
  - `contacts-status` reports `none|readonly|write` (via tokeninfo).

## Phases (each shippable on its own, behind `sync_providers.enabled`)

**Phase 0: Safety and bug fixes** — ✅ done 2026-10-25
- ✅ Shared `services/contactPersistence.ts` (`prepareContactStatements`, `insertParsedContact`, `mergeParsedIntoContact`), used by the VCF import job and `routes/icloud.ts`. Fixes the argument-count bug.
- ✅ Photo source `'icloud'` → `'vcard'` (via the shared statements).
- ✅ Group cards skipped in `parseVcf` and the import job (`isGroupVcard`). *Reporting already-imported group cards moved to the Phase 1 dry run.*
- ✅ UIDs and resourceNames kept through merges: the survivor adopts a missing one, the rest go to a new `contact_merged_identities` table, which `matchIncomingContacts` treats as authoritative.
- ✅ `include_granted_scopes=true` on all three Google OAuth flows.
- ↪ Delete-all 409 *moved to Phase 1*: it keys off `sync_providers.enabled`, which Phase 1 creates.
- ✅ **Backup function.** `services/sync/remoteBackupService.ts` + `services/sync/googlePeople.ts` + `/api/sync/backups` (`routes/sync.ts`), with streaming iCloud reads (`streamICloudCards`), verification, Yello DB snapshot, and the deletion gate (`checkDeletionGate`/`assertDeletionAllowed`). Tools page "Before you switch › Back up Apple & Google contacts" card with the native-backup guide (`RemoteBackupsContent.tsx`, `api/syncHooks.ts`).

**Phase 1: Foundations (no remote writes)**
- Schema, tombstone trigger and UID backfill.
- `DELETE /api/contacts/all` returns 409 while sync is enabled (moved from Phase 0).
- Dry run lists Apple group cards imported before Phase 0 as contacts, so they can be archived.
- `syncProjection.ts` and `generateVcard({ sync: true })`.
- `googlePersonMapper.ts`.
- Export a shared `loadContactsForVcard(db, ids, {photos})` from `vcardExportService.ts`.
- Streaming iCloud read side.
- The read-only cutover dry run, so you can preview your real reconciliation numbers early.

**Phase 2: iCloud two-way engine**
- `syncEngine.ts` + `icloudSyncAdapter.ts`, feature-flagged.

**Phase 3: Google two-way engine**
- Write scope, adapter, batching, photo queue.

**Phase 4: Cutover**
- Backups, plan, review UI (`components/sync/CutoverWizard.tsx`, `CutoverReview.tsx` styled like `ImportMatchCards`), apply, first push, resume after a crash.

**Phase 5: Scheduler and UI**
- `components/SyncView.tsx` with status cards, Sync now, Pause, runs log and mass-change confirm.
- `RemoteVersionsPanel.tsx` on contact detail, for restore.
- `api/syncHooks.ts`.
- A Sync group at the top of `SettingsView.tsx`.
- Disable the legacy import buttons.

Every phase gets a `docs/log.md` entry, `docs/database.md` updates and `docs/reference.md` notes.

**Reuse:**
- `matchIncomingContacts`
- `vcardParser.parseSingleVcard`/`parseVcf`, `vcardGenerator.generateVcard`
- `vcardModelStore.saveVcardModelFields`/`mergeVcardModelFields`
- `googleAuthService.getValidAccessToken`, `icloudService.buildICloudClient`
- `encryptToken`/`decryptToken`
- `listUserIds`/`getUserDatabase`
- the `importJobService` + `importRecovery` durable-job pattern

## Verification

**Unit and integration (Vitest, `cd backend && npx vitest run --testTimeout=20000`)**
- **Round trip:** projecting a contact, serializing it, parsing it back and projecting again gives the same hash. Run this on the sample VCFs for both vCard and Google Person.
- **Database:** the tombstone trigger fires on all delete paths. The UID backfill is idempotent. The iCloud merge route no longer throws. Group cards are skipped.
- **iCloud engine**, against a fake CardDAV server via `vi.mock('tsdav')`:
  - a second run is a no-op
  - a phone edit is pulled in, then pushed to Google
  - a both-sides edit resolves per field to Yello, with the remote version logged
  - 412 retry
  - a remote delete archives the contact; archiving deletes remotely; unarchiving re-creates
  - mass-delete guard
  - an invalid sync token falls back to the etag diff
- **Google engine**, with mocked `fetch`: 410 resync, etag mismatch, profile-source fields ignored, `memberships` untouched, batching limits.
- **Cutover:** run one fixture containing all of these cases:
  - a cleaned Yello list: two remote duplicates merged into one Yello contact, plus one contact deleted in the cleanup
  - a baseline
  - an Apple change inside the window, and one outside it
  - a Yello-only change and a both-sides change
  - a new phone contact inside the window
  - old remote-only clutter
  - a duplicate present in both Google and Apple

  It must produce the classification table's actions exactly. Resume after a simulated crash works. Creates must be pushed before deletes.
- **Deletion gate:** the engine refuses remote deletes without a verified backup from the last 24 h plus the user's confirmation. A backup's `.vcf` re-parses to the remote count, and a corrupted file fails verification.

**Frontend:** `cd frontend && npm run build`.

**Live:** test against a throwaway Apple ID and Google account before touching real data. Check that counts in Yello, iCloud.com and contacts.google.com match. UI checks are the user's.

## Cutover runbook (for the user)

1. **Prepare:**
   - On iPhone, iPad and Mac, set the default Contacts account to iCloud, and move any "On My iPhone/Mac" contacts into iCloud.
   - **Back up.** In Yello, use "Back up Apple & Google contacts" and download both `.vcf` files. Also make the native backups the in-app guide lists: a Mac Contacts archive (.abbu) and a Google CSV export. Keep all of them until at least 90 days after cutover.
2. **Google OAuth consent screen:** move it out of **Testing**, where refresh tokens expire every 7 days. Publish it, or make it Internal if it lives in the mombartz.com Workspace. `contacts` is a sensitive scope, so an unverified app shows a warning.
3. In Yello, grant Google write access and confirm the iCloud connection.
4. **Run the dry run.** Avoid editing contacts on the phone or in Gmail for the roughly 30-60 min window. Then:
   - Check the window (3 months by default).
   - Read the summary and the UID-match share.
   - **Scan the "removed from iCloud/Google" list,** and toggle "keep → import" on anything that should survive.
   - Spot-check about 10 contacts.
   - Resolve conflicts and possible matches.
5. **Apply** and wait for the push. Google photos may trickle in for about an hour. Then compare counts across Yello, iCloud.com and contacts.google.com.
6. **Turn off Google Contacts on Apple devices:**
   - iPhone: Settings › Apps › Contacts › Accounts › Gmail › Contacts off, then choose "Delete from My iPhone" (this removes only the local copy).
   - Mac: System Settings › Internet Accounts › Google › Contacts off.
   - Check Contacts.app for duplicates.
7. **Smoke test:**
   - Edit a phone number on the iPhone. It should reach Yello within about 10 min, then Google.
   - Edit in Yello. It should reach the iPhone.
   - Delete a test contact on the iPhone. It should be archived in Yello and gone from Google.
   - Unarchive it. It should come back on both.
8. **After:**
   - Don't use Google's "Merge & fix"; merge in Yello instead.
   - Check the sync log daily for a week.
   - Keep the backups for 90 days.

## Risks

- **Mass deletions:** covered by the guard, tombstones, the remote-version log, backups and the delete-all 409.
- **Duplicates:**
  - From devices having both accounts on: runbook step 6.
  - From the legacy import buttons: they get disabled.
  - From fuzzy matches: medium and low matches go to review.
- **Photos:** Apple and Google recompress images, so track separate per-side photo hashes. Stream rather than buffer, and throttle the Google photo quota.
- **Google limits:** sequential mutations and back-off. Sync tokens expire after about 7 days, which triggers a full resync.
- **Apple vCard quirks:** stale REV, UID immutability on CardDAV, group cards, and a single address book that can't be cloned for testing (use a separate Apple ID).
- **Concurrent work:** the `server.ts` edit has to wait until the other session's changes are committed.
- **Cutover deletes many remote cards on purpose** (the old duplicates). That is why the cutover has its own reviewed deletion list plus the backup gate, and why the mass-change guard only applies to ongoing runs.
- **"Created in the last 3 months" is approximate** (see the cutover section), so an old contact edited recently can look new. Every import and delete candidate is listed and can be toggled, and the window can be adjusted.

## Changes

- **2026-10-25:**
  - Yello's deduplicated list is now the base for the cutover. It replaces the plan to union everything from the remotes.
  - Only in-window remote updates to matched contacts, and contacts new in the window, are imported. Everything else that exists only on a remote is deleted after backup.
  - Added the backup function, the deletion gate and the native-backup guide. Backups ship in Phase 0.
  - Why: the user cleaned Yello, but Apple and Google still hold the uncleaned duplicates.
- **2026-10-25 (Phase 0 shipped):**
  - Added `contact_merged_identities`. The user's past merges dropped the secondaries' UIDs, and the cutover needs to recognise the old duplicates still in iCloud/Google. Merges from now on record them. Earlier merges are recognised only by matching.
  - Moved the delete-all 409 and the report of already-imported group cards to Phase 1, which they depend on.

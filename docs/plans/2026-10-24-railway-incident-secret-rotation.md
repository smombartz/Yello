# Railway security incident: rotate every secret

## Context

Railway disclosed a platform incident (Oct 21–23, 2026). The attacker could read customer
**environment variables**, registry credentials and integration tokens. Railway says to revoke and
reissue every variable, check external registry credentials, and review logs for unusual activity.

Yello's production secrets in Railway (from what the code reads):

| Variable | Used for | Rotate where |
|---|---|---|
| `SESSION_SECRET` | Cookie signing (`server.ts:106`) **and** the AES key for stored user tokens (`services/tokenEncryption.ts`) | Generate a new one locally |
| `GOOGLE_CLIENT_SECRET` (`_ID` isn't secret) | OAuth login, Gmail/Contacts token refresh | Google Cloud Console |
| `HERE_API_KEY` | Geocoding (billed) | HERE platform |
| possibly `APIFY_API_TOKEN` or others | not read by the code, but may be set | Check in the dashboard |

**The catch:** `SESSION_SECRET` also encrypts the Google access and refresh tokens (Gmail and
Contacts scopes) in `auth.db` `users`, plus each tenant's `user_settings.apify_api_token` and
`icloud_app_password`. Swapping it on its own would make all of these unreadable, because
`decryptToken` returns `null`. You chose **re-encryption**: split the key out and migrate in place,
so nobody has to reconnect anything.

No registry credentials apply: the Dockerfile only pulls the public `node:20-alpine` image.

---

## Part A: code change (Claude) — ✅ done 2026-10-24

1. **`backend/src/services/tokenEncryption.ts`**
   - Derive the key from `TOKEN_ENCRYPTION_KEY`, falling back to `SESSION_SECRET`. Deploying this
     before any variable changes is then a no-op.
   - Factor out `deriveKey(secret)`. Add `getPreviousKey()`, read from `TOKEN_ENCRYPTION_KEY_PREVIOUS`
     (or `null`).
   - Add `reencryptToken(value): { status: 'current' | 'rotated' | 'failed', value }`. It tries the
     current key first, so it's idempotent, then the previous key, then encrypts with the current key.
     Legacy plaintext Google tokens (`!isEncryptedToken`) get encrypted.
   - Extend `_resetKeyCache` to clear both cached keys.
2. **New `backend/src/services/tokenKeyRotation.ts`** with `rotateEncryptedTokens(log)`:
   - Returns early unless `TOKEN_ENCRYPTION_KEY_PREVIOUS` is set.
   - `getAuthDatabase()`: re-encrypt `users.access_token` and `users.refresh_token` in one transaction.
   - `listUserIds()` → `getUserDatabase(id)`: re-encrypt `user_settings.apify_api_token` and
     `icloud_app_password`, one transaction per tenant.
   - Logs totals: `rotated N, already current M, failed F`. Failures are left untouched, never
     nulled, so a wrong `PREVIOUS` value can't destroy data.
3. **`backend/src/server.ts`**: call `rotateEncryptedTokens(app.log)` synchronously **before**
   `app.listen`, so no request runs against a half-migrated store. This follows the
   `resumeInterruptedImports` boot-hook pattern.
4. **Tests** (Vitest, same temp-dir env setup as `tokenEncryption.test.ts` and
   `importRecovery.test.ts`):
   - Rotation across auth and tenant DBs.
   - Running it twice changes nothing.
   - A wrong previous key fails without data loss.
   - Without `PREVIOUS` set, it's a no-op.
   - The fallback to `SESSION_SECRET` keeps existing ciphertext readable.
5. **Docs:**
   - `.env.example`: add `TOKEN_ENCRYPTION_KEY`.
   - `docs/reference.md`: a "Secrets & key rotation" runbook (this Part B).
   - `docs/log.md`: an entry.
   - Copy this plan to `docs/plans/2026-10-24-railway-incident-secret-rotation.md`.
   - No schema change, so `docs/database.md` stays as is.

## Part B: rotation runbook (you, in dashboards, in this order)

1. **Inventory:** open Railway → project → service → Variables, every environment, and also shared
   variables. Write down every key. Under Account Settings → Tokens, **revoke all Railway API and
   project tokens** and recreate only the ones you use.
2. **Deploy Part A** with no variable changes. Behavior stays identical because of the fallback.
3. **Generate two values locally:** `openssl rand -hex 32` (run it twice).
4. **One staged Railway change, then a single deploy:**
   - `TOKEN_ENCRYPTION_KEY_PREVIOUS` = the *current* `SESSION_SECRET` value
   - `TOKEN_ENCRYPTION_KEY` = new value #1
   - `SESSION_SECRET` = new value #2

   Check the deploy log for `rotated N … failed 0`. Every web and desktop session is logged out
   because the cookie signatures change. That's expected, so sign in again.
5. **Delete `TOKEN_ENCRYPTION_KEY_PREVIOUS`** and redeploy, so the leaked value is gone.
6. **Google:** Cloud Console → APIs & Services → Credentials → the OAuth client → **Add secret**.
   Put it in `GOOGLE_CLIENT_SECRET`, deploy, and test login plus a Gmail/Contacts sync. Then
   **disable and delete the old secret**. Existing refresh tokens survive this, since they're tied
   to the client, not the secret.
7. **HERE:** create a new API key, update `HERE_API_KEY`, deploy, test a geocode, then delete the
   old key.
8. **Anything else found in step 1** (e.g. `APIFY_API_TOKEN`): create new → update → delete old.
   If your local `.env` shares any production values, update it too.
9. **Review activity for Oct 21 to now:**
   - **Railway:** project Activity for unexpected deploys or variable edits, and team members.
   - **GitHub:** Settings → Security log and Applications → the Railway app's access; the repo's
     deploy keys, webhooks and recent pushes.
   - **Google Cloud:** OAuth client and API metrics for unusual spikes.
   - **HERE and Apify:** usage dashboards for spikes and unknown runs.
   - **Yello's `/admin`:** check the user list for sign-ups or logins you don't recognise.

## Verification

- `cd backend && npx vitest run --testTimeout=20000` passes, including the new rotation tests.
- `cd frontend && npm run build` (sanity check; frontend unchanged).
- Local dry run against a copy of `data/`:
  1. Start with old `SESSION_SECRET` only, and confirm the Apify/iCloud status endpoints report
     "configured".
  2. Restart with the three-variable setup. The log should show `rotated N, failed 0`.
  3. The endpoints should still decrypt.
  4. Restart again: the log should show `already current N`.
- In production (you): the step 4 log line, signing in again, and one Gmail/Contacts sync working.

## Changes

- 2026-10-24: Part A implemented. `reencryptToken` also encrypts legacy plaintext values, so the
  first rotation upgrades any pre-encryption Google tokens. Backend suite: 28 files, 260 tests pass;
  `tsc` clean. Part B (dashboard rotation) is still with the user.
- 2026-10-24: Part B steps 2–5 done via the Railway MCP. The MCP returns variable names only, so
  the old secret was never read: step 1 set `TOKEN_ENCRYPTION_KEY_PREVIOUS = ${{SESSION_SECRET}}`
  (same-service reference) with a new `TOKEN_ENCRYPTION_KEY`, logging `rotated 2, already current 0,
  failed 0`; step 2 set a new `SESSION_SECRET` and blanked `TOKEN_ENCRYPTION_KEY_PREVIOUS`.
  Log review (Oct 20–24, 324 requests) found no suspicious authenticated activity; one AWS
  scanner on Oct 24 got 401s on every API probe. HERE/Apify keys are not in Railway.

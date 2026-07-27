# Fix: "Make public profile" toggle — Anonymous preview & non-persisting setting

## Context

The user-profile page (`frontend/src/components/UserProfilePage.tsx`) has a "Make my contact card public" toggle. Two bugs:

1. **Preview shows "Anonymous"** — every per-field visibility flag defaults to `false` (frontend `getDefaultVisibility()` at `UserProfilePage.tsx:38-56`, backend mirror at `backend/src/routes/profile.ts:143-161`, written into new rows as `visibility_json`). The preview's display name (`UserProfilePage.tsx:328-333`) gates on `visibility.firstName/lastName` and falls back to `'Anonymous'`. The real public page (`PublicContactCard.tsx:350`) does the same because the public endpoint nulls hidden fields.
2. **Setting doesn't persist** — the toggle's `onChange` (`UserProfilePage.tsx:1031`) calls `updateForm('isPublic', ...)`, which only sets local form state. The only persistence path is `handleSave` (line 729), reachable solely from the edit-mode Save buttons. The public-settings section (toggle + "Hide All Fields" button) has no save wiring. On reload, the profile→form sync effect (lines 661-687) resets the switch from server data. The backend PUT `/api/profile` handles `isPublic` correctly and accepts partial payloads (`Type.Partial`, `backend/src/schemas/profile.ts:118`), so this is purely a frontend gap.

**Fix approach:** autosave the public-settings controls immediately, and — per user decision — seed **first name, last name, and avatar** as visible when the toggle is first switched on for a never-configured (all-hidden) profile. Everything else stays hidden until opted in via the edit-mode eye toggles.

Note: there is no slug input — the slug is server-generated and display-only, so no debounced text autosave is needed. The per-field eye toggles only render in edit mode where the existing Save button already persists them; they stay as-is.

## Changes

### 1. `frontend/src/api/profileHooks.ts` — deterministic cache update
In `useUpdateUserProfile` (lines 12-25), replace `onSuccess: invalidateQueries` with `onSuccess: (data) => queryClient.setQueryData(['userProfile'], data)`. The PUT returns the full updated profile, so writing the response into the cache avoids a refetch racing a second toggle. Leave the link/unlink/create hooks unchanged.

### 2. `frontend/src/components/UserProfilePage.tsx` — guard the form-sync effect
The effect at lines 661-687 unconditionally overwrites `form` and resets `hasChanges` whenever `profile` changes. Guard it so it only syncs when the form is not dirty: keep a `hasChangesRef` (updated each render) and wrap the body in `if (profile && !hasChangesRef.current)`. This prevents an autosave's cache update from clobbering unsaved edit-mode changes, while still syncing after edit-mode Save (which sets `hasChanges=false` first) and after view-mode autosaves (which never set `hasChanges`).

### 3. `UserProfilePage.tsx` — autosave helper
Add `savePublicSettings(partial: Pick<UpdateUserProfileRequest, 'isPublic' | 'visibility'>)` (useCallback, near `updateVisibility` ~line 697):
1. Snapshot current `{ isPublic, visibility }` from form.
2. `setError(null)`; optimistically `setForm(f => ({ ...f, ...partial }))` — deliberately **not** via `updateForm`, so `hasChanges` stays false (no edit-mode save bar, no sync-guard trip).
3. `await updateProfileMutation.mutateAsync(partial)` (partial body; backend updates only defined fields).
4. On error: revert the form to the snapshot and `setError(message)` — the existing error banner at lines 1002-1007 displays it.

Disable the toggle checkbox and "Hide All Fields" button with `disabled={updateProfileMutation.isPending}` to prevent overlapping autosaves.

### 4. `UserProfilePage.tsx` — wire controls + seed name/avatar on first enable
Add helpers near `getDefaultVisibility()`:
- `isVisibilityUnconfigured(v)` — true iff all 11 boolean flags are false and no `true` exists in the `emails`/`phones`/`addresses`/`otherSocialLinks` records.
- `seedBasicVisibility(v)` — returns `{ ...v, avatar: true, firstName: true, lastName: true }` (user's choice: name + avatar only).

Replace the toggle `onChange` (line 1031) with `handlePublicToggle(checked)`:
- If `checked && isVisibilityUnconfigured(form.visibility)`: `savePublicSettings({ isPublic: true, visibility: seedBasicVisibility(form.visibility) })` — instantly fixes the preview and repairs existing rows with all-false `visibility_json`.
- Else: `savePublicSettings({ isPublic: checked })`.
- Seed only on the OFF→ON transition; never auto-expose fields of an already-public profile.

Rewrite `hideAllVisibility` (lines 707-726) to end with `savePublicSettings({ visibility: newVisibility })` instead of `updateForm(...)` so it also persists immediately.

### 5. Default visibility for future profiles (both sides)
- Frontend `getDefaultVisibility()` (lines 38-56): set `avatar`, `firstName`, `lastName` to `true`; update the comment.
- Backend `getDefaultVisibility()` (`backend/src/routes/profile.ts:143-161`): same change. Safe: `is_public` defaults to 0 and the public endpoint requires `is_public = 1`, so nothing leaks pre-opt-in.
- **Important:** the public endpoint uses `getDefaultVisibility()` at `profile.ts:931` to blank the visibility object in the public response — extract the current all-false literal into a separate `emptyVisibility()` and use that there, so the public payload doesn't drift with the new defaults.

### 6. Docs (required by CLAUDE.md)
- Copy this plan to `docs/plans/2026-07-24-public-profile-toggle-autosave.md`.
- Append a log entry (top of `docs/log.md`, project format) covering both fixes and files modified.
- `docs/readme.md`: short note that public settings autosave and that name/avatar default to visible when going public.

## Edge cases
- Rapid double-toggle: controls disabled while mutation is pending.
- Autosave failure: form reverts (toggle flips back), error banner shows.
- Already-public profile with all-false visibility: not auto-seeded (no surprise exposure); seeded next time the toggle cycles off→on.
- `PublicContactCard.tsx` needs no change — once name flags are true the public endpoint returns the name.

## Verification
1. `cd frontend && npx tsc --noEmit && npm run build`; `cd backend && npx tsc --noEmit` (or the project's build script). Lint changed files.
2. Against a running dev backend with an authenticated session:
   - `PUT /api/profile` with `{"isPublic":true,"visibility":{...name/avatar true...}}` → 200 with `isPublic:true`; follow-up partial `{"isPublic":false}` leaves visibility untouched.
   - `GET /api/profile/public/<slug>` → 200 with firstName/lastName populated while public; 404 after toggling off.
3. UI verification (toggle → preview shows name immediately, persists across reload, Hide All persists, error banner + revert with backend stopped) is handed to the user per CLAUDE.md.

## Files modified
- `frontend/src/components/UserProfilePage.tsx`
- `frontend/src/api/profileHooks.ts`
- `backend/src/routes/profile.ts`
- `docs/log.md`, `docs/readme.md`, `docs/plans/2026-07-24-public-profile-toggle-autosave.md`

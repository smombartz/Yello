# UI Audit & Unification Plan — Yello CRM

**Status:** Implemented (2026-07-07)

**Outcome:** Built the missing shared UI layer (`components/ui/`: Button, ConfirmDialog, Toast, LoadingSpinner, EmptyState) and funneled the app through it — replacing 14 hand-rolled dialogs, 11 toasts, ~20 loaders, and ~16 empty states, and fixing the Escape-under-modal bug. Converged 5 competing brand purples onto one token (#7C3AED), adopted Geist, extracted all 7 CSS-in-JS `<style>` blocks to stylesheets (fixing 10 global class collisions that surfaced), and deduped the import cards / pagination / back button. Build + lint green throughout.

**Deferred (noted for future work):** exhaustive grey/spacing/font-size token conversion and static inline-style retirement; unifying the 3 search bars / 3 tab implementations / badge classes (largely distinct UI); routing PublicContactCard's inline SVGs through `Icon`; mobile nav parity (Dashboard/Profile) and Settings-VCF consolidation (owner IA decisions); visual sign-off of the refresh.

---


## Context

The app grew view-by-view and the UI drifted: a well-designed token system (`--ds-*`, 141 tokens in `frontend/src/styles/design-system.css`) exists, but there is **no shared component layer** consuming it — every view re-implements dialogs, toasts, spinners, empty states, and buttons with its own class names in a 7,624-line `index.css`, plus 8 components embedding CSS via `<style>` template blocks. Goal: consolidate onto shared primitives, normalize all styling through the tokens, and land a visual refresh via the token layer.

**Design context (owner decisions, 2026-07-07):**
- Audience: personal tool now, product later. Personality: **clean & utilitarian** (Linear/Things — fast, dense, information-first). Quality bar: solid & consistent (skip exhaustive micro-polish).
- **Font:** distinctive utilitarian sans — **Geist** (Google Fonts, 400/500/600/700; IBM Plex Sans as fallback choice if Geist disappoints), via new `--ds-font-family` token.
- **Brand color:** **#7C3AED** becomes canonical (`--ds-color-primary`); all 5 competing purples converge. Derived: hover `#6D28D9`, dark `#5B21B6`, light `rgba(124,58,237,0.1)`.
- **Dark mode:** deferred; token normalization in this plan is the prep (future = `[data-theme]` override block).

## Audit summary (three exploration passes, verified by spot-checks)

**Docs are wrong:** CLAUDE.md claims Pico CSS + `--stitch-*` tokens. Neither exists — Pico isn't installed (only 9 dead `var(--pico-*)` refs in `OnboardingView.css`); the real system is `--ds-*`.

**Duplication (the core problem — component layer missing):**
- **ConfirmDialog:** 14 hand-rolled copies across 8 files (`ContactList.tsx:452,475`; `DeduplicationView.tsx:427,453,483,506`; `CleanupView.tsx:324,346`; `ArchivedView.tsx:314,336`; `AddressNormalize.tsx:432`; `AddressDuplicates.tsx:210`; `SettingsView.tsx:441`; `SocialLinksWithinContact.tsx:164`).
- **Toast:** `undo-toast` markup + setTimeout logic copy-pasted in 11 files; two incompatible shapes (bare message vs success/error); MapView uses an inline banner instead; Dedup's "undo" toast has no undo (`DeduplicationView.tsx:79`).
- **Loading:** shared `LoadingSpinner.tsx` exists but has 1 importer; ~20 one-off `*-loading` classes, 4 idioms; spin `@keyframes` redefined locally in 4 files.
- **Empty states:** ~16 variants (best: MapView's `.map-empty` icon+h3+p+CTA). **Buttons:** ~30 classes unified only by a giant height selector (`index.css:114-160`). **Badges:** ~15 classes. **Search:** 3 implementations. **Tabs:** 3 implementations.
- `MatchCard`/`NewContactCard` duplicated **verbatim** between `ICloudImportView.tsx` and `GoogleContactsImportView.tsx` (Google reuses `.icloud-*` classes). `ImportModal.tsx` (138 lines) is dead — zero importers. `ArchivedView.tsx:270-292` hand-rolls pagination despite shared `Pagination.tsx` (used correctly by 6 files).

**Token bypass:** 82 distinct hard-coded hexes (many verbatim token values); radius tokens used ~8× vs dozens raw (3 different pill radii); ~30 raw font-sizes (`8.2px`!); spacing tokens used 3× vs 441 raw px; font-weight tokens 2× vs 100+ raw. 82 inline `style={{}}` in 17 files.

**Bugs found:** Escape key navigates to /contacts **while modals are open** — `Layout.tsx:52-61` guards on `modalOpen` but the `useLayoutModal` wiring is called by no view. `AdminView.tsx:148` references nonexistent `--ds-color-danger` (should be `--ds-color-error`). `index.html` downloads Inter that no CSS references (dead bytes). `App.tsx` duplicates its auth-loading spinner+styles twice (lines 35-60, 89-114).

## Implementation plan (each phase leaves the app working, independently commit-able)

New primitives live in `frontend/src/components/ui/`. All plain CSS on `--ds-*` tokens, no new dependencies.

### Phase 0 — Docs scaffolding (S)
Save this plan; create `.impeccable.md` at repo root (design context above); fix CLAUDE.md (remove Pico claim, `--stitch-*` → `--ds-*`); log in `docs/log.md`.

### Phase 1 — Dead code & broken refs (S)
Delete `ImportModal.tsx`; fix `AdminView.tsx:148` token; replace 9 dead `--pico-*` refs in `OnboardingView.css` with `--ds-*`; remove dead Inter links from `index.html`; add `--ds-font-family: system-ui, ...` token and point `body` at it (Phase 9 plug-in point). Guardrail: `grep -rn "pico\|ImportModal" src/` → 0.

### Phase 2 — ConfirmDialog + Escape bug fix (M, highest leverage)
Create `ui/ConfirmDialog.tsx`:
```tsx
{ title, message?, confirmLabel?, cancelLabel?, danger?, confirmDisabled?,
  onConfirm, onCancel, children? }  // mount = open, matching {showX && ...} idiom
```
Built-in: calls `useLayoutModal().setModalOpen(true/false)` on mount/unmount (fixes the Escape bug for all 14 call sites at once); own Escape→onCancel with stopPropagation; overlay-click cancels. Migrate all 14 sites (SettingsView's type-DELETE variant last, via `children` + `confirmDisabled`). Verify per view: Escape closes dialog *without* navigating.

### Phase 3 — ToastProvider + useToast (M)
Create `ui/Toast.tsx` + provider mounted in `App.tsx`: `showToast(message, { type?: 'success'|'error'|'info', duration?, action?: {label, onClick} })`. Single toast, last-wins (current behavior). Migrate 11 files; undo-capable toasts pass `action`; fix Dedup's fake-undo copy to plain confirmation; migrate MapView's `.geocode-result` banner. Guardrail: `grep -rln "undo-toast"` → Toast.tsx only.

### Phase 4 — LoadingSpinner adoption + EmptyState (M)
Move `LoadingSpinner.tsx` → `ui/`; sweep ~20 loading one-offs onto it. Create `ui/EmptyState.tsx` (`{ icon?, title, description?, action?, className? }`, modeled on `.map-empty`); sweep ~16 empty variants. Extract App.tsx's duplicated auth-loading into one `AuthLoadingScreen` (deletes 2 style blocks).

### Phase 5 — Button unification (L)
Create `ui/Button.tsx` (`variant: 'primary'|'secondary'|'danger'|'ghost'|'icon'`, `icon?`, extends button attrs) emitting `.btn .btn--{variant}` built on `--ds-btn-*` tokens. Two committable steps: (1) canonical CSS matching current look; (2) file-by-file migration of ~30 classes (`confirm-button`→primary, `cancel-button`/`secondary-button`→secondary, `danger-button`→danger, one-offs→variant + minimal modifier). Unify the 3 add/edit-contact button treatments. Prune the giant `index.css:114-160` selector as classes retire. Biggest visual-regression surface — migrate one view per commit, screenshot.

### Phase 6 — Structural dedupe & UX fixes (M)
Extract shared `ImportMatchCards.tsx` from the two import views; rename `.icloud-*` → `.import-*`. ArchivedView adopts shared `Pagination`. Remove ContactDetailPage's duplicate in-body back button (`:60-63`). Minimal nav fix: make Profile reachable on mobile; Settings' VCF section becomes a link to ImportView.

### Phase 7 — CSS-in-JS → stylesheets (M)
Extract all 7 remaining `<style>` blocks (UserProfilePage, EnrichView, PublicContactCard, DashboardView, AdminView, LoginPage, DemoPromptModal) into `src/styles/pages.css` with per-page sections; prefix generic class names during extraction to avoid global collisions; one global `spin` keyframes. Introduce gradient tokens: `--ds-gradient-brand-from/-to` (initially current values so nothing shifts; Phase 9 flips them). Guardrail: `grep -rn "<style>" src/` → 0. Screenshot each page before/after.

### Phase 8 — Token normalization sweep (L, 4 committable sub-passes)
Over `index.css` + `pages.css`: (1) **colors** — verbatim matches → tokens (`#e5e7eb`→`--ds-border-color` etc.), near-misses snap to nearest token, genuinely new colors get named tokens; (2) **radius** — raw values → `--ds-radius-*`, all pill radii → `--ds-radius-full`; (3) **typography** — add `--ds-font-2xs: 0.8125rem` + keep `0.9375rem` as a token (real densities, used 30×/23×), kill `8.2px`, weights → tokens; (4) **spacing** — clean 4px multiples → `--ds-space-*`, leave bespoke offsets. Also retire static inline `style={{}}` (SettingsView ×20 etc.) into classes; keep dynamic ones (virtualizer transforms). Review diffs view-by-view.

### Phase 9 — Visual refresh lands in the token layer (S–M)
All values decided (see Design context): `--ds-color-primary` family → #7C3AED/#6D28D9/#5B21B6; gradient tokens → the #7C3AED→#273DE3 pair (and reduce decorative gradient usage where it fights the clean/utilitarian direction); `--ds-font-family` → Geist + font link in `index.html`; density/finish tightening (`--ds-control-height`, radius, shadows) as token edits. Iterate with screenshots across Dashboard/Contacts/Detail/Login/PublicCard; owner sign-off.

### Phase 10 — Consistency pass + doc closeout (M)
Unify 3 search bars (PageHeader canonical) and 3 tab implementations; canonical `.badge` class for worst offenders; optionally route PublicContactCard's 9 inline SVGs through `Icon.tsx` (verify FA kit loads on the public route first). Update CLAUDE.md styling section + primitives inventory; final `docs/log.md`; move plan to `docs/plans/completed/`.

## Verification (every phase)
`npm run build` + `npm run lint` in `frontend/` (no frontend test suite exists); dev servers (backend 3456 / frontend 5173) + manual pass of affected views; screenshots for visual phases; per-phase grep guardrails proving the old pattern is gone; `docs/log.md` entry per phase.

## Explicit future work (not this pass)
Consolidating the 7 contact-rendering components (ContactRow, ContactGridCard, ContactCardView, DuplicateContactCard, CleanupContactCard, MatchCard, NewContactCard); splitting UserProfilePage (2,187 lines)/EnrichView (1,559); real undo for dedup merges; dark mode (`[data-theme]` token overrides — cheap after Phase 8); full nav-parity rethink.

## Critical files
- `frontend/src/styles/design-system.css` — token layer, the control surface
- `frontend/src/index.css` (7,624 lines) — monolith being normalized
- `frontend/src/components/Layout.tsx` + `hooks/useLayoutModal.ts` — Escape/modal contract
- `frontend/src/App.tsx` — ToastProvider mount, duplicated auth-loading
- `CLAUDE.md`, `docs/log.md`, `.impeccable.md` (new) — docs workflow

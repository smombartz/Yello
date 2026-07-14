# Onboarding Redesign — Match App Design System

## Context

The first-run onboarding (`frontend/src/components/OnboardingView.tsx`) is functionally complete but visually bare-bones: native `<details>`/`<summary>` accordions, raw `<button className="outline">`, hidden file inputs triggered via refs, a raw `<progress>` element, and a co-located `OnboardingView.css` with ad-hoc classes that ignore the design system. The rest of the app has a mature token system (`--ds-*` in `frontend/src/styles/design-system.css`), shared component classes in `index.css` (`.btn--*`, `.badge--*`, `.progress-bar-*`), ui/ primitives (`Button`, `FilePicker`, `Badge`, `Toast`, `Icon`), and a polished visual model in `WelcomeView` + `styles/pages/launch.css` (gradient hero + icon-chip cards, BEM-ish naming). Goal: rebuild the onboarding UI to match those patterns **with zero functional changes** — same hooks, same 3 steps, same auto-advance and completion flow.

## Approach

Replace the `<details>` accordion with **state-driven step cards** (the existing `openSection` state already models "which step is open"; the refs/`onToggle`/attribute machinery exists only to fight native `<details>` and gets deleted). Style everything after the Welcome page.

### Layout (model: `WelcomeView.tsx` + `launch.css`)

- `.onboarding-view` > `.onboarding-content` (max-width 720px, centered, flex-col, gap `--ds-space-8`) — same skeleton as `.welcome-view`/`.welcome-content`.
- **Hero** `.onboarding-hero`: same treatment as `.welcome-hero` (`--ds-gradient-brand` bg, `--ds-radius-2xl`, `--ds-shadow-md`, inverse text, centered):
  - badge pill "Welcome" (translucent white, like `.welcome-hero__badge`)
  - title `Welcome to Yello{, FirstName}` (`--ds-font-3xl` bold), existing subtitle copy
  - `.onboarding-hero__progress` — "Step X of 3" / 3 dots as a lightweight wizard affordance
- **Skip**: `.onboarding-skip` — real `<button>` (not `<a onClick>`), quiet text style (`--ds-text-secondary`, hover primary), "Skip to Dashboard →"
- **Step cards** `.onboarding-steps` > `.onboarding-step` (white bg, 1px `--ds-border-color`, `--ds-radius-xl` — the `.welcome-card` recipe), with modifiers:
  - `--active`: primary border + `--ds-shadow-sm`, body expanded
  - `--done`: icon chip becomes success `circle-check`, body collapses to a one-line result summary (`.onboarding-step__result`) so import results stay visible
  - Header row = full-width `<button aria-expanded>` (`.onboarding-step__header`): 44px icon chip (`--ds-color-primary-light` bg, `<Icon name="user" / "address-book" / "linkedin">`), title + one-line description, right slot with `<Badge variant="success">Done</Badge>` or chevron. Click toggles `openSection` (preserves one-open-at-a-time).
- **Instructions** (replaces ugly nested `<details>`): always-visible compact help block `.onboarding-help` inside the expanded body — small `circle-info` heading "How to export your contacts" + compact provider rows / `<ol>` for LinkedIn. Same copy and links as today.
- **All-complete**: `.onboarding-success` inline card (success-light bg, `circle-check` icon, "You're all set! Redirecting…"). Keep 1.5s auto-redirect.
- **Footer**: `<Button variant="primary">Go to Dashboard</Button>`, centered, min-width 200px, disabled while `completeOnboarding.isPending`.

### Component changes — `OnboardingView.tsx`

**Delete:** `import './OnboardingView.css'`; `profileRef`/`vcfRef`/`linkedinRef`; `handleToggle`; DOM-attribute half of `advanceToNext` (becomes just `setOpenSection(next)`); all `<details>/<summary>`; raw `<progress>`; `button.outline` + hidden-input/ref trios for VCF & LinkedIn.

**Add imports:** `Button` from `./ui/Button`, `Badge` from `./ui/Badge`, `FilePicker` from `./ui/FilePicker`, `useToast` from `./ui/Toast`, `Icon` from `./Icon` (note: NOT `./ui/Icon`).

**Replacements:**

| Current | New |
|---|---|
| `<details>` step | `.onboarding-step` card + header `<button>` toggling `openSection` |
| `'✅' / '1.'` in summary | Icon chip + `Badge variant="success"` "Done" |
| Profile "Upload Photo" `button.outline` | Keep hidden input + ref (single-image direct-open is fine), trigger styled as `<Button variant="secondary" icon="camera">`; pending: "Uploading…" + `arrows-rotate` icon with `spinning` class (pattern from `LinkedInImportContent.tsx:63`) |
| VCF hidden input + "Choose VCF File" | `<FilePicker id="onboarding-vcf-input" accept=".vcf,.vcard">` + `<Button variant="secondary" icon="upload">Import Contacts</Button>` — two-step select→import, matching SettingsView's canonical VCF pattern. Add `vcfFile` state; split `handleVcfSelect` into onChange (store file) + `handleVcfImport` (mutate) |
| LinkedIn hidden input + "Choose CSV File" | Same: `<FilePicker id="onboarding-linkedin-input" accept=".csv">` + import Button; mirror `LinkedInImportContent.tsx:21-39` incl. the `contacts.length === 0` → `showToast('No valid contacts found in CSV file', { type: 'error' })` (current code silently returns) |
| Raw `<progress>` | `.progress-bar-container` > `.progress-bar-fill` (width %) + `.progress-text` (exact markup at `LinkedInImportContent.tsx:72-81`) |
| `p.error-text` inline errors | `showToast(msg, { type: 'error' })` in catch blocks / on isError |
| `.import-result` divs | `.onboarding-step__result` row in the collapsed done state |
| `a.skip-link` | `.onboarding-skip` `<button>` |
| Footer raw `<button>` | `<Button variant="primary">` |

**Unchanged:** all hooks (`useUploadProfileImage`, `useImportVcf`, `useImportLinkedInStream` + `parseLinkedInCsv`, `useCompleteOnboarding`), `completed`/`markComplete`, auto-advance order profile→vcf→linkedin, `allComplete` → 1.5s → `handleFinish`, `setHeaderConfig({ title: 'Get Started' })`, Avatar preview (120px, primary image || avatarUrl), instruction copy/links.

**Do NOT reuse `LinkedInImportContent`** for step 3 — it hard-codes settings copy and lacks an on-complete callback; mirror its patterns instead.

### CSS

**New:** `frontend/src/styles/pages/onboarding.css` — all values via `--ds-*` tokens, BEM-ish naming like `launch.css`:
`.onboarding-view`, `.onboarding-content`, `.onboarding-hero` (+`__badge/__title/__subtitle/__progress`, cribbed from `.welcome-hero*` at `launch.css:122-156`), `.onboarding-skip`, `.onboarding-steps`, `.onboarding-step` (+`--active`/`--done`, `__header` with button reset, `__icon` 44px chip, `__titles/__title/__desc/__meta/__body/__result`), `.onboarding-profile` (+`__info`), `.onboarding-help` (+`__title/__item`), `.onboarding-success`, `.onboarding-footer`, `@media (max-width: 640px)` (hero title → `--ds-font-2xl`, header wrap).

Rely on existing globals (don't redefine): `.import-controls`, `.file-input-*`, `.progress-bar-*`, `.progress-text`, `.btn--*`, `.badge--*`, `.spinning`.

**Register:** add `@import './pages/onboarding.css';` to `frontend/src/styles/pages.css`.
**Delete:** `frontend/src/components/OnboardingView.css`.

## Implementation steps

1. Create `frontend/src/styles/pages/onboarding.css` (crib hero/card values from `launch.css`)
2. Add `@import` line to `frontend/src/styles/pages.css`
3. Rewrite `frontend/src/components/OnboardingView.tsx` per the table above
4. Delete `frontend/src/components/OnboardingView.css`
5. Verify: `cd frontend && npm run build` (tsc + vite) and `npm run lint`. Visual verification is the user's job per CLAUDE.md — hand off after logic checks pass.
6. Per CLAUDE.md: save plan copy to `docs/plans/2026-07-13-onboarding-redesign.md`; append entry to `docs/log.md` (top, standard format)

## Files modified

- `frontend/src/components/OnboardingView.tsx` (rewrite markup, keep logic)
- `frontend/src/styles/pages/onboarding.css` (new)
- `frontend/src/styles/pages.css` (one line)
- `frontend/src/components/OnboardingView.css` (delete)
- `docs/plans/2026-07-13-onboarding-redesign.md`, `docs/log.md`

## Notes / risks

- `Icon` import path is `./Icon` (`components/Icon.tsx`), not `./ui/Icon`
- Use unique FilePicker ids (`onboarding-vcf-input`, `onboarding-linkedin-input`) to avoid collision with SettingsView's ids
- Preserve visibility of import results after completion (render `__result` in the collapsed done state)
- No backend, routing, or flow-logic changes

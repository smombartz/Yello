# Design-system extraction (2026-10-05)

`/impeccable extract` over the whole frontend. The system already exists, with tokens in `styles/design-system.css` and primitives in `components/ui/`, but adoption is thin. 176 raw `<button>`s use about 40 bespoke classes, and only 6 use `<Button>`. This plan extends the existing primitives, migrates every use that has the same intent, and deletes the old implementations.

## Findings

| Pattern | Evidence | Action |
| --- | --- | --- |
| Filled-violet action button | ~25 uses across 15 classes (`header-action-btn`, `fix-all-button`, `merge-button`, `restore-button`, …) | `<Button variant="primary">` |
| Bordered neutral button | ~20 uses across 14 classes (`secondary-button` ×17, `cancel-button`, `unlink-btn`, `logout-button`, …). Half have Graphite labels instead of Ink | `<Button variant="secondary">` |
| Filled-red destructive button | 8 uses across 6 classes (`delete-selected-button` ×4, `normalize-remove-button`, …) | `<Button variant="danger">` |
| Compact (13px) bordered button | ~20 uses (`icloud-bulk-btn` ×8, `cleanup-action-button` ×5, `geocoding-action-btn` ×3, `icloud-action-btn` ×3, …) | New `size="sm"` |
| Busy icon inside a button | ~12× `<Icon name={busy ? 'arrows-rotate' : x} className={busy ? 'spinning' : ''} />` | New `loading` prop |
| Underline tab bar | `ModeSelector` (`.mode-pill`, no ARIA) and `CleanupModeSelector` (`.cleanup-mode-tab`, `role="tab"`) are byte-identical CSS | New `ui/Tabs` |
| Modal shell | `ConfirmDialog` has Escape, `useLayoutModal` and `aria-modal`. The merge modal, geocoding progress modal and demo prompt hand-roll overlays without them | New `ui/Modal`, which `ConfirmDialog` builds on |
| Spinner markup | 4 bare `<div className="loading-spinner" />` and 4 `.icloud-spinner` | `<LoadingSpinner>` |
| Dead CSS | Empty/loading rules for 10 views already on `<EmptyState>`/`<LoadingSpinner>`, `.social-links-tab`, legacy button classes after migration | Delete |
| `color: white` literals | 44 | `var(--ds-text-inverse)` |

## Primitive changes

- **`Button`**: add `size?: 'md' | 'sm'` (sm = 13px label, 12px padding, still 32px tall). Add `loading?: boolean`, which shows a spinning `arrows-rotate` in place of `icon` and sets `disabled` and `aria-busy`. Existing variants are unchanged.
- **`Tabs`** (new): `items: { id, label, icon?, count? }[]`, `value`, `onChange`, `disabled?`, `aria-label`. It renders `role="tablist"`/`role="tab"` with roving tabindex and Arrow/Home/End keys. CSS moves to canonical `.tabs`/`.tab`/`.tab-count`.
- **`Modal`** (new): overlay, `role="dialog"` (or `alertdialog`), `aria-modal`, `aria-label`, Escape in the capture phase, `useLayoutModal`, overlay-click close, initial focus inside, and focus restored on close. `onClose` is optional for non-dismissable progress dialogs.

## Migration rules (for every file)

1. Replace a legacy-class `<button>` with `<Button variant=… size=…>`, mapped from its old CSS. `type="submit"` and all handlers, `disabled`, `title` and `aria-*` stay as they are.
2. A leading `<Icon name="x" />` becomes `icon="x"`. Brand or regular icons stay as children.
3. A busy-icon ternary becomes `icon="x" loading={busy}`. Keep any existing `disabled` logic.
4. If the legacy rule carries layout-only properties (margin, width, flex, align-self, order, position), keep that class in `className`. The CSS cleanup later strips the visual properties.
5. Not migrated, because their intent is distinct: `add-item-btn` (dashed add row), inline text buttons (`show-more-button`, `onboarding-skip`, `filter-clear-btn`, `email-history-load-more`), front-door buttons (`google-login-btn`, `demo-btn`, `add-to-contacts-btn`, `demo-prompt-*`), toggles and segments (`contact-action-button`), chips, nav and tab items, list rows, cards and icon glyph buttons.

## Cleanup

- Delete CSS for legacy classes with no remaining references, and remove them from the uniform-height and canonical selector lists.
- For legacy classes kept for layout, strip their visual properties.
- Delete dead empty/loading/tab rules.
- `npm run build` and the Impeccable detector.
- Update `DESIGN.md` (Button size and loading, Tabs, Modal), regenerate `.impeccable/design.json`, and update `docs/log.md`.

## Outcome (2026-10-05)

- `<Button>` went from 6 uses to 105 across 30 files. Raw `<button>`s went from 176 to 70, and the rest are the deliberate exceptions listed above.
- `Tabs` replaced `ModeSelector`'s and `CleanupModeSelector`'s markup. `Modal` now backs `ConfirmDialog`, the merge-conflict modal, the geocoding progress modal and the demo prompt.
- `index.css` went from 7,901 to 6,651 lines, and about 160 legacy selector parts were removed.
- Kept as layout-only hooks, with their visual properties stripped: `hide-all-btn` (margin), `geocoding-action-btn` (mobile label hiding) and `icloud-action-btn` (`flex: 1` plus an `.active` segment state).
- Not converted: Fetch Contact Photos and LinkedIn Import keep their own spinner icon, because the busy button doubles as Cancel and `loading` would disable it.

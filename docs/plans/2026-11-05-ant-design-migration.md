# Ant Design migration — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the whole Yello frontend on stock Ant Design 6. That covers the app, the public pages and the desktop app (which loads the same build). The work runs in phases: every phase ships a working app, and the screens that still need design work (Tools > Cleanup, Merge) are redesigned along the way, not just restyled.

**Architecture:** Three layers, applied in order, so the app never looks half-broken:
1. A **token bridge** points the existing `--ds-*` CSS variables at Ant's live theme. Screens not yet migrated take on Ant's colours, font and corners at once.
2. **Shared primitives** in `components/ui/` are rebuilt on Ant with the same props. About 140 files that use `<Button>`, `<Modal>`, `<Tabs>`, toasts and so on switch to Ant with no edits.
3. **Screen phases** rebuild each area's layout and forms with Ant components and delete that area's old CSS in the same change.

**Tech stack:** React 19, Vite 7, TanStack Query v5 and TanStack Virtual (unchanged), `antd@^6.7.0`, `@tabler/icons-react@^3.50.0` (stroke 1.5), React Router 7 and Leaflet (unchanged).

**Spec:** the decisions in this document, agreed in chat on 2026-11-05 (there is no separate spec file).

## Decisions (user, 2026-11-05)

| Question | Decision |
|---|---|
| UI framework | **Ant Design 6**. "I like the look and feel much better." |
| How close to stock | **Stock Ant**: no theme overrides. Ant blue (`#1677ff`) and the system font replace Signal Violet and Geist. |
| Icons | **Tabler (`@tabler/icons-react`) at stroke 1.5**, including the icons Ant draws inside its own components (dialog X, select arrow, status icons and so on). The Font Awesome kit script is removed. *Changed on 2026-11-05 from `@ant-design/icons`; see Changes.* |
| Public pages | **Ant everywhere**, including the landing page, public card (`/p/:slug`), legal pages and login. |
| Dark mode | **Optional last phase.** Every phase stays dark-ready (no literal colours). |
| Redesign | **In phases.** Cleanup and Merge get design work (impeccable `shape`) before they're rebuilt. |
| Design docs | **impeccable** rewrites DESIGN.md and its sidecar in Phase 2. |

## Global constraints

Every task implicitly includes these:

- **Stock theme:** `<ConfigProvider>` gets no `token` overrides. The only allowed theme settings are `algorithm` (dark mode, Phase 10) and non-visual flags. The icon settings from Task 0.4 (`antIconConfig`) aren't theme tokens and are allowed.
- **Icons:** Tabler only, at stroke 1.5 (`ICON_STROKE`), always through `<Icon>`. App code never imports `@ant-design/icons`, and lint enforces that. Every Ant component that draws an icon gets a Tabler one, globally (`antIconConfig`) or through its `components/ui/` wrapper. Each phase hand-off includes the icon check from Task 0.4, Step 6.
- **No literal colours or sizes in new code.** Read values from `theme.useToken()` in TSX, or from the bridged `--ds-*` variables in CSS. This keeps dark mode cheap.
- **Scale:** lists that can hold 10K+ contacts stay on TanStack Virtual. Their rows are plain elements styled with tokens, not one Ant component tree per row, unless profiling with the 8K-contact book shows a steady 60 fps scroll. Search stays under 100 ms.
- **Mobile (≤768px)** keeps the rules from `docs/plans/2026-10-25-mobile-adaptation.md`: text fields render at 16px (the iOS zoom guard), reach-out targets are at least 40px and filter rows 44px, bottom sheets become `<Drawer placement="bottom">`, the bottom tab bar stays, and phones get no bulk selection.
- **Desktop app:** `electron/` is a thin client of the deployment, so it needs no code changes. It's checked at the end of each phase with `npm run app`.
- **Verification per task:** `cd frontend && npm run build && npm run lint` must pass. A bare `tsc` isn't enough (see PROJECT.md). Visual checks are the user's job: each phase ends with a hand-off listing what to look at, on desktop and at phone width.
- **Old CSS dies with its screen.** When a screen moves to Ant, its rules in `index.css`, `styles/pages.css` and `styles/pages/*.css` are deleted in the same change. Never leave both.
- **Commits** happen only when the user asks. Each task ends at a clean, buildable checkpoint.
- **Docs per phase:** an entry at the top of `docs/log.md`, a refresh of DESIGN.md if a new pattern appeared, a note in `docs/reference.md` for anything architectural, and the boxes in this file ticked.

## Where we start (measured 2026-11-05)

- **~25 routes** (`frontend/src/App.tsx`), about 110 TSX files and 31K lines.
- **~8,200 lines of global CSS**: `index.css` (7,936), `styles/design-system.css` (287) and 17 page stylesheets in `styles/pages/`.
- **Shared primitives** in `components/ui/` and how many files use each: Button 46, Toast 30, LoadingSpinner 22, ConfirmDialog 18, EmptyState 15, Badge 9, Tabs 6, FilePicker 6, Modal 4, SearchBar 4, ActionMenu 3.
- **Icons:** 329 `<Icon>` uses with 83 distinct literal names, plus icon names passed as strings in config objects (nav, cleanup modes, tabs). All are Font Awesome, loaded by an external kit script.
- **Raw elements** outside the primitives: 125 `<button>`, 58 `<input>`, 10 `<select>`, 7 `<table>`.
- **Bundle:** main JS is 295 KB gzipped (plus a 58 KB lazy chunk). Tabler measured about **9 KB** gzipped for the 103 icons Yello needs. A test bundle of the same components measured Ant at **+177 KB** gzipped for the core set and **+218 KB** with date picker, autocomplete and tags. It ships as its own cached chunk.
- **Metrics already match Ant:** 32px control height, 4/6/8px corners and 14px control labels. The differences are colour (violet → blue), font (Geist → system) and body text (16px → 14px).

## Phase overview

| # | Phase | What changes for the user | Design work |
|---|---|---|---|
| 0 | **Foundation** | Every button, dialog, tab bar, toast, spinner and empty state is Ant; every icon is Tabler (stroke 1.5), Ant's built-in ones included; the colours and font are Ant's | No |
| 1 | **App shell** | Ant side navigation, header, phone tab bar, job pill, banners | Light |
| 2 | **Design documentation (impeccable)** | Nothing visible. DESIGN.md, the sidecar, PRODUCT.md and the style guide describe the Ant system and its rules | Yes, documentation |
| 3 | **Contacts** | List, filters, grid/card views, contact detail, add/edit form, photos, groups field | Medium |
| 4 | **Dashboard and relationship views** | Dashboard, Birthdays, Recent, Top contacts, Groups, Map, Archive | Medium |
| 5 | **Tools: import, sync, export, enrich, Text Blast** | Tools page, every import flow, iCloud/Google sync, export, Danger Zone, Enrich, Text Blast | Light |
| 6 | **Tools: Cleanup and Merge redesign** | A redesigned Cleanup section and Merge flow, shaped first, then built | **Yes, full** |
| 7 | **Profile, onboarding, admin** | Profile and public-card settings, onboarding, welcome, demo prompt, Admin, Docs | Light |
| 8 | **Public pages** | Landing page, public card, login, privacy, terms; the OG image | Yes (persuade pages) |
| 9 | **Remove the old system** | No visible change. Leftover CSS, the bridge's dead tokens and the legacy icon props are deleted; a final audit runs | No |
| 10 | **Dark mode (optional)** | Light, dark or follow-system, set in Profile | Light |

Phases 3–5 are independent once Phase 2 is done, and can be reordered. Phase 6's **shaping** (design only, no code) can start any time after Phase 2, in parallel with Phases 3–5.

Phases 0 and 2 are broken into tasks below. Every other phase lists its scope, files and exit criteria here, and **gets its own task breakdown in this file when it starts**, because it builds on Phase 0's components and Phase 2's DESIGN.md. Keeping everything in one file keeps one source of truth.

---

## Phase 0 — Foundation

**Exit criteria:** Ant is installed and wraps the app. The `--ds-*` variables come from Ant's theme. Every icon is Tabler at stroke 1.5, including the ones Ant draws inside its components, and the Font Awesome script is gone. All 11 primitives in `components/ui/` render Ant components with their existing props. Their old CSS is deleted. Build and lint pass. The bundle sizes are recorded under *Changes*.

### Task 0.1: Install Ant, wrap the app, split the vendor chunk

**Files:**
- Modify: `frontend/package.json` (via npm)
- Create: `frontend/src/theme/AntProvider.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/vite.config.ts`

**Interfaces:**
- Produces: `AntProvider({ children })`. Everything inside it can call `App.useApp()` and `theme.useToken()`.

- [x] **Step 1: Record the baseline bundle size**

```bash
cd frontend && npm run build && for f in dist/assets/*.js; do echo "$(gzip -9c $f | wc -c | awk '{printf "%d", $1/1024}') KB gz  $(basename $f)"; done
```
Expected: about 295 KB for `index-*.js`. Write the numbers under *Changes*.

- [x] **Step 2: Install**

```bash
cd frontend && npm i antd@^6.7.0
```

- [x] **Step 3: Create `src/theme/AntProvider.tsx`**

```tsx
import type { ReactNode } from 'react';
import { App as AntApp, ConfigProvider } from 'antd';
import { TokenBridge } from './TokenBridge';

/** Stock Ant Design for the whole app. No token overrides (see docs/plans/2026-11-05-ant-design-migration.md). */
export function AntProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider>
      {/* component={false}: no wrapper div, so the existing layout CSS is unaffected */}
      <AntApp component={false}>
        <TokenBridge />
        {children}
      </AntApp>
    </ConfigProvider>
  );
}
```

Create a stub `src/theme/TokenBridge.tsx` so this builds (Task 0.2 fills it in):

```tsx
export function TokenBridge() {
  return null;
}
```

- [x] **Step 4: Wrap the app in `src/main.tsx`**

```tsx
import { AntProvider } from './theme/AntProvider';
// …
      <QueryClientProvider client={queryClient}>
        <AntProvider>
          <App />
        </AntProvider>
      </QueryClientProvider>
```

- [x] **Step 5: Put Ant in its own chunk** (`vite.config.ts`, inside the returned config)

```ts
    build: {
      rollupOptions: {
        output: {
          // Ant changes far less often than app code, so browsers keep it cached across deploys
          manualChunks(id: string) {
            if (/node_modules\/(antd|@ant-design|@rc-component|rc-[a-z-]+)\//.test(id)) return 'antd';
          },
        },
      },
    },
```

- [x] **Step 6: Verify.** Run `npm run build && npm run lint`. Expected: it passes, `dist/assets/` has an `antd-*.js` chunk, and the main chunk is about the same size as before.

### Task 0.2: Token bridge, global CSS reconciliation, phone field guard

**Files:**
- Modify: `frontend/src/theme/TokenBridge.tsx`
- Modify: `frontend/src/index.css` (the reset at lines 6–19 and the focus rules at lines 80–105)
- Modify: `frontend/index.html` (remove the Geist `<link>` and the two `preconnect` lines)

**Interfaces:**
- Produces: every `--ds-color-*`, `--ds-text-*`, `--ds-bg-*`, `--ds-border-*`, `--ds-radius-*`, `--ds-shadow-*`, `--ds-duration-*`, `--ds-easing-*`, `--ds-font-family`, `--ds-font-mono` and `--ds-control-height` variable now follows Ant's theme, and will follow dark mode later. Spacing, the type scale and z-index **stay as they are** for now. Changing them on unmigrated screens would break their layouts; they move screen by screen.

- [x] **Step 1: Write `TokenBridge.tsx`**

```tsx
import { useLayoutEffect } from 'react';
import { theme } from 'antd';

/**
 * Points the old --ds-* CSS variables at Ant's live theme, so screens not yet
 * migrated pick up Ant's colours and font now (and dark mode later) without CSS
 * edits. Inline styles on <html> override the :root values in design-system.css.
 * Delete entries as their last users migrate (Phase 9).
 */
export function TokenBridge() {
  const { token: t } = theme.useToken();

  useLayoutEffect(() => {
    const px = (n: number) => `${n}px`;
    const vars: Record<string, string> = {
      '--ds-color-primary': t.colorPrimary,
      '--ds-color-primary-hover': t.colorPrimaryHover,
      '--ds-color-primary-light': t.colorPrimaryBg,
      '--ds-color-primary-dark': t.colorPrimaryActive,
      '--ds-color-error': t.colorError,
      '--ds-color-error-hover': t.colorErrorHover,
      '--ds-color-error-light': t.colorErrorBg,
      '--ds-color-error-dark': t.colorErrorActive,
      '--ds-color-success': t.colorSuccess,
      '--ds-color-success-hover': t.colorSuccessHover,
      '--ds-color-success-light': t.colorSuccessBg,
      '--ds-color-success-dark': t.colorSuccessActive,
      '--ds-color-warning': t.colorWarning,
      '--ds-color-warning-hover': t.colorWarningHover,
      '--ds-color-warning-light': t.colorWarningBg,
      '--ds-color-warning-dark': t.colorWarningActive,
      '--ds-color-info': t.colorInfo,
      '--ds-color-info-hover': t.colorInfoHover,
      '--ds-color-info-light': t.colorInfoBg,
      '--ds-color-info-dark': t.colorInfoActive,
      '--ds-text-primary': t.colorText,
      '--ds-text-secondary': t.colorTextSecondary,
      '--ds-text-tertiary': t.colorTextTertiary,
      '--ds-text-muted': t.colorTextTertiary,
      '--ds-text-disabled': t.colorTextDisabled,
      '--ds-text-inverse': t.colorTextLightSolid,
      '--ds-text-link': t.colorLink,
      '--ds-text-link-hover': t.colorLinkHover,
      '--ds-bg-primary': t.colorBgContainer,
      '--ds-bg-secondary': t.colorBgLayout,
      '--ds-bg-tertiary': t.colorFillTertiary,
      '--ds-bg-hover': t.controlItemBgHover,
      '--ds-bg-active': t.controlItemBgActive,
      '--ds-bg-selected': t.controlItemBgActive,
      '--ds-bg-overlay': t.colorBgMask,
      '--ds-border-color': t.colorBorderSecondary,
      '--ds-border-light': t.colorSplit,
      '--ds-border-dark': t.colorBorder,
      '--ds-border-focus': t.colorPrimary,
      '--ds-font-family': t.fontFamily,
      '--ds-font-mono': t.fontFamilyCode,
      '--ds-radius-sm': px(t.borderRadiusSM),
      '--ds-radius-md': px(t.borderRadius),
      '--ds-radius-lg': px(t.borderRadiusLG),
      '--ds-shadow-xs': t.boxShadowTertiary,
      '--ds-shadow-sm': t.boxShadowTertiary,
      '--ds-shadow-md': t.boxShadowSecondary,
      '--ds-shadow-lg': t.boxShadow,
      '--ds-shadow-focus': `0 0 0 ${px(t.controlOutlineWidth)} ${t.controlOutline}`,
      '--ds-duration-fast': t.motionDurationFast,
      '--ds-duration-normal': t.motionDurationMid,
      '--ds-duration-slow': t.motionDurationSlow,
      '--ds-easing-default': t.motionEaseInOut,
      '--ds-easing-in': t.motionEaseIn,
      '--ds-easing-out': t.motionEaseOut,
      '--ds-control-height': px(t.controlHeight),
    };
    const root = document.documentElement.style;
    for (const [name, value] of Object.entries(vars)) root.setProperty(name, value);
  }, [t]);

  return null;
}
```

- [x] **Step 2: Remove Geist from `index.html`.** Delete the Geist stylesheet `<link>` and both `fonts.googleapis.com`/`fonts.gstatic.com` `preconnect` lines. Ant's system font stack takes over through `--ds-font-family`.

- [x] **Step 3: Keep the global rules off Ant's components** (`index.css`). Ant draws its own focus rings, so the global ones would double up on Ant controls. Scope the focus rules in lines 80–105 to elements that aren't Ant's:

```css
:focus-visible:not([class*='ant-']) { outline: 2px solid var(--ds-color-primary); outline-offset: 2px; }

button:focus-visible:not([class*='ant-']),
a:focus-visible:not([class*='ant-']),
[role="button"]:focus-visible:not([class*='ant-']) {
  outline: 2px solid var(--ds-color-primary);
  outline-offset: 2px;
  box-shadow: var(--ds-shadow-focus);
}

input:focus-visible:not([class*='ant-']),
textarea:focus-visible:not([class*='ant-']),
select:focus-visible:not([class*='ant-']) {
  outline: none;
  border-color: var(--ds-color-primary);
  box-shadow: var(--ds-shadow-focus);
}
```
The `box-sizing` reset, `h1–h6 line-height` and `font: inherit` on form elements are harmless to Ant and stay.

- [x] **Step 4: Phone field guard for Ant inputs** (append to the existing ≤768px block in `index.css`)

```css
@media (max-width: 768px) {
  /* iOS zooms into any field under 16px; Ant's default is 14px */
  .ant-input, .ant-input-affix-wrapper input, .ant-input-number-input,
  .ant-select-selection-search-input, .ant-select-selection-item,
  .ant-picker-input > input, textarea.ant-input { font-size: 16px; }
}
```

- [x] **Step 5: Verify.** Run `npm run build && npm run lint`, and confirm both pass.
- [x] **Step 6: Hand-off note for the user.** Every screen now uses Ant blue and the system font. Layouts should be unchanged.

### Task 0.3: Tabler icons (stroke 1.5) behind the existing `<Icon>` API; Font Awesome removed

**Files:**
- Modify: `frontend/package.json` (via npm)
- Modify: `frontend/src/components/Icon.tsx`
- Modify: `frontend/src/index.css` (add the `.yello-icon` rules)
- Modify: every config object whose icon field is typed `string`, which TypeScript will point out (`NavRail.tsx`, `BottomTabBar.tsx`, `CleanupModeSelector.tsx`, `ui/Tabs.tsx`, `ui/ActionMenu.tsx`, `ui/Button.tsx`, `ui/EmptyState.tsx`, `ui/Toast.tsx` and others)
- Modify: `frontend/index.html` (remove the `kit.fontawesome.com` script)
- Modify: `frontend/eslint.config.js` (ban `@ant-design/icons` imports)

**Interfaces:**
- Produces:
  - `type IconName`, a union of every supported name.
  - `<Icon name={IconName} className? spin? />`, which renders a Tabler SVG at `stroke={1.5}`, sized `1em`, inside `<span class="anticon yello-icon">`. The legacy `style` prop is still accepted and ignored until Phase 9.
  - `ICON_STROKE = 1.5`.
  - Any component that takes an icon name must type it `IconName`, so a misspelt or unmapped icon fails the build. That's the test for this task.
- **Why the `anticon` class:** Ant styles icons inside its components through `.anticon`. That covers alignment, spacing in buttons, menus and inputs, and the status colours in messages and alerts. Giving Tabler icons that class makes them sit and colour exactly like Ant's own. The extra `yello-icon` class tells them apart from Ant's built-in icons (see the check in Task 0.4).

- [x] **Step 1: Install**

```bash
cd frontend && npm i @tabler/icons-react@^3.50.0
```
`@ant-design/icons` stays in `node_modules`, because Ant uses it internally. The app never imports it.

- [x] **Step 2: List every icon name in use**

```bash
cd frontend && { grep -rhoE '<Icon[^>]*name="[a-z0-9-]+"' src | grep -oE '"[a-z0-9-]+"'; grep -rhoE "icon(Name)?: *'[a-z0-9-]+'" src | grep -oE "'[a-z0-9-]+'"; } | tr -d "\"'" | sort -u
```

- [x] **Step 3: Rewrite `Icon.tsx`** with a map that covers every name from Step 2. The names below are known today. All the Tabler names were checked against `@tabler/icons-react@3.50.0`, including the extra names Task 0.4 needs for Ant's built-in icons (`calendar`, `chevron-left`, `chevrons-*`, `paperclip`, `eye`, `arrow-up` and the `*-solid` status icons). Add any extra names Step 2 finds the same way.

```tsx
import {
  IconAddressBook, IconAlertCircle, IconAlertCircleFilled, IconAlertTriangle, IconAlertTriangleFilled, IconArchive,
  IconArrowBackUp, IconArrowLeft, IconArrowRight, IconArrowUp, IconArrowsExchange, IconArrowsLeftRight, IconBook,
  IconBrandApple, IconBrandGoogle, IconBrandLinkedin, IconBrandWhatsapp, IconBriefcase, IconBuilding,
  IconBuildingSkyscraper, IconCake, IconCalendar, IconCalendarX, IconCamera, IconCertificate, IconCheck,
  IconChevronDown, IconChevronLeft, IconChevronRight, IconChevronsLeft, IconChevronsRight, IconCircle,
  IconCircleCheck, IconCircleCheckFilled, IconCircleDot, IconCircleMinus, IconCirclePlus, IconCircleX,
  IconCircleXFilled, IconClock, IconCloudDownload, IconCopy, IconDeviceLaptop, IconDots, IconDotsVertical,
  IconDownload, IconExternalLink, IconEye, IconEyeOff, IconFileImport, IconFileText, IconFilter, IconGitMerge,
  IconHistory, IconHome, IconId, IconInfoCircle, IconInfoCircleFilled, IconLayoutGrid, IconLink, IconLinkOff,
  IconList, IconListCheck, IconLoader2, IconLock, IconLogin, IconMail, IconMap, IconMapPin, IconMessage,
  IconMessages, IconNote, IconPalette, IconPaperclip, IconPencil, IconPhone, IconPhoto, IconPlus, IconRefresh,
  IconReportSearch, IconRocket, IconRosetteDiscountCheck, IconSchool, IconSearch, IconSend, IconShare,
  IconShieldHalf, IconSparkles, IconSquare, IconStar, IconThumbUp, IconTool, IconTrash, IconTrophy, IconUpload,
  IconUser, IconUserOff, IconUserPlus, IconUsers, IconWand, IconWorld, IconX,
} from '@tabler/icons-react';
import type { TablerIcon } from '@tabler/icons-react';

/** Every icon in Yello is Tabler at this stroke (DESIGN.md). Filled icons ignore it. */
export const ICON_STROKE = 1.5;

/** Old Font Awesome names → Tabler. Keys are kept so the 329 call sites didn't need touching. */
const ICONS = {
  'address-book': IconAddressBook, 'address-card': IconId, apple: IconBrandApple,
  'arrow-left': IconArrowLeft, 'arrow-right': IconArrowRight, 'arrow-rotate-left': IconArrowBackUp,
  'arrow-up': IconArrowUp, 'arrow-up-right-from-square': IconExternalLink, 'arrows-left-right': IconArrowsLeftRight,
  'arrows-rotate': IconRefresh, 'badge-check': IconRosetteDiscountCheck, book: IconBook, 'box-archive': IconArchive,
  briefcase: IconBriefcase, broom: IconWand, building: IconBuilding, 'cake-candles': IconCake,
  calendar: IconCalendar, 'calendar-xmark': IconCalendarX, camera: IconCamera, certificate: IconCertificate,
  check: IconCheck, 'chevron-down': IconChevronDown, 'chevron-left': IconChevronLeft,
  'chevron-right': IconChevronRight, 'chevrons-left': IconChevronsLeft, 'chevrons-right': IconChevronsRight,
  circle: IconCircle, 'circle-check': IconCircleCheck, 'circle-check-solid': IconCircleCheckFilled,
  'circle-dot': IconCircleDot, 'circle-exclamation': IconAlertCircle, 'circle-exclamation-solid': IconAlertCircleFilled,
  'circle-info': IconInfoCircle, 'circle-info-solid': IconInfoCircleFilled, 'circle-minus': IconCircleMinus,
  'circle-plus': IconCirclePlus, 'circle-xmark': IconCircleX, 'circle-xmark-solid': IconCircleXFilled,
  city: IconBuildingSkyscraper, clock: IconClock, 'clock-rotate-left': IconHistory,
  'cloud-arrow-down': IconCloudDownload, 'code-merge': IconGitMerge, 'comment-sms': IconMessage,
  comments: IconMessages, copy: IconCopy, download: IconDownload, ellipsis: IconDots,
  'ellipsis-vertical': IconDotsVertical, envelope: IconMail, eye: IconEye, 'eye-slash': IconEyeOff,
  'file-import': IconFileImport, 'file-lines': IconFileText, filter: IconFilter, globe: IconWorld,
  google: IconBrandGoogle, 'graduation-cap': IconSchool, 'hand-sparkles': IconSparkles, house: IconHome,
  images: IconPhoto, laptop: IconDeviceLaptop, link: IconLink, 'link-slash': IconLinkOff,
  linkedin: IconBrandLinkedin, list: IconList, 'list-check': IconListCheck, 'location-dot': IconMapPin,
  lock: IconLock, 'magnifying-glass': IconSearch, 'magnifying-glass-chart': IconReportSearch, map: IconMap,
  message: IconMessage, 'paper-plane': IconSend, paperclip: IconPaperclip, pen: IconPencil, phone: IconPhone,
  plus: IconPlus, 'ranking-star': IconTrophy, 'right-left': IconArrowsExchange, 'right-to-bracket': IconLogin,
  rocket: IconRocket, 'screwdriver-wrench': IconTool, 'share-nodes': IconShare, 'shield-halved': IconShieldHalf,
  spinner: IconLoader2, square: IconSquare, star: IconStar, 'sticky-note': IconNote, swatchbook: IconPalette,
  'table-cells-large': IconLayoutGrid, 'thumbs-up': IconThumbUp, trash: IconTrash,
  'triangle-exclamation': IconAlertTriangle, 'triangle-exclamation-solid': IconAlertTriangleFilled,
  upload: IconUpload, user: IconUser, 'user-plus': IconUserPlus, 'user-slash': IconUserOff, users: IconUsers,
  whatsapp: IconBrandWhatsapp, xmark: IconX,
} satisfies Record<string, TablerIcon>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  className?: string;
  /** Rotate continuously (busy states) */
  spin?: boolean;
  /** @deprecated Font Awesome style; ignored. Removed in Phase 9. */
  style?: 'solid' | 'regular' | 'brands';
}

export function Icon({ name, className, spin = false }: IconProps) {
  const Svg = ICONS[name];
  const classes = ['anticon', 'yello-icon', spin && 'yello-icon--spin', className].filter(Boolean).join(' ');
  return (
    <span role="img" aria-hidden className={classes}>
      <Svg size="1em" stroke={ICON_STROKE} />
    </span>
  );
}
```

- [x] **Step 4: Add the icon rules to `index.css`.** They also cover screens that render an `<Icon>` outside any Ant component.

```css
/* Tabler icons: sit on the text line like Ant's own icons */
.yello-icon { display: inline-flex; align-items: center; line-height: 0; vertical-align: -0.125em; }
.yello-icon > svg { flex: none; }
.yello-icon--spin { animation: yello-icon-spin 1s linear infinite; }
.yello-icon--rotate-90 > svg { transform: rotate(90deg); transition: transform var(--ds-duration-normal) var(--ds-easing-default); }
@keyframes yello-icon-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .yello-icon--spin { animation-duration: 3s; } }
```

- [x] **Step 5: Type every icon-name prop and field as `IconName`.** That covers `ButtonProps.icon`, `TabItem.icon`, `EmptyStateProps.icon`, `ActionMenuItem.icon` and `triggerIcon`, `TOAST_ICONS`, `NavRailItemProps.icon`, `MODE_CONFIG`, and anything else TypeScript flags. Run `npm run build` and repeat until no `string is not assignable to IconName` errors are left.
- [x] **Step 6: Replace the `spinning` busy pattern.** `<Icon name="arrows-rotate" className={busy ? 'spinning' : ''} />` becomes `<Icon name="arrows-rotate" spin={busy} />` (find them with `grep -rn "spinning" frontend/src`). Then delete the old `.spinning` rule.
- [x] **Step 7: Ban Ant's icon package in app code** (`eslint.config.js`, in the rules for `src/**/*.{ts,tsx}`)

```js
'no-restricted-imports': ['error', {
  paths: [{ name: '@ant-design/icons', message: 'Use <Icon> from components/Icon (Tabler, stroke 1.5).' }],
  patterns: [{ group: ['@ant-design/icons/*'], message: 'Use <Icon> from components/Icon (Tabler, stroke 1.5).' }],
}],
```

- [x] **Step 8: Remove the Font Awesome kit `<script>` from `index.html`.** Check that `grep -rn "fa-" frontend/src` only finds CSS rules, then delete those rules (`.fa-*` selectors in `index.css` and `styles/`).
- [x] **Step 9: Verify.** Run `npm run build && npm run lint`, and confirm both pass.

### Task 0.4: Replace Ant's built-in icons with Tabler

Ant draws its own icons inside its components: the X on dialogs, drawers and tags, the arrow on selects, the clear button, the calendar, the spinner, the status icons in alerts and messages, the pagination and date-panel arrows, and more. Without this task they would stay as Ant's set next to Tabler. Most of them can be set once on `ConfigProvider`. The rest have no global setting, so they're set on every use through a small `components/ui/` wrapper, and lint blocks the unwrapped component.

**Files:**
- Create: `frontend/src/theme/antIcons.tsx`
- Modify: `frontend/src/theme/AntProvider.tsx`
- Create: `frontend/src/components/ui/DatePicker.tsx` (`DatePicker` and `TimePicker` with the panel arrows set)
- Create: `frontend/src/components/ui/PasswordInput.tsx` (`Input.Password` with the eye toggle set; the iCloud app-specific password uses it)
- Modify: `frontend/eslint.config.js`

**Interfaces:**
- Consumes: `Icon` and `IconName` from Task 0.3.
- Produces:
  - `antIconConfig`: the `ConfigProvider` props that swap every globally configurable built-in icon.
  - `statusIcons: Record<'success' | 'info' | 'warning' | 'error', ReactNode>`, used by the toast (Task 0.5) and by `Result`, `Popconfirm` and `Modal.confirm`-style calls.
  - `paginationIcons`: spread on `<Pagination>` (Phase 1).
  - `pickerPanelIcons`: used inside `ui/DatePicker`.
  - `passwordIconRender`: used inside `ui/PasswordInput`.
  - `uploadListIcons`: spread on `<Upload>` (`ui/FilePicker`, Task 0.9).
  - `copyableIcons`: for `Typography` `copyable={{ icon: copyableIcons }}`.

- [x] **Step 1: Create `src/theme/antIcons.tsx`**

```tsx
import type { ReactNode } from 'react';
import type { ConfigProviderProps, PaginationProps, UploadProps } from 'antd';
import { Icon } from '../components/Icon';

const close = <Icon name="xmark" />;
const clear = <Icon name="circle-xmark-solid" />;
const chevronDown = <Icon name="chevron-down" />;
const loading = <Icon name="spinner" spin />;
const search = <Icon name="magnifying-glass" />;

/** Ant's status icons (filled, like Ant's own); Ant colours them through `.anticon` */
export const statusIcons = {
  success: <Icon name="circle-check-solid" />,
  info: <Icon name="circle-info-solid" />,
  warning: <Icon name="circle-exclamation-solid" />,
  error: <Icon name="circle-xmark-solid" />,
} satisfies Record<'success' | 'info' | 'warning' | 'error', ReactNode>;

/** Every built-in icon Ant lets us set once, for the whole app */
export const antIconConfig = {
  button: { loadingIcon: loading },
  spin: { indicator: <Icon name="spinner" spin /> },
  select: { suffixIcon: chevronDown, clearIcon: clear, removeIcon: close, menuItemSelectedIcon: <Icon name="check" />, loadingIcon: loading },
  cascader: { suffixIcon: chevronDown, clearIcon: clear, removeIcon: close, expandIcon: <Icon name="chevron-right" />, loadingIcon: loading, searchIcon: search },
  treeSelect: { switcherIcon: chevronDown },
  datePicker: { suffixIcon: <Icon name="calendar" />, clearIcon: clear },
  timePicker: { suffixIcon: <Icon name="clock" />, clearIcon: clear },
  inputSearch: { searchIcon: search },
  modal: { closeIcon: close, successIcon: statusIcons.success, infoIcon: statusIcons.info, warningIcon: statusIcons.warning, errorIcon: statusIcons.error },
  alert: { closeIcon: close, successIcon: statusIcons.success, infoIcon: statusIcons.info, warningIcon: statusIcons.warning, errorIcon: statusIcons.error },
  drawer: { closeIcon: close },
  notification: { closeIcon: close },
  tag: { closeIcon: close },
  tour: { closeIcon: close },
  image: { preview: { closeIcon: close } },
  tabs: { moreIcon: <Icon name="ellipsis" />, addIcon: <Icon name="plus" />, removeIcon: close },
  breadcrumb: { separator: <Icon name="chevron-right" />, dropdownIcon: chevronDown },
  transfer: { selectionsIcon: chevronDown },
  floatButton: { backTopIcon: <Icon name="arrow-up" /> },
  collapse: {
    expandIcon: ({ isActive }) => <Icon name="chevron-right" className={isActive ? 'yello-icon--rotate-90' : undefined} />,
  },
  menu: {
    expandIcon: ({ isOpen }) => <Icon name="chevron-down" className={isOpen ? 'yello-icon--rotate-180' : undefined} />,
  },
  table: {
    expandable: {
      expandIcon: ({ expanded, onExpand, record }) => (
        <button
          type="button"
          className="yello-table-expand"
          aria-label={expanded ? 'Collapse row' : 'Expand row'}
          aria-expanded={expanded}
          onClick={(e) => onExpand(record, e)}
        >
          <Icon name="chevron-right" className={expanded ? 'yello-icon--rotate-90' : undefined} />
        </button>
      ),
    },
  },
} satisfies Partial<ConfigProviderProps>;

/** Pagination has no global icon setting; same markup as Ant's own so its styles still apply */
const jump = (name: 'chevrons-left' | 'chevrons-right') => (
  <a className="ant-pagination-item-link">
    <div className="ant-pagination-item-container">
      <Icon name={name} className="ant-pagination-item-link-icon" />
      <span className="ant-pagination-item-ellipsis"><Icon name="ellipsis" /></span>
    </div>
  </a>
);
export const paginationIcons = {
  prevIcon: <button type="button" className="ant-pagination-item-link" tabIndex={-1}><Icon name="chevron-left" /></button>,
  nextIcon: <button type="button" className="ant-pagination-item-link" tabIndex={-1}><Icon name="chevron-right" /></button>,
  jumpPrevIcon: jump('chevrons-left'),
  jumpNextIcon: jump('chevrons-right'),
} satisfies Partial<PaginationProps>;

/** Month/year arrows inside the date and time panels */
export const pickerPanelIcons = {
  prevIcon: <Icon name="chevron-left" />,
  nextIcon: <Icon name="chevron-right" />,
  superPrevIcon: <Icon name="chevrons-left" />,
  superNextIcon: <Icon name="chevrons-right" />,
};

export const passwordIconRender = (visible: boolean) => <Icon name={visible ? 'eye' : 'eye-slash'} />;

export const uploadListIcons = {
  iconRender: () => <Icon name="paperclip" />,
  showUploadList: { removeIcon: <Icon name="trash" />, downloadIcon: <Icon name="download" />, previewIcon: <Icon name="eye" /> },
} satisfies Partial<UploadProps>;

export const copyableIcons = [<Icon key="copy" name="copy" />, <Icon key="done" name="check" />];
```
Add `.yello-icon--rotate-180 > svg { transform: rotate(180deg); }` and a reset for `.yello-table-expand` to `index.css`: `.yello-table-expand { all: unset; cursor: pointer; display: inline-flex; padding: 4px; border-radius: var(--ds-radius-sm); }` with `:focus-visible` using `var(--ds-shadow-focus)`. If TypeScript rejects a key because Ant's config doesn't take it, check `antd/es/config-provider/context.d.ts` for that component's config type. Every key above was checked against Ant 6.7.0. If the key doesn't exist in that file, move it to the per-use list below.

- [x] **Step 2: Apply it in `AntProvider.tsx`:** `<ConfigProvider {...antIconConfig}>`. These are icon settings, not theme tokens, so the stock-theme rule still holds.

- [x] **Step 3: Create the two wrappers for icons Ant can't set globally**

```tsx
// components/ui/DatePicker.tsx
import { DatePicker as AntDatePicker, TimePicker as AntTimePicker } from 'antd';
import type { DatePickerProps, TimePickerProps } from 'antd';
import { pickerPanelIcons } from '../../theme/antIcons';

/** Ant's DatePicker with Tabler panel arrows (no global setting exists for them) */
export function DatePicker(props: DatePickerProps) {
  return <AntDatePicker {...pickerPanelIcons} {...props} />;
}
export function TimePicker(props: TimePickerProps) {
  return <AntTimePicker {...pickerPanelIcons} {...props} />;
}
```

```tsx
// components/ui/PasswordInput.tsx
import { Input } from 'antd';
import type { PasswordProps } from 'antd/es/input';
import { passwordIconRender } from '../../theme/antIcons';

export function PasswordInput(props: PasswordProps) {
  return <Input.Password iconRender={passwordIconRender} {...props} />;
}
```
If a screen later needs `RangePicker`, add it to `ui/DatePicker.tsx` the same way.

- [x] **Step 4: Make lint enforce it.** Add one entry to the `paths` array of the `no-restricted-imports` rule from Task 0.3:

```js
{
  name: 'antd',
  importNames: ['DatePicker', 'TimePicker', 'message', 'notification'],
  message: 'These draw icons Ant cannot swap globally. Use components/ui/DatePicker, or useToast() from components/ui/Toast.',
},
```
`ui/DatePicker.tsx`, `ui/Toast.tsx` and `theme/` are the only files allowed to import them. Exempt them with an `ignores` entry on that rule block. `Input.Password` can't be banned by import name, so DESIGN.md records the rule (Phase 2), and the icon check below catches it.

- [x] **Step 5: Accept the few that can't be changed.** These are documented in DESIGN.md (Phase 2), not hidden:
  - The **Steps** finish tick and error cross. Setting `icon` replaces the whole step marker. Phase 5 decides whether `Steps` uses custom `icon`s at all.
  - **Rate** stars. Pass `character={<Icon name="star" />}` on the rare screen that uses it.
  - Checkbox, radio and switch are drawn with CSS, not icons, so nothing changes there.

- [x] **Step 6: The icon check (used at every phase hand-off).** Ant's own icons render as `span.anticon`, and ours carry `.yello-icon`. On any screen, this snippet in the browser console lists every Ant icon still showing:

```js
[...document.querySelectorAll('.anticon:not(.yello-icon)')].map((el) => el.className)
```
Expected: `[]`. Open selects, date pickers, dialogs and menus before running it, because their icons only mount when shown. Running it is part of the user's visual check (Global constraints).

- [x] **Step 7: Verify.** Run `npm run build && npm run lint`, and confirm both pass.

### Task 0.5: Toasts on Ant `message` and `notification`

**Files:**
- Modify: `frontend/src/components/ui/Toast.tsx`
- Modify: `frontend/src/index.css` (delete the `.toast*` rules)

**Interfaces:**
- Consumes: `App.useApp()` from Task 0.1 and `statusIcons` from Task 0.4. `ToastProvider` is mounted in `App.tsx:177`, inside `AntProvider`.
- Produces: the same `useToast(): { showToast(message, { type?, duration?, action? }) }`. No caller changes.

- [x] **Step 1: Replace the provider body**

```tsx
import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { App, Button } from 'antd';
import { statusIcons } from '../../theme/antIcons';

type ToastType = 'success' | 'error' | 'info';
interface ToastAction { label: string; onClick: () => void }
interface ShowToastOptions { type?: ToastType; duration?: number; action?: ToastAction }
interface ToastContextValue { showToast: (message: string, options?: ShowToastOptions) => void }

const ToastContext = createContext<ToastContextValue | null>(null);
/** One toast at a time, last wins (same behaviour as before) */
const TOAST_KEY = 'yello-toast';

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { message, notification } = App.useApp();

  const showToast = useCallback((text: string, options?: ShowToastOptions) => {
    const type = options?.type ?? 'success';
    const duration = (options?.duration ?? 5000) / 1000; // Ant takes seconds
    const action = options?.action;
    if (!action) {
      message.open({ key: TOAST_KEY, type, icon: statusIcons[type], content: text, duration });
      return;
    }
    // A toast with an action (e.g. Undo) needs a button, which message has no slot for
    notification.open({
      key: TOAST_KEY,
      type,
      icon: statusIcons[type],
      title: text,
      duration,
      placement: 'top',
      actions: (
        <Button type="link" size="small" onClick={() => { action.onClick(); notification.destroy(TOAST_KEY); }}>
          {action.label}
        </Button>
      ),
    });
  }, [message, notification]);

  const value = useMemo(() => ({ showToast }), [showToast]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
```

- [x] **Step 2: Delete the `.toast` rules** from `index.css`, including the phone rule that moved the toast above the tab bar. Ant messages sit at the top, clear of the tab bar.
- [x] **Step 3: Verify.** Run `npm run build && npm run lint`, and confirm both pass.

### Task 0.6: `Button` on Ant

**Files:**
- Modify: `frontend/src/components/ui/Button.tsx`
- Modify: `frontend/src/index.css` (delete `.btn`, `.btn--*`)

**Interfaces:**
- Produces: the same props (`variant`, `size`, `icon: IconName`, `loading`, `type`, `ref`, plus HTML button attributes). The mapping is `primary` → Ant `type="primary"`, `secondary` → `default`, `danger` → `primary` with `danger`, `ghost` → `text`, and `icon` → `text` with only an icon. For sizes, `sm` → `small` (24px, stock Ant) and `lg` → `large` (40px).

- [x] **Step 1: Replace the component**

```tsx
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Button as AntButton } from 'antd';
import type { ButtonProps as AntButtonProps } from 'antd';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
type ButtonSize = 'md' | 'sm' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'type'> {
  /** Visual role. One `primary` per view; `secondary` is the default. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Busy state: Ant shows its spinner and blocks clicks */
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  ref?: Ref<HTMLButtonElement>;
  children?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, Pick<AntButtonProps, 'type' | 'danger'>> = {
  primary: { type: 'primary' },
  secondary: { type: 'default' },
  danger: { type: 'primary', danger: true },
  ghost: { type: 'text' },
  icon: { type: 'text' },
};

const SIZES: Record<ButtonSize, AntButtonProps['size']> = { sm: 'small', md: 'middle', lg: 'large' };

export function Button({ variant = 'secondary', size = 'md', icon, loading = false, type = 'button', ref, children, ...rest }: ButtonProps) {
  return (
    <AntButton
      {...VARIANTS[variant]}
      {...rest}
      ref={ref}
      htmlType={type}
      size={SIZES[size]}
      icon={icon ? <Icon name={icon} /> : undefined}
      loading={loading}
    >
      {children}
    </AntButton>
  );
}
```
If TypeScript rejects `ref`, type the prop as `Ref<HTMLButtonElement | HTMLAnchorElement>` to match Ant's own ref type.

- [x] **Step 2: Busy buttons.** Where Task 0.3 left `<Icon name="arrows-rotate" spin={busy} />` inside a `<Button>`, switch to the button's `loading` prop. It shows the Tabler spinner set in `antIconConfig.button.loadingIcon`.
- [x] **Step 3: Delete `.btn` and `.btn--*`** from `index.css`.
- [x] **Step 4: Verify.** Run `npm run build && npm run lint`, and confirm both pass.

### Task 0.7: `Modal` and `ConfirmDialog` on Ant

**Files:**
- Modify: `frontend/src/components/ui/Modal.tsx` and `ui/ConfirmDialog.tsx`
- Modify: the four `Modal` callers: `DemoPromptModal.tsx`, `ContactList.tsx`, `AddressGeocoding.tsx`, `StyleGuideView.tsx`
- Modify: `frontend/src/index.css` (delete `.modal-overlay`, `.modal-content`, `.confirm-dialog`, `.confirm-actions`)

**Interfaces:**
- Produces: `Modal({ label, onClose?, role?, width?, className?, footer?, children })`. `label` becomes Ant's visible `title`. When `onClose` is missing, the modal can't be dismissed (no X, no Escape, no mask click). The modal is open whenever it's rendered, as before, so callers keep mounting it conditionally. `ConfirmDialog` keeps its props.

- [x] **Step 1: `Modal.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Modal as AntModal } from 'antd';

interface ModalProps {
  /** Visible title and accessible name */
  label: string;
  /** Escape, the X and a mask click call this. Omit it for a blocking dialog (e.g. progress). */
  onClose?: () => void;
  role?: 'dialog' | 'alertdialog';
  /** Pixel width; Ant's default is 520 */
  width?: number;
  className?: string;
  /** Ant footer; leave it out when the body renders its own buttons */
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({ label, onClose, role = 'dialog', width, className, footer = null, children }: ModalProps) {
  const dismissable = Boolean(onClose);
  return (
    <AntModal
      open
      title={label}
      onCancel={onClose}
      closable={dismissable}
      keyboard={dismissable}
      mask={{ closable: dismissable }}
      footer={footer}
      width={width}
      className={className}
      destroyOnHidden
      modalRender={(node) => <div role={role}>{node}</div>}
    >
      {children}
    </AntModal>
  );
}
```
`mask={{ closable }}` is the 6.x form (`MaskConfig.closable`; `maskClosable` is the older prop). `modalRender` only carries the `alertdialog` role; check the rendered DOM, and drop the wrapper if Ant already sets `role="dialog"` on its own panel.

- [x] **Step 2: `ConfirmDialog.tsx`.** Same props, now on Ant:

```tsx
export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, confirmDisabled = false, onConfirm, onCancel, children }: ConfirmDialogProps) {
  return (
    <Modal
      label={title}
      role="alertdialog"
      onClose={onCancel}
      footer={[
        <Button key="cancel" variant="secondary" onClick={onCancel} autoFocus>{cancelLabel}</Button>,
        <Button key="ok" variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={confirmDisabled}>{confirmLabel}</Button>,
      ]}
    >
      {message && <Typography.Paragraph>{message}</Typography.Paragraph>}
      {children}
    </Modal>
  );
}
```

- [x] **Step 3: Remove the duplicate headings in the four callers.** Each one rendered its own `<h2>`/`<h3>` with the `label` text inside the body, which Ant now shows as the title. Move each caller's size class to `width` (in pixels, taken from its old CSS rule).
- [x] **Step 4: Delete the old modal CSS.** `useLayoutModal` stays only if something other than `Modal` uses it (check with `grep -rn useLayoutModal frontend/src`). Otherwise delete it.
- [x] **Step 5: Verify.** Run `npm run build && npm run lint`, and confirm both pass.

### Task 0.8: `Tabs`, `Badge`, `LoadingSpinner`, `EmptyState` on Ant

**Files:**
- Modify: `frontend/src/components/ui/Tabs.tsx`, `Badge.tsx`, `LoadingSpinner.tsx`, `EmptyState.tsx`
- Modify: `frontend/src/index.css` (delete `.tabs`, `.tab`, `.tab-count`, `.badge*`, `.loading-spinner*`, `.empty-state*`)

**Interfaces:**
- Produces: the same props as today for all four.

- [x] **Step 1: `Tabs.tsx`.** Ant `Tabs` with a quiet count:

```tsx
export function Tabs<T extends string>({ items, value, onChange, disabled, 'aria-label': ariaLabel, className }: TabsProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={className}>
      <AntTabs
        activeKey={value}
        onChange={(key) => onChange(key as T)}
        items={items.map((item) => ({
          key: item.id,
          disabled,
          icon: item.icon ? <Icon name={item.icon} /> : undefined,
          label: (
            <Space size={4}>
              {item.label}
              {item.count != null && <Tag bordered={false}>{item.count.toLocaleString()}</Tag>}
            </Space>
          ),
        }))}
      />
    </div>
  );
}
```

- [x] **Step 2: `Badge.tsx`.** Ant `Tag` colours: `neutral` → none, `brand` → `processing`, `success` → `success`, `warning` → `warning`, `error` → `error`, `info` → `processing`, and `count` → `<Tag bordered={false}>`.

- [x] **Step 3: `LoadingSpinner.tsx`**

```tsx
export function LoadingSpinner({ size = 40, message, fullscreen = false, className }: LoadingSpinnerProps) {
  const spinSize = size >= 40 ? 'large' : size <= 20 ? 'small' : 'default';
  if (fullscreen) return <Spin fullscreen size={spinSize} description={message} />;
  return (
    <Flex vertical align="center" gap="small" className={className} role="status">
      <Spin size={spinSize} />
      {message && <Typography.Text type="secondary">{message}</Typography.Text>}
    </Flex>
  );
}
```

- [x] **Step 4: `EmptyState.tsx`**

```tsx
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <Empty
      className={className}
      image={icon ? <Icon name={icon} className="empty-state-icon" /> : Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <Flex vertical gap={4}>
          <Typography.Text strong>{title}</Typography.Text>
          {description && <Typography.Text type="secondary">{description}</Typography.Text>}
        </Flex>
      }
    >
      {action}
    </Empty>
  );
}
```
Keep one rule: `.empty-state-icon { font-size: 40px; color: var(--ds-text-disabled); }`.

- [x] **Step 5: Verify.** Run `npm run build && npm run lint`, and confirm both pass.

### Task 0.9: `ActionMenu`, `SearchBar`, `FilePicker` on Ant

**Files:**
- Modify: `frontend/src/components/ui/ActionMenu.tsx`, `SearchBar.tsx`, `FilePicker.tsx`
- Modify: `frontend/src/index.css` (delete `.action-menu*`, `.search-bar*`, `.file-picker*`)

**Interfaces:**
- Produces: the same props. `SearchBar.inputRef` still receives the real `<input>` element, so callers that call `.focus()` or `.select()` keep working.

- [x] **Step 1: `ActionMenu.tsx`.** An Ant `Dropdown` with `trigger={['click']}`. Build `menu.items` from `items`: `{ key: label, icon: <Icon name={icon} />, label: to ? <Link to={to}>{label}</Link> : label, onClick: onSelect }`, with `{ type: 'divider' }` before any item that has `dividerBefore`. The trigger is `<Button variant={triggerLabel ? 'secondary' : 'icon'} icon={triggerIcon ?? 'ellipsis'} aria-label={label} disabled={disabled}>{triggerLabel}</Button>`.

- [x] **Step 2: `SearchBar.tsx`.** An Ant `Input` with `prefix={<Icon name="magnifying-glass" />}`, `variant={variant === 'plain' ? 'borderless' : 'outlined'}`, `allowClear={trailing === 'clear'}`, `onPressEnter={onSubmit}` and `aria-label={ariaLabel}`. For `trailing === 'cancel'`, pass `suffix={<Button variant="icon" icon="xmark" aria-label="Cancel" onClick={onCancel} />}`. Bridge the ref:

```tsx
const setRef = useCallback((r: InputRef | null) => {
  const el = r?.input ?? null;
  if (typeof inputRef === 'function') inputRef(el);
  else if (inputRef) (inputRef as { current: HTMLInputElement | null }).current = el;
}, [inputRef]);
```

- [x] **Step 3: `FilePicker.tsx`.** An Ant `Upload` with `accept`, `maxCount={1}`, `disabled`, `{...uploadListIcons}` (Task 0.4) and `beforeUpload={(f) => { onChange(f); return false; }}` (it never uploads by itself). Also set `fileList={file ? [{ uid: '1', name: file.name, status: 'done' }] : []}` and `onRemove={() => onChange(null)}`. The child is `<Button icon="upload">{prompt ?? 'Choose file'}</Button>`. Pass `id` to `Upload` so the existing `<label htmlFor>` still works.
- [x] **Step 4: Verify.** Run `npm run build && npm run lint`, and confirm both pass.

### Task 0.10: Close out Phase 0

- [x] Delete any CSS that no longer has a user. For each class in the deleted blocks, check with `grep -rn "<class>" frontend/src --include=*.tsx`.
- [x] Measure the bundle again (Task 0.1, Step 1) and record it under *Changes*.
- [ ] Run `npm run app` to check that the desktop app builds and loads the local frontend.
- [x] Add a `docs/log.md` entry. Add a `docs/reference.md` note on the token bridge and the icon map, and on why both exist until Phase 9. Update PROJECT.md's Stack line: *Frontend: React 19 + Vite 7 + TanStack Query v5 + Ant Design 6 (stock theme) + Tabler icons (`@tabler/icons-react`, stroke 1.5, through `<Icon>`)*. Add a `docs/reference.md` note on `theme/antIcons.tsx`: which built-in icons are set globally, which go through wrappers, and the accepted leftovers.
- [ ] Run the icon check (Task 0.4, Step 6) as part of the user's hand-off.
- [ ] **Hand-off to the user.** Check every screen on desktop and at phone width. Expected: Ant blue, the system font, Ant buttons, dialogs, tabs, toasts and icons, with layouts unchanged. List anything that looks broken under *Changes*.

---

## Phase 1 — App shell

**Scope:** `Layout.tsx`, `NavRail.tsx`, `PageHeader.tsx`, `BottomTabBar.tsx`, `UserAvatar.tsx`, `Avatar.tsx`, `BackgroundJobPill.tsx`, `ImportStatusIndicator.tsx`, `LaunchBanner.tsx`, `Pagination.tsx`, and the shell rules in `index.css`.

**Approach:**
- Ant `Layout` with `Layout.Sider` (a collapsed, icon-first rail on desktop) and `Menu`. The selected key comes from the route, and the admin items sit below a divider. The header becomes `Layout.Header` with the page title (`Typography.Title level={4}`), the `SearchBar` and the page actions.
- Phones keep the bottom tab bar, the Yello mark on the left and the avatar on the right. The tab bar stays a custom element, styled only with tokens, because Ant has no tab-bar component.
- `Avatar` becomes Ant `Avatar`. The colour still comes from a hash of the name, now picked from Ant's preset palette (`presetPalettes`). Selection keeps the ring and check badge, now in `colorPrimary`. Avatar is part of every contact row, so profile a scroll through 8K contacts before and after.
- The job pill becomes `Badge`, `Popover` and `Progress`. The banner becomes `Alert banner`. `Pagination` becomes Ant `Pagination` with `{...paginationIcons}` (Task 0.4). Since it's the app's only pagination, keep it as `components/ui/Pagination.tsx` and add `Pagination` to the lint import ban.

**Exit criteria:** no shell CSS is left in `index.css` except the tab bar and safe-area rules. The rail, header and tab bar match at 375px, 768px, 1024px and 1440px. Build and lint pass, and the user has checked the result.

Phase 1 runs as three independent tasks (added 2026-11-05, when the phase started). They touch separate files and separate CSS blocks, so they can be built in parallel.

### Task 1.1: Layout, side navigation, header, user avatar

**Files:** `Layout.tsx`, `NavRail.tsx`, `PageHeader.tsx`, `UserAvatar.tsx`, `BottomTabBar.tsx`, and their rules in `index.css` (`.app-layout`, `.app-body`, `.main-content`, `.nav-rail*`, `.page-header*`, `.bottom-tab-bar`, `.tab-*`).

**Interfaces:** `PageHeaderConfig` and `OutletContext` (`Layout.tsx`) don't change, so no page needs edits. `UserAvatar` is only used by the shell, so its props may change.

- [x] **Step 1: Layout.** `Layout` becomes Ant `Layout` > `Layout.Header` (the page header) + `Layout` > `Layout.Sider` (desktop only) + `Layout.Content` (the `<Outlet>`). Keep every behaviour in `Layout.tsx` as it is: the scroll-to-top on navigation, the desktop-only route redirect, Escape to Contacts, `layout-modal-change`, desktop message sync, admin marking, and `ImportStatusIndicator`. Check the `position: fixed`/sticky header and any `padding-top` offsets that other pages' CSS relies on (`grep -rn "header-height\|--ds-header" src`); keep their values or move them to a token-based variable.
- [x] **Step 2: Side navigation.** `NavRail` becomes `Layout.Sider collapsed` (icon-first, `collapsedWidth` from Ant's default) with an Ant `Menu mode="inline"`. Items are the same routes and icons (through `<Icon>`). `selectedKeys` comes from the route (`/admin` matches exactly, the others by prefix, as `NavLink` did). Admin items sit below `{ type: 'divider' }`. The user avatar and name stay at the bottom of the rail and open `/profile`. A collapsed `Menu` shows each label as a tooltip.
- [x] **Step 3: Header.** `PageHeader` keeps its props. The title becomes `Typography.Title level={4}` (no margin), breadcrumbs become Ant `Breadcrumb` (items with `to` render `<Link>`, items with `onClick` render a link-style button), the search stays `SearchBar`, and `info`, `actions`, `searchAccessory` and `children` render where they do today. The logo, the phone mark and the phone second search row stay. No literal colours or sizes: tokens or `--ds-*` only.
- [x] **Step 4: `UserAvatar`** becomes an Ant `Avatar` with `src` (with `referrerPolicy="no-referrer"` kept) and the initials as its fallback when there's no photo or it fails to load. It takes a `size` instead of the two class names.
- [x] **Step 5: Bottom tab bar** stays a custom element (Ant has none). Check its CSS uses only `--ds-*` variables and tokens, with 40px+ targets and the safe-area padding kept.
- [x] **Step 6: Delete the shell CSS** that Ant now draws. Only the tab bar and safe-area rules stay.
- [x] **Step 7: Verify.** `npm run build && npm run lint`.

### Task 1.2: `Avatar` on Ant

**Files:** `Avatar.tsx`, and the `.avatar*` rules in `index.css` and `styles/pages/*.css`.

**Interfaces:** the same props (`photoUrl`, `name`, `size`, `className`, `kind`, `selectable`, `isSelected`, `onToggleSelect`). There are about 20 callers, and none change.

- [x] **Step 1:** Render Ant `Avatar` with `size={size}`, `src` for the photo (falling back to the placeholder when it fails, until the URL changes, as now), `icon={<Icon name="building" />}` for companies and `address-card` for generic contacts, and the initials otherwise.
- [x] **Step 2: Colour from the name.** Keep the string hash, but pick from Ant's preset palettes (`presetPalettes` from `@ant-design/colors`, which Ant already depends on; import it from `antd`'s re-export if one exists, otherwise add the package explicitly) instead of a literal `hsl()`. Use shade 6 of a fixed list of hues, so white initials stay readable.
- [x] **Step 3: Selection.** Keep the `role="checkbox"` wrapper, `aria-checked` and the label. The selected ring and the check badge use `colorPrimary` (through the bridged `--ds-color-primary`).
- [x] **Step 4: Scale.** `Avatar` renders in every row of the 10K-contact virtual list. Keep it to one Ant `Avatar` and no extra wrappers when not selectable, and memoise the colour hash (it runs per render). The hand-off asks the user to profile a scroll through the 8K book.
- [x] **Step 5:** Delete the `.avatar*` CSS Ant now draws. Keep only the selection ring and badge rules.
- [x] **Step 6: Verify.** `npm run build && npm run lint`.

### Task 1.3: Job pill, launch banner, pagination

**Files:** `BackgroundJobPill.tsx`, `ImportStatusIndicator.tsx`, `LaunchBanner.tsx`, `Pagination.tsx` (moves to `components/ui/Pagination.tsx`), the 9 files that import `Pagination`, `eslint.config.js`, `styles/pages/background-job-pill.css`, the `.launch-banner*` rules in `styles/pages/launch.css` and `dashboard.css`, and `.pagination*` in `index.css`.

- [x] **Step 1: Job pill.** Keep `BackgroundJobSummary` and the props. Running: a spinning `<Icon>` and Ant `Progress` (`percent`, `size="small"`). Done or failed: the success or error status icon (`statusIcons` from `theme/antIcons`). The pill body stays a button that opens the job's page, and the dismiss X stays. It still never disappears by itself. Use Ant parts (`Card size="small"` or a token-styled container, `Typography`, `Progress`, `Button`) and keep its fixed position clear of the phone tab bar.
- [x] **Step 2: Launch banner** becomes `Alert banner type="info"` with `icon={<Icon name="rocket" />}`, `closable` (its close persists to `localStorage` under the same key), and the message and "Read more →" as an Ant link-style action that opens `/welcome`. The whole bar stays clickable and keyboard-reachable.
- [x] **Step 3: Pagination.** Move it to `components/ui/Pagination.tsx` with the same props, and update its 9 importers. Render Ant `Pagination` with `current={currentPage}`, `total={totalPages}`, `pageSize={1}`, `showSizeChanger={false}`, `disabled={isLoading}` and `{...paginationIcons}`, and keep returning `null` for one page. On phones (`useIsMobile`) use `simple`.
- [x] **Step 4: Lint.** Add `'Pagination'` to the `importNames` of the `antd` entry in the `no-restricted-imports` rule (Task 0.4), and exempt `components/ui/Pagination.tsx`.
- [x] **Step 5:** Delete the old pill, banner and pagination CSS that Ant now draws.
- [x] **Step 6: Verify.** `npm run build && npm run lint`.

---

## Phase 2 — Design documentation with impeccable

Phase 2 runs once Phases 0 and 1 are on screen, so impeccable documents the real Ant system and not an intention. It writes the rules that Phases 3–8 follow.

**Files:** `DESIGN.md`, `.impeccable/design.json`, `.impeccable/surfaces/*`, `PRODUCT.md`, `.impeccable.md` (stale), `frontend/src/components/StyleGuideView.tsx`, `styles/pages/styleguide.css`, `docs/reference.md`

- [ ] **Step 1: Check for drift.** Run `/impeccable doctor` to see what's stale. Expected: `.impeccable.md` still describes `#7C3AED` and Geist, and DESIGN.md describes Signal Violet. Fix only what the user approves.
- [ ] **Step 2: Rewrite DESIGN.md from the code.** Run `/impeccable document`. This is a replacement, not a refinement: the violet system is gone. The new DESIGN.md and `.impeccable/design.json` must cover:
  - **Theme:** stock Ant 6 tokens (`colorPrimary #1677ff`, `fontSize 14`, `controlHeight 32`, radius 4/6/8, the system font), and how to read them (`theme.useToken()` in TSX, the bridged `--ds-*` variables in CSS).
  - **Component choice rules**, as a table of Yello job → Ant component:
    - decision → `Modal`; side panel or phone sheet → `Drawer`; small picker → `Popover`; menu → `Dropdown`
    - quick confirmation → `message`; anything with Undo → `notification`; persistent inline state → `Alert`; outcome page → `Result`; background job → `Progress`
    - forms → `Form` and `Form.Item`; lists of 200 rows or fewer → `Table` or `List`; anything that can reach 10K+ → a TanStack Virtual list with token-styled rows
  - **Yello's signature patterns kept on Ant:** the contact row, avatars and selection, the reach-out bar, the public card.
  - **Density and layout:** content width, page header anatomy, spacing from Ant's `margin*` and `padding*` tokens.
  - **Mobile rules:** 16px fields, 40–44px touch targets, `Drawer placement="bottom"`, the tab bar, no bulk selection.
  - **Dark-mode readiness:** no literal colours; anything custom must render correctly with `theme.darkAlgorithm`.
  - **Do's and don'ts:** for example, no `token` overrides, Tabler icons only at stroke 1.5 through `<Icon>` (with the list of Ant built-ins set globally, the wrappers — `ui/DatePicker`, `ui/PasswordInput`, `ui/Pagination`, `ui/FilePicker` — and the accepted leftovers from Task 0.4, Step 5), no restyling of `.ant-*` classes from page CSS, and no wrapper components that only rename Ant props.
- [ ] **Step 3: Refresh PRODUCT.md.** Run `/impeccable init` and update *Brand Commitments* for the new primary colour, and record the logo decision (see *Open questions*). Product truth, users and principles don't change.
- [ ] **Step 4: Retire `.impeccable.md`.** It's superseded by PRODUCT.md and DESIGN.md. Delete it, or move anything still true into those two.
- [ ] **Step 5: Rebuild the style guide (`/styleguide`, admin only).** It becomes a live page of Yello's own patterns on Ant: contact row, avatar and selection, reach-out bar, page header, empty and loading states, and the mobile sheet. It doesn't repeat Ant's own docs. `StyleGuideView.tsx` is 1,126 lines today, and the target is a fraction of that. Delete `styleguide.css` if nothing needs it.
- [ ] **Step 6: Update the surface briefs.** Refresh `.impeccable/surfaces/` (the landing page and style guide briefs) for stock Ant.
- [ ] **Step 7: Hand-off.** The user reads the new DESIGN.md and approves it before Phase 3 starts.

---

## Phase 3 — Contacts

**Scope (the most-used area, and the scale-critical one):** `ContactsPage`, `ContactList` (virtualised), `ContactRow`, `ContactRowExpanded`, `ContactFilters` (popover on desktop, bottom `Drawer` on phones), `ContactKindToggle`, `ModeSelector` (→ `Segmented`), `ContactGridCard`, `ContactTileGrid`, `ContactCardView`, `ContactDetailPage`, `AddContactPage`, `ContactFormSections` (1,698 lines, moving to `Form` and `Form.Item`; split by section while migrating), `RelatedPersonNameField` (→ `AutoComplete`), `AddToGroupField` (→ `Select mode="tags"`), `ContactPhotoGallery` (→ `Image.PreviewGroup`), `EmailHistorySection`, `MessageActivitySection`, `SocialLinksWithinContact`.

**Watch:** the list must still scroll at 60 fps through the 8K-contact book, with rows built from plain elements. Search must stay under 100 ms. The filter state in the URL (`useSearchParamUpdater`) doesn't change.

**Exit criteria:** no `.contact-*` legacy CSS is left. Desktop and phone flows work: find, open, copy, text, call, WhatsApp, edit, add, add to group. The user has checked the result.

## Phase 4 — Dashboard and relationship views

**Scope:** `DashboardView` (→ `Card` grid, `Statistic`), `BirthdaysView`, `RecentView`, `TopContactsView`, `GroupsView`, `MapView` (Leaflet stays; the controls, cluster popups and side list move to Ant), `ArchivedView` (→ `Table` with row selection on desktop).

**Exit criteria:** `styles/pages/dashboard.css` and `top-contacts.css` are deleted or reduced to Leaflet-only rules. The user has checked the result.

## Phase 5 — Tools: import, sync, export, enrich, Text Blast

**Scope:** `SettingsView` (the Tools page; its collapsible cards become `Collapse` or `Card` sections), `GoogleContactsImportContent`, `LinkedInImportContent`, `ICloudImportView`, `ImportMatchCards`, `LastImportSummary`, `MigrationView`, `CutoverPreviewContent` (→ `Table`), `SyncStatusContent`, `RemoteBackupsContent`, `RemoteVersionsPanel`, `EnrichToolsContent` (890 lines), `MessageSourcesPanel`, `MessageMatchQueue`, `textBlast/*` (Composer, SetupBar, SendLimits, BlastDetail, BlastHistory → `Steps`, `Form`, `Table`, `Progress`), Export, and the Danger Zone (→ `Alert` plus `Modal.confirm`-style double confirm).

**Watch:** background jobs survive navigation, and their progress shows through `Progress`. The Text Blast send loop and IPC don't change; only its UI does.

**Exit criteria:** `enrich.css`, `text-blast.css` and `last-import.css` are deleted. Every import runs end to end on a test book. The user has checked the result.

## Phase 6 — Tools: Cleanup and Merge redesign (design first)

This is the "still needs design work" phase. It is redesigned, not just migrated.

**Scope:** `CleanupView`, `CleanupModeSelector`, `CleanupFilters`, `CleanupContactList`, `CleanupContactCard`, `ConfidenceFilter`, `ThresholdSelector`, `SocialLinksCleanup`, `InvalidLinksCleanup`, `ContactKindCleanup`, `AddressCleanup`, `AddressCleanupCard`, `AddressDuplicates`, `AddressGeocoding`, `AddressNormalize`, `DeduplicationView`, `DuplicateGroupList`, `DuplicateGroup`, `DuplicateContactCard`, `ImportMatchCards` (shared with Phase 5). That's about 4,000 lines.

- [ ] **Shape (can start right after Phase 2).** Run `/impeccable shape` on Tools > Cleanup and on Merge, in Operate mode. It should decide the information architecture for six cleanup categories plus Merge (one hub, or a queue per category), the review flow for thousands of items (bulk versus one by one, keyboard-first, undo), how confidence and thresholds are explained, what a finished category looks like, and what phones get. Save the brief to `docs/plans/<date>-cleanup-merge-redesign.md`. The user approves it before any code.
- [ ] **Fold in the open roadmap item** "name only contacts truly name only" (Name-only cleanup counts only cards with nothing but a name), so the new screen ships with the right counts.
- [ ] **Build** on Ant per the approved brief, then add its task breakdown here.
- [ ] **Watch:** paid APIs. Geocoding must never re-bill coordinates the user already has, and the UI must show the cost before HERE runs.

**Exit criteria:** the approved brief is implemented and the old Cleanup and Merge CSS is deleted. The user has run a real cleanup pass on their own book.

## Phase 7 — Profile, onboarding, admin

**Scope:** `UserProfilePage` (991 lines; the public-card field toggles become `Switch` lists), `OnboardingView` (→ `Steps`), `WelcomeView`, `DemoPromptModal`, `AdminView`, `admin/ServerDataCard` (→ `Descriptions` and `Table`), `DocsView`.

**Exit criteria:** `user-profile.css`, `onboarding.css`, `admin.css`, `docs.css` and `demo-prompt-modal.css` are deleted. The user has checked the result.

## Phase 8 — Public pages

**Scope:** `LandingPage` and `landing/*` (Vignettes, SampleViews, SampleBookFrame, LandingFooter), `PublicContactCard` (`/p/:slug`), `LoginPage`, and `legal/*`. Also the `og-image.png` and the `<meta>` copy in `index.html`.

**Approach:** these are persuade pages (they win visitors), so run `/impeccable shape` on the landing page first. It's built from Ant (`Typography`, `Flex`/`Row`, `Card`, `Button size="large"`) with a deliberate layout, not an admin look. The public card is opened on phones from shared links, so design it phone-first. Keep its Open Graph preview.

**Exit criteria:** `landing.css`, `public-contact-card.css`, `login.css`, `legal.css` and `launch.css` are deleted or reduced. Link previews still work (iMessage, Slack, LinkedIn). The user has checked the result.

## Phase 9 — Remove the old system

- [ ] Delete every `--ds-*` variable with no remaining user (`grep` each one), and trim `TokenBridge` and `design-system.css` to match.
- [ ] Remove the legacy `style` prop from `Icon`. Optionally rename the Font Awesome-era keys in the `IconName` map to Tabler-style names (`envelope` → `mail`); the map stays as the one place icons and their stroke are set.
- [ ] Run the icon check (Task 0.4, Step 6) on every route with its menus, selects and dialogs open. Expected: `[]`.
- [ ] Delete dead CSS until `index.css` holds only the reset, virtual-list rows, the tab bar, safe areas and Leaflet rules.
- [ ] Performance: profile the contacts list (8K book), then compare Ant's default runtime styles with `theme={{ zeroRuntime: true }}` plus `antd/dist/antd.css`. Keep the faster one and record both under *Changes*.
- [ ] Run `/impeccable audit` across the app (accessibility, responsive, performance) and fix what it finds.
- [ ] Measure the final bundle and record it.

## Phase 10 — Dark mode (optional)

- [ ] Add a theme setting (Light, Dark or System) in Profile, stored in `localStorage`, with System following `prefers-color-scheme`. `AntProvider` passes `algorithm: theme.darkAlgorithm` when dark. That's the one allowed theme setting, and it isn't a token override.
- [ ] The token bridge already re-runs when the theme changes, so the custom CSS follows. Check the token-styled rows, the tab bar and Leaflet (switch to a dark tile layer).
- [ ] The public card and landing page follow the visitor's system setting.
- [ ] `/impeccable audit` contrast in dark mode, then add a dark-mode section to DESIGN.md.

---

## Open questions

1. **Logo and brand colour.** Stock Ant makes the UI blue, but the logo, favicon, desktop icon and OG image are Signal Violet. The options are to keep the violet mark beside blue UI, or recolour the assets. Decide in Phase 2, Step 3, and apply in Phase 8.
2. **Body text drops to 14px** (Ant's default; Yello used 16px). This comes with the stock choice. Phones keep 16px fields. Flag it if long reading surfaces (Docs, legal pages) feel small.
3. **The style guide page:** rebuild it as a Yello-patterns page (planned) or delete it and rely on DESIGN.md. Decide in Phase 2, Step 5.

## Risks

| Risk | Mitigation |
|---|---|
| An Ant component shows its own icon next to Tabler ones | `antIconConfig` sets every global icon; wrappers plus the lint ban cover the rest; the DOM icon check runs at every hand-off |
| Mixed look while phases are in flight | The token bridge and primitive swap in Phase 0 make every screen Ant-coloured and Ant-controlled from day one |
| Global CSS fights Ant | Focus rules are scoped in Task 0.2; page CSS is deleted per screen; page CSS never restyles `.ant-*` (DESIGN.md rule) |
| Scroll performance with 10K+ contacts | Rows stay plain elements on TanStack Virtual; profile with the 8K book in Phases 1, 3 and 9 |
| Bundle about +220 KB gzipped | Separate cached `antd` chunk; measured at each phase end; Phase 9 tests zero-runtime CSS |
| Ant is desktop-first | The mobile rules are in the global constraints; Drawer bottom sheets; 16px field guard from Phase 0 |
| Accessibility regressions in custom ARIA (tabs, menus) | Ant supplies roles and keyboard support; the Tabs wrapper keeps the accessible name; `/impeccable audit` in Phase 9 |

---

## Changes

- **2026-11-05:** plan created. The decisions are in the table at the top. Bundle baseline: 295 KB gzipped main and a 58 KB lazy chunk (test bundle measured Ant at +177 KB core, +218 KB with form widgets).
- **2026-11-05 (revision):** icons switched from `@ant-design/icons` to **`@tabler/icons-react` at stroke 1.5** (user request). Task 0.3 was rewritten for Tabler, keeping the same `<Icon name>` API. A new **Task 0.4** replaces Ant's built-in icons: about 20 components set once on `ConfigProvider` (`antIconConfig`); pagination, date and time picker arrows, the password toggle, upload list and toast status icons set on each use through wrappers; lint bans direct imports; and a DOM check runs at every hand-off. The later tasks moved up by one (0.5–0.10). Tabler adds about 9 KB gzipped for 103 icons.
- **2026-11-05 (Phases 0 and 1 built):** run as parallel workers in separate git worktrees, merged by a coordinator into the `ant-design-migration` branch, each task reviewed (most after one fix round), then a whole-branch review and one fix wave.
  - **Bundle (gzip -9):** baseline index 295 KB + lazy 58 KB. After Phase 0: `antd` 229 + index 248 + lazy 58 (+182 KB). After Phase 1: `antd` 271 + index 250 + lazy 58, CSS 37 (+226 KB, a little over the +218 KB estimate because Layout, Menu and Breadcrumb came in). `index.css` went from 7,936 to 6,774 lines.
  - **Lint baseline:** lint already failed before the migration (10 problems, 8 errors, in CleanupFilters, ContactFilters, ContactList, Layout, MapView and CleanupView). The gate was "no new problems", and it held.
  - **Phase 1 tasks** were added when the phase started (Tasks 1.1–1.3 above).
  - **Deviations from the task code:** `motionEaseIn` doesn't exist in Ant 6, so the bridge maps `--ds-easing-in` to `motionEaseInQuint`. `ConfirmDialog` is `role="dialog"`, not `alertdialog` (rc-dialog hard-codes the role). `Modal` uses Ant's Escape (`keyboard={dismissable}`), defers its "closed" signal to Layout by a tick, and returns focus to the trigger on unmount. `LoadingSpinner` keeps block padding (opt out with `compact`), and `fullscreen` is a full-viewport block instead of Ant's translucent overlay. Avatar initials render through Ant's `icon` branch with `fontSize = size × 0.4`, avoiding a ResizeObserver per list row. Its hues are eight `presetPalettes` colours at ≥4.5:1 with white. The rail is Ant's 80px (was 72px), and the shell publishes `--ds-header-height`, `--ds-nav-rail-width` and `--ds-tab-bar-height` from tokens (`theme/shellMetrics.ts`). `Button` also takes `href`/`download`, and `ActionMenu` takes `triggerVariant`.
  - **Before Phase 3:** have `Layout` skip its Escape → /contacts while any Ant popup (Select, DatePicker, Dropdown) is open, and fold ActionMenu's capture-phase Escape handler into that rule.
  - **Hand-off checks (pending, the user's):** every screen on desktop and at phone width (375, 768, 1024, 1440); the icon check (Task 0.4, Step 6); a scroll profile through the 8K book (each row now mounts an Ant Avatar, Dropdown and Button; if it isn't a steady 60 fps, mount the row menu's Dropdown lazily); `npm run app` for the desktop app.


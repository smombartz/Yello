# Visual Redesign v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the app to match the Figma (node 178:786) — a centered, open layout with a full-width header bar, floating icon navigation on the left edge, fixed-width centered content, and symmetrical spacing.

**Architecture:** The page is organized as a full-width header spanning the top, then a 3-column body: [Nav icons] [960px content] [spacer]. The nav is a transparent column of floating icons vertically centered. The header is a consistent 64px bar with 3 zones: logo (left flex), center fixed-width (title + search + info), and right flex (action button). Content sits in a fixed 960px column centered between nav and spacer.

**Tech Stack:** React 19, CSS custom properties (design-system.css), React Router NavLink, existing Material Symbols icons. No Tailwind.

---

## Figma Design Analysis (node 178:786)

### Overall Layout (1280x800)
```
┌─────────────────────────────────────────────────────┐
│ Header (full width, 64px)                           │
│ [logo]     [Title  Search(400px)  Info]   [Button]  │
│  ← flex →  ←────── 960px ──────────→    ← flex →   │
├─────────────────────────────────────────────────────┤
│ Container (full width, flex)                        │
│                                                     │
│ Nav(~52px)  Main(960px)              Spacer(~152px) │
│             gap: 8px between cols                   │
│  🏠                                                 │
│  📒 ← active (purple bg pill)                      │
│  🗺️         [ Contact Card Row ]                    │
│  👥         [ Contact Card Row ]                    │
│  🧰         [ Contact Card Row ]                    │
│  👤         [ Contact Card Row ]                    │
│             [ Contact Card Row ]                    │
│                                                     │
│             [Paging: "Showing 1..." | 1 2 3 ... 8] │
└─────────────────────────────────────────────────────┘
```

### Key Measurements from Figma
- **Header height:** 64px
- **Header padding:** 16px horizontal
- **Center column width:** 960px (fixed)
- **Nav icon size:** 36x36px in a 52px container (8px padding each side)
- **Nav gap:** 4px between items
- **Nav vertical position:** centered vertically in viewport (pt-260px in 736px container)
- **Content gap:** 8px between nav and main
- **Active nav item:** `rgba(95, 39, 227, 0.1)` background, rounded 8px
- **Search field:** 400px wide, #f9fafb background, #d1d5db border, 8px padding, 8px radius
- **Page title:** Inter Bold, 20px, #1a202c
- **Info text:** Inter Regular, 14px, #6b7280, right-aligned
- **Action button:** #5f27e3 background, white text, Inter Bold 14px, 12px/8px padding, 8px radius
- **Contact card:** white bg, #e5e7eb border, 8px radius, 74px height, 13px padding
- **Page background:** white

### What Changed vs V1 Plan

| Aspect | V1 Plan | V2 (Figma) |
|--------|---------|-------------|
| **Nav** | 64px rail with border-right, expands to 200px on hover | ~52px transparent floating icons, no border, no expand |
| **Nav position** | Full-height sticky left column | Vertically centered in content area |
| **Nav items** | 8 items + settings + avatar with divider | 6 icons only: home, contacts, map, groups, tools, user |
| **Header** | Per-page, sticky within main-content | Full-width across top, above everything |
| **Header structure** | [icon title] [search] [info \| actions] | 3 flex columns: [logo] [title+search+info at 960px] [actions] |
| **Logo** | In NavRail top | In Header left column |
| **Layout** | Sidebar + fluid content | 3-column centered: nav + 960px fixed + spacer |
| **Content width** | Fluid (fills remaining space) | Fixed 960px |
| **Background** | main-content: #f9fafb (secondary) | white throughout |

---

## Phase 1 Overview

| Task | What | Files |
|------|------|-------|
| 1 | Design tokens for new layout | `design-system.css` |
| 2 | PageHeader component | `PageHeader.tsx` (new) |
| 3 | NavRail component (floating icons) | `NavRail.tsx` (new) |
| 4 | Layout shell — 3-column centered | `Layout.tsx` |
| 5 | CSS for Layout, NavRail, PageHeader | `index.css` |
| 6 | Wire into ContactsPage | `ContactsPage.tsx` |
| 7 | Wire into DashboardView | `DashboardView.tsx` |
| 8 | Wire into DeduplicationView | `DeduplicationView.tsx` |
| 9 | Wire into CleanupView | `CleanupView.tsx` |
| 10 | Wire into ArchivedView | `ArchivedView.tsx` |
| 11 | Wire into GroupsView | `GroupsView.tsx` |
| 12 | Wire into MapView | `MapView.tsx` |
| 13 | Wire into SettingsView | `SettingsView.tsx` |
| 14 | Wire into EnrichView | `EnrichView.tsx` |
| 15 | Wire into AddContact, ContactDetail, UserProfile | Various |
| 16 | Clean up old Sidebar CSS & dead code | `index.css`, `Sidebar.tsx` |
| 17 | Visual QA & polish | Various |

---

### Task 1: Add Design Tokens for New Layout

**Files:**
- Modify: `frontend/src/styles/design-system.css`

**Step 1: Add new layout tokens to design-system.css**

Add these tokens at the end of the `:root` block:

```css
/* Layout - Centered Content */
--ds-content-width: 960px;
--ds-layout-gap: 8px;

/* Layout - Navigation */
--ds-nav-icon-size: 36px;
--ds-nav-item-padding: 8px;
--ds-nav-gap: 4px;

/* Layout - Page Header */
--ds-header-height: 64px;
--ds-header-padding: 16px;
--ds-header-logo-size: 24px;
--ds-header-title-size: 20px;
--ds-header-search-width: 400px;
```

**Step 2: Commit**

```bash
git add frontend/src/styles/design-system.css
git commit -m "feat: add design tokens for centered layout redesign"
```

---

### Task 2: Create PageHeader Component

**Files:**
- Create: `frontend/src/components/PageHeader.tsx`

**Step 1: Create the reusable PageHeader component**

The Header spans the full page width with 3 flex columns:
- Left (flex: 1): Logo
- Center (fixed 960px): Title + Search + Info in a row
- Right (flex: 1): Action buttons, right-aligned

```tsx
import { type ReactNode } from 'react';
import logoSvg from '../assets/logo.svg';

interface PageHeaderProps {
  /** Page title — bold 20px text */
  title: string;
  /** Search input value — omit to hide search */
  search?: string;
  /** Search input change handler */
  onSearchChange?: (value: string) => void;
  /** Search placeholder text */
  searchPlaceholder?: string;
  /** Info text displayed right-aligned in center column (e.g. "8,065 contacts") */
  info?: ReactNode;
  /** Action buttons on the far right (e.g. "Add Contact" button) */
  actions?: ReactNode;
  /** Additional content below the main header row (e.g. filters, mode selectors) */
  children?: ReactNode;
}

export function PageHeader({
  title,
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  info,
  actions,
  children,
}: PageHeaderProps) {
  const showSearch = onSearchChange !== undefined;

  return (
    <header className="page-header">
      <div className="page-header-row">
        {/* Left column: logo */}
        <div className="page-header-col-left">
          <img src={logoSvg} alt="Yello" className="page-header-logo" />
        </div>

        {/* Center column: title + search + info */}
        <div className="page-header-col-center">
          <div className="page-header-center-row">
            <h1 className="page-header-title">{title}</h1>

            {showSearch && (
              <div className="page-header-search">
                <span className="material-symbols-outlined page-header-search-icon">search</span>
                <input
                  type="text"
                  value={search ?? ''}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="page-header-search-input"
                />
                {search && (
                  <button
                    type="button"
                    className="page-header-search-clear"
                    onClick={() => onSearchChange('')}
                    aria-label="Clear search"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                )}
              </div>
            )}

            {info && <div className="page-header-info">{info}</div>}
          </div>

          {children && (
            <div className="page-header-sub">{children}</div>
          )}
        </div>

        {/* Right column: actions */}
        <div className="page-header-col-right">
          {actions && <div className="page-header-actions">{actions}</div>}
        </div>
      </div>
    </header>
  );
}
```

**Design decisions matching Figma:**
- Logo lives in the header (left column), not in the nav
- Center column is fixed at 960px via CSS (matches `--ds-content-width`)
- Left and right columns are `flex: 1` to center the content
- Title, search, and info sit in a single row with `gap: 24px`
- Info text is right-aligned (flex: 1 pushes it right)
- Actions in right column are end-aligned
- `children` slot below the center row for sub-controls (filters, mode selectors)

**Step 2: Commit**

```bash
git add frontend/src/components/PageHeader.tsx
git commit -m "feat: create PageHeader component matching Figma centered layout"
```

---

### Task 3: Create NavRail Component (Floating Icons)

**Files:**
- Create: `frontend/src/components/NavRail.tsx`

**Step 1: Create the floating nav icons component**

The nav is a simple vertical stack of icon buttons, floating transparently. Per the Figma, there are 6 items: home, contacts (address-book), map, groups (users), tools, and user profile.

```tsx
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface NavRailItemProps {
  to: string;
  icon: string;
  label: string;
}

function NavRailItem({ to, icon, label }: NavRailItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-rail-item ${isActive ? 'active' : ''}`}
      title={label}
    >
      <span className="material-symbols-outlined">{icon}</span>
    </NavLink>
  );
}

export function NavRail() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const displayName = user?.name || 'User';
  const primaryImage = user?.profileImages?.find(img => img.isPrimary);
  const avatarUrl = primaryImage?.url || user?.avatarUrl;
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <nav className="nav-rail">
      <NavRailItem to="/dashboard" icon="home" label="Dashboard" />
      <NavRailItem to="/contacts" icon="contacts" label="Contacts" />
      <NavRailItem to="/map" icon="map" label="Map" />
      <NavRailItem to="/groups" icon="group" label="Groups" />
      <NavRailItem to="/settings" icon="build_circle" label="Tools" />

      <button
        type="button"
        className="nav-rail-item nav-rail-avatar-btn"
        title={displayName}
        onClick={() => navigate('/profile')}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="nav-rail-avatar-img"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="nav-rail-avatar-initials">{initials}</div>
        )}
      </button>
    </nav>
  );
}
```

**Design decisions matching Figma:**
- Only icons, no labels (labels via `title` attribute for tooltip on hover)
- 6 items matching the Figma exactly: house, address-book, map, users-line, tools, circle-user
- No divider, no expand-on-hover, no border, no background on the nav container
- Active state: purple background pill (CSS handles this)
- User avatar as last item (circle-user icon or actual avatar image)
- Minimal code — no menus, no submenus, no collapse logic

**Step 2: Commit**

```bash
git add frontend/src/components/NavRail.tsx
git commit -m "feat: create NavRail with floating icon navigation"
```

---

### Task 4: Update Layout Shell — 3-Column Centered

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

**Step 1: Replace Layout with centered 3-column design**

The new layout structure:
```
<div class="app-layout">
  <PageHeader /> ← full width, from page via Outlet
  <div class="app-body">
    <NavRail />            ← left floating icons
    <main class="main-content"> ← fixed 960px
      <Outlet />
    </main>
    <div class="app-body-spacer" /> ← right symmetry spacer
  </div>
</div>
```

But since PageHeader is rendered BY each page (inside Outlet), the Layout just handles the body structure:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NavRail } from './NavRail';
import { BottomTabBar } from './BottomTabBar';
import { useIsMobile } from '../hooks/useIsMobile';

const DESKTOP_ONLY_ROUTES = ['/merge', '/cleanup', '/archived'];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (isMobile && DESKTOP_ONLY_ROUTES.includes(location.pathname)) {
      navigate('/contacts', { replace: true });
    }
  }, [isMobile, location.pathname, navigate]);

  useEffect(() => {
    const handleModalChange = (e: CustomEvent<{ open: boolean }>) => {
      setModalOpen(e.detail.open);
    };
    window.addEventListener('layout-modal-change', handleModalChange as EventListener);
    return () => window.removeEventListener('layout-modal-change', handleModalChange as EventListener);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modalOpen && location.pathname !== '/contacts') {
        navigate('/contacts');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, location.pathname, navigate]);

  const handleSetModalOpen = useCallback((open: boolean) => {
    setModalOpen(open);
  }, []);

  return (
    <div className="app-layout">
      <Outlet context={{ setModalOpen: handleSetModalOpen, isMobile }} />
      {isMobile && <BottomTabBar />}
    </div>
  );
}
```

**Wait — architecture decision:** Looking at the Figma more carefully, the Header is ABOVE the 3-column body. The Header contains the logo and spans full width. The body below is [Nav | Content | Spacer].

This means **Layout** should render the overall structure, but PageHeader needs to sit above the body. Since each page provides its own header props (title, search, actions), we need Layout to render a wrapper and let the page provide header content.

**Better approach — PageHeader in Layout, configured by pages:**

Actually, looking again at the Figma: the Header is a consistent component that changes its center content per page. The logo and structure stay the same. So Layout should render PageHeader, and pages should configure it via outlet context or a context provider.

Let me revise. We'll use a **PageHeaderContext** so pages can set their header props:

```tsx
import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NavRail } from './NavRail';
import { PageHeader } from './PageHeader';
import { BottomTabBar } from './BottomTabBar';
import { useIsMobile } from '../hooks/useIsMobile';
import type { ReactNode } from 'react';

interface PageHeaderConfig {
  title: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  info?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

interface LayoutContextValue {
  setModalOpen: (open: boolean) => void;
  setHeaderConfig: (config: PageHeaderConfig) => void;
  isMobile: boolean;
}

export const LayoutContext = createContext<LayoutContextValue>({
  setModalOpen: () => {},
  setHeaderConfig: () => {},
  isMobile: false,
});

export function useLayoutContext() {
  return useContext(LayoutContext);
}

const DESKTOP_ONLY_ROUTES = ['/merge', '/cleanup', '/archived'];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [modalOpen, setModalOpen] = useState(false);
  const [headerConfig, setHeaderConfig] = useState<PageHeaderConfig>({ title: '' });

  useEffect(() => {
    if (isMobile && DESKTOP_ONLY_ROUTES.includes(location.pathname)) {
      navigate('/contacts', { replace: true });
    }
  }, [isMobile, location.pathname, navigate]);

  useEffect(() => {
    const handleModalChange = (e: CustomEvent<{ open: boolean }>) => {
      setModalOpen(e.detail.open);
    };
    window.addEventListener('layout-modal-change', handleModalChange as EventListener);
    return () => window.removeEventListener('layout-modal-change', handleModalChange as EventListener);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modalOpen && location.pathname !== '/contacts') {
        navigate('/contacts');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, location.pathname, navigate]);

  const handleSetModalOpen = useCallback((open: boolean) => {
    setModalOpen(open);
  }, []);

  const contextValue: LayoutContextValue = {
    setModalOpen: handleSetModalOpen,
    setHeaderConfig,
    isMobile,
  };

  return (
    <LayoutContext.Provider value={contextValue}>
      <div className="app-layout">
        <PageHeader {...headerConfig} />
        <div className="app-body">
          {!isMobile && <NavRail />}
          <main className="main-content">
            <Outlet context={{ setModalOpen: handleSetModalOpen, isMobile }} />
          </main>
          {!isMobile && <div className="app-body-spacer" />}
        </div>
        {isMobile && <BottomTabBar />}
      </div>
    </LayoutContext.Provider>
  );
}
```

**Key changes from v1:**
- Header is rendered BY Layout, not by each page
- Pages call `setHeaderConfig()` to configure their header
- 3-column body: NavRail + main-content (960px) + spacer
- NavRail is inside the body, not a sidebar alongside the whole page
- No view-specific layout classes needed

**Step 2: Create a `usePageHeader` hook for pages to easily configure the header**

```tsx
// Add to Layout.tsx or a separate hooks file:
import { useEffect } from 'react';
import { useLayoutContext } from './Layout';

export function usePageHeader(config: PageHeaderConfig) {
  const { setHeaderConfig } = useLayoutContext();
  useEffect(() => {
    setHeaderConfig(config);
  });
}
```

Actually, this creates a re-render loop issue. Better to keep it simple: **pages render PageHeader themselves as the first child of their component**, and Layout just renders the body wrapper. The header will naturally appear at the top because it's the first thing in the Outlet.

**Revised simpler approach:**

```tsx
export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [modalOpen, setModalOpen] = useState(false);

  // ... same effects as before ...

  const handleSetModalOpen = useCallback((open: boolean) => {
    setModalOpen(open);
  }, []);

  return (
    <div className="app-layout">
      <div className="app-body">
        {!isMobile && <NavRail />}
        <div className="app-body-center">
          <Outlet context={{ setModalOpen: handleSetModalOpen, isMobile }} />
        </div>
        {!isMobile && <div className="app-body-spacer" />}
      </div>
      {isMobile && <BottomTabBar />}
    </div>
  );
}
```

And each page renders `<PageHeader>` as its first child. The header sits inside `app-body-center` which is the fixed 960px column, and the CSS makes the header visually span full-width via negative margins + full-width positioning.

**Wait — this conflicts with the Figma.** In the Figma, the header SPANS the full 1280px width with the logo in the far-left. The nav, content, and spacer are BELOW the header. The header is not inside the 960px column.

So the cleanest approach: **Layout renders PageHeader above the body, and pages configure it.** But to avoid context complexity, let's just have **Layout render a fixed header structure** and let pages pass their content via Outlet context.

**Final architecture (simplest, matching Figma exactly):**

Each page returns a fragment: `<PageHeader .../> <div className="page-content">...</div>`. The Layout wraps everything in the right structure. The header uses CSS to break out of the center column and span full width.

Actually the simplest: the `app-body-center` is the 960px column for main content, and `PageHeader` is rendered ABOVE `app-body` by the Layout. Pages configure it via a `usePageHeader` hook that calls `setHeaderConfig`. Let me go with this.

**Step 3: Commit**

```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat: update Layout to 3-column centered design with PageHeader"
```

---

### Task 5: Add CSS for Layout, NavRail, and PageHeader

**Files:**
- Modify: `frontend/src/index.css`

**Step 1: Replace old sidebar/layout CSS with new centered layout CSS**

Remove all `.sidebar*`, `.nav-item*`, `.nav-spacer`, view-specific `.xxx-layout .main-content` rules.

Add:

```css
/* ===== App Layout — Centered 3-Column ===== */

.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: white;
}

.app-body {
  display: flex;
  flex: 1;
  gap: var(--ds-layout-gap);
}

.app-body-center {
  width: var(--ds-content-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 0;
}

.app-body-spacer {
  flex: 1;
  min-width: 0;
}

/* ===== Page Header ===== */

.page-header {
  height: var(--ds-header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--ds-header-padding);
  flex-shrink: 0;
}

.page-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
}

.page-header-col-left {
  flex: 1;
  display: flex;
  align-items: center;
  height: 100%;
}

.page-header-logo {
  height: var(--ds-header-logo-size);
  width: auto;
}

.page-header-col-center {
  width: var(--ds-content-width);
  flex-shrink: 0;
}

.page-header-center-row {
  display: flex;
  align-items: center;
  gap: 24px;
  width: 100%;
}

.page-header-title {
  font-size: var(--ds-header-title-size);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0;
  white-space: nowrap;
  line-height: 20px;
}

.page-header-search {
  width: var(--ds-header-search-width);
  flex-shrink: 0;
  position: relative;
  display: flex;
  align-items: center;
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-dark);
  border-radius: 8px;
  padding: 8px;
}

.page-header-search-icon {
  font-size: 16px;
  color: var(--ds-text-muted);
  flex-shrink: 0;
}

.page-header-search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: var(--ds-font-sm);
  color: var(--ds-text-primary);
  outline: none;
  padding: 0 8px;
}

.page-header-search-input::placeholder {
  color: var(--ds-text-muted);
}

.page-header-search-clear {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: var(--ds-text-muted);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.page-header-search-clear:hover {
  color: var(--ds-text-primary);
}

.page-header-search-clear .material-symbols-outlined {
  font-size: 16px;
}

.page-header-info {
  flex: 1;
  font-size: var(--ds-font-sm);
  color: var(--ds-text-secondary);
  text-align: right;
  white-space: nowrap;
  line-height: 20px;
}

.page-header-col-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.page-header-actions {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
}

.page-header-sub {
  padding: var(--ds-space-2) 0;
}

/* ===== Navigation Rail (Floating Icons) ===== */

.nav-rail {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ds-nav-gap);
  padding: 0 16px;
  min-width: 0;
}

.nav-rail-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--ds-nav-icon-size) + var(--ds-nav-item-padding) * 2);
  height: calc(var(--ds-nav-icon-size) + var(--ds-nav-item-padding) * 2);
  border-radius: 8px;
  color: var(--ds-text-muted);
  text-decoration: none;
  cursor: pointer;
  background: none;
  border: none;
  padding: var(--ds-nav-item-padding);
  transition: background-color 0.15s, color 0.15s;
}

.nav-rail-item .material-symbols-outlined {
  font-size: var(--ds-nav-icon-size);
}

.nav-rail-item:hover {
  background-color: var(--ds-bg-hover);
  color: var(--ds-text-secondary);
}

.nav-rail-item.active,
a.nav-rail-item.active {
  background-color: rgba(95, 39, 227, 0.1);
  color: var(--ds-color-primary);
}

.nav-rail-item:focus-visible {
  outline: 2px solid var(--ds-color-primary);
  outline-offset: -2px;
}

/* Nav Rail Avatar */

.nav-rail-avatar-btn {
  overflow: hidden;
}

.nav-rail-avatar-img {
  width: var(--ds-nav-icon-size);
  height: var(--ds-nav-icon-size);
  border-radius: 50%;
  object-fit: cover;
}

.nav-rail-avatar-initials {
  width: var(--ds-nav-icon-size);
  height: var(--ds-nav-icon-size);
  border-radius: 50%;
  background: var(--ds-bg-tertiary);
  color: var(--ds-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

/* ===== Header Action Button (shared) ===== */

.header-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: var(--ds-font-sm);
  font-weight: 700;
  cursor: pointer;
  border: none;
  background: var(--ds-color-primary);
  color: white;
  white-space: nowrap;
  transition: background-color 0.15s;
}

.header-action-btn:hover {
  background: var(--ds-color-primary-hover);
}

.header-action-btn.secondary {
  background: var(--ds-bg-primary);
  color: var(--ds-text-primary);
  border: 1px solid var(--ds-border-color);
}

.header-action-btn.secondary:hover {
  background: var(--ds-bg-secondary);
  border-color: var(--ds-border-dark);
}

.header-action-btn.danger {
  background: transparent;
  color: var(--ds-color-error);
  border: 1px solid var(--ds-color-error);
}

.header-action-btn.danger:hover {
  background: rgba(220, 38, 38, 0.08);
}

.header-action-btn .material-symbols-outlined {
  font-size: 16px;
}
```

**Step 2: Remove old sidebar CSS**

Delete these CSS blocks from `index.css`:
- `.sidebar` and all `.sidebar-*` rules (~lines 109-235)
- `.nav-item` and related rules (~lines 150-188)
- `.nav-spacer`
- `.contacts-page-header`, `.contacts-title`, `.contact-count`
- `.dashboard-header`
- `.dedup-header`, `.dedup-header-top`
- `.cleanup-header`, `.cleanup-header-top`
- `.archived-header`, `.archived-header-top`
- `.groups-header`
- `.top-header`, old `.page-header`
- View-specific `.xxx-layout .main-content` overrides (~lines 676, 1694, 2761, 3706)

**Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add centered layout, floating nav, and page header CSS"
```

---

### Task 6: Wire PageHeader into ContactsPage

**Files:**
- Modify: `frontend/src/components/ContactsPage.tsx`

**Step 1: Replace the inline header with PageHeader**

```tsx
import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { ContactList } from './ContactList';
import { PageHeader } from './PageHeader';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

export function ContactsPage() {
  const { isMobile } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [totalContacts, setTotalContacts] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    return (localStorage.getItem('contactViewMode') as 'list' | 'grid') || 'list';
  });

  const handleViewChange = (view: 'list' | 'grid') => {
    setViewMode(view);
    localStorage.setItem('contactViewMode', view);
  };

  return (
    <>
      <PageHeader
        title="Contacts"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search contacts..."
        info={
          <span>{totalContacts.toLocaleString()} contacts</span>
        }
        actions={
          <button
            className="header-action-btn"
            onClick={() => navigate('/contacts/new')}
          >
            <span className="material-symbols-outlined">add_circle</span>
            Add Contact
          </button>
        }
      />
      <ContactList
        search={search}
        viewMode={viewMode}
        onTotalChange={setTotalContacts}
      />
    </>
  );
}
```

**Key changes from v1:**
- Title is "Contacts" (not "All Contacts") matching Figma
- No icon before title (Figma has no icon)
- Action is "Add Contact" purple button (matching Figma exactly: plus-circle icon + bold text)
- Info shows "8,065 contacts" format (matching Figma)
- Removed MobileHeader, mobileSearchOpen state, ViewToggle (v1 had these)

**Step 2: Commit**

```bash
git add frontend/src/components/ContactsPage.tsx
git commit -m "feat: use PageHeader in ContactsPage matching Figma design"
```

---

### Task 7: Wire PageHeader into DashboardView

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx`

**Step 1: Replace dashboard header with PageHeader**

```tsx
<PageHeader title="Dashboard" />
```

Remove `MobileHeader` import and all conditional mobile/desktop header blocks.

**Step 2: Commit**

```bash
git add frontend/src/components/DashboardView.tsx
git commit -m "feat: use PageHeader in DashboardView"
```

---

### Task 8: Wire PageHeader into DeduplicationView

**Files:**
- Modify: `frontend/src/components/DeduplicationView.tsx`

**Step 1: Replace dedup header with PageHeader**

```tsx
<PageHeader
  title="Resolve Duplicates"
  info={
    <span>
      {visibleCount} of {totalGroups} duplicate groups
    </span>
  }
  actions={
    visibleCount > 0 ? (
      <button className="header-action-btn" onClick={() => setShowMergeAllGlobalConfirm(true)}>
        Merge All ({totalGroups})
      </button>
    ) : undefined
  }
>
  {/* Sub-row: mode selector + confidence filter */}
  <div className="dedup-controls">
    <ModeSelector ... />
    {selectedMode === 'recommended' && <ConfidenceFilter ... />}
  </div>
</PageHeader>
```

Move secondary actions (Archive, Delete, Merge Page) below the header into the content area.

**Step 2: Remove old `.dedup-header` CSS**

**Step 3: Commit**

```bash
git add frontend/src/components/DeduplicationView.tsx frontend/src/index.css
git commit -m "feat: use PageHeader in DeduplicationView"
```

---

### Task 9: Wire PageHeader into CleanupView

**Files:**
- Modify: `frontend/src/components/CleanupView.tsx`

**Step 1: Replace cleanup header with PageHeader**

```tsx
<PageHeader
  title="Cleanup"
  info={total !== undefined ? <span>{total} contacts found</span> : undefined}
>
  <CleanupModeSelector ... />
</PageHeader>
```

**Step 2: Remove old `.cleanup-header` CSS**

**Step 3: Commit**

```bash
git add frontend/src/components/CleanupView.tsx frontend/src/index.css
git commit -m "feat: use PageHeader in CleanupView"
```

---

### Task 10: Wire PageHeader into ArchivedView

**Files:**
- Modify: `frontend/src/components/ArchivedView.tsx`

**Step 1: Replace archived header with PageHeader**

```tsx
<PageHeader
  title="Archived"
  info={<span>{totalArchived} contacts</span>}
  actions={
    <button className="header-action-btn secondary" onClick={handleExport}>
      Export VCF
    </button>
  }
/>
```

**Step 2: Remove old `.archived-header` CSS**

**Step 3: Commit**

```bash
git add frontend/src/components/ArchivedView.tsx frontend/src/index.css
git commit -m "feat: use PageHeader in ArchivedView"
```

---

### Task 11: Wire PageHeader into GroupsView

**Files:**
- Modify: `frontend/src/components/GroupsView.tsx`

**Step 1: Replace groups header with PageHeader**

Groups list:
```tsx
<PageHeader
  title="Groups"
  info={data?.groups ? <span>{data.groups.length} groups</span> : undefined}
/>
```

Category detail:
```tsx
<PageHeader
  title={selectedCategory}
  actions={
    <button className="header-action-btn secondary" onClick={handleBackToGroups}>
      Back to Groups
    </button>
  }
/>
```

**Step 2: Remove old `.groups-header` CSS**

**Step 3: Commit**

```bash
git add frontend/src/components/GroupsView.tsx frontend/src/index.css
git commit -m "feat: use PageHeader in GroupsView"
```

---

### Task 12: Wire PageHeader into MapView

**Files:**
- Modify: `frontend/src/components/MapView.tsx`

**Step 1: Replace map header with PageHeader**

```tsx
<PageHeader
  title="Map"
  search={searchQuery}
  onSearchChange={setSearchQuery}
  searchPlaceholder="Search contacts..."
  info={<span>{geocodedCount} of {totalContacts} on map</span>}
  actions={
    pendingCount > 0 ? (
      <button className="header-action-btn" onClick={handleGeocode}>
        Geocode {pendingCount}
      </button>
    ) : undefined
  }
/>
```

**Step 2: Commit**

```bash
git add frontend/src/components/MapView.tsx
git commit -m "feat: use PageHeader in MapView"
```

---

### Task 13: Wire PageHeader into SettingsView

**Files:**
- Modify: `frontend/src/components/SettingsView.tsx`

**Step 1: Replace settings header with PageHeader**

```tsx
<PageHeader title="Settings" />
```

**Step 2: Commit**

```bash
git add frontend/src/components/SettingsView.tsx
git commit -m "feat: use PageHeader in SettingsView"
```

---

### Task 14: Wire PageHeader into EnrichView

**Files:**
- Modify: `frontend/src/components/EnrichView.tsx`

**Step 1: Replace enrich header with PageHeader**

```tsx
<PageHeader
  title="Enrich"
  info={readyCount > 0 ? <span>{readyCount} ready</span> : undefined}
/>
```

**Step 2: Commit**

```bash
git add frontend/src/components/EnrichView.tsx
git commit -m "feat: use PageHeader in EnrichView"
```

---

### Task 15: Wire PageHeader into Detail/Form Pages

**Files:**
- Modify: `frontend/src/components/AddContactPage.tsx`
- Modify: `frontend/src/components/ContactDetailPage.tsx`
- Modify: `frontend/src/components/UserProfilePage.tsx`

**Step 1: AddContactPage**

```tsx
<PageHeader
  title="New Contact"
  actions={
    <>
      <button className="header-action-btn secondary" onClick={() => navigate(-1)}>Cancel</button>
      <button className="header-action-btn" onClick={handleSave}>Save Contact</button>
    </>
  }
/>
```

**Step 2: ContactDetailPage**

```tsx
<PageHeader
  title={contact.displayName}
  actions={
    <button className="header-action-btn secondary" onClick={() => navigate(-1)}>Back</button>
  }
/>
```

**Step 3: UserProfilePage**

```tsx
<PageHeader title="Profile" />
```

**Step 4: Remove old `.top-header` and `.page-header` CSS blocks from index.css**

**Step 5: Commit**

```bash
git add frontend/src/components/AddContactPage.tsx frontend/src/components/ContactDetailPage.tsx frontend/src/components/UserProfilePage.tsx frontend/src/index.css
git commit -m "feat: use PageHeader in AddContact, ContactDetail, and UserProfile"
```

---

### Task 16: Clean Up Old Code

**Files:**
- Modify: `frontend/src/index.css` — remove all orphaned CSS
- Delete: `frontend/src/components/Sidebar.tsx` (replaced by NavRail)
- Delete: `frontend/src/components/TopHeader.tsx` (replaced by PageHeader)
- Keep: `frontend/src/components/MobileHeader.tsx` — evaluate if still used by BottomTabBar

**Step 1: Search for and remove orphaned CSS**

Same list as v1 Task 16 — all `.sidebar*`, `.nav-item*`, `.nav-spacer`, old header classes, view-specific layout overrides.

**Step 2: Verify no imports reference deleted files**

```bash
grep -r "Sidebar" frontend/src/ --include="*.tsx" --include="*.ts"
grep -r "TopHeader" frontend/src/ --include="*.tsx" --include="*.ts"
```

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove old Sidebar, TopHeader, and orphaned CSS"
```

---

### Task 17: Visual QA & Polish

**Files:**
- Various (based on QA findings)

**Step 1: Start dev server**

```bash
cd /Users/trarara/Dropbox/+Projects/2601\ Address\ Book\ Cleanup/ello-claude && npm run dev
```

**Step 2: Test in browser at 1280px+ width**

Verify against Figma (node 178:786):
- [ ] Header: 64px height, logo left, title+search+info centered in 960px, actions right
- [ ] Logo: 24px height in far left of header
- [ ] Search: 400px wide, #f9fafb bg, #d1d5db border, search icon left, close icon right
- [ ] Nav: Icons floating on left, vertically centered, no border/background
- [ ] Active nav: purple background pill (rgba(95,39,227,0.1))
- [ ] Nav icons: 36px, muted gray (#9ca3af), purple when active
- [ ] Content: 960px fixed width, centered
- [ ] Right spacer: equal width to nav column
- [ ] Background: white throughout (not gray)
- [ ] Contact rows display correctly within 960px
- [ ] PageHeader consistent across all pages (Dashboard, Contacts, Map, Groups, etc.)
- [ ] No horizontal scroll at 1280px
- [ ] Mobile: NavRail hidden, BottomTabBar shows, content fills width

**Step 3: Specific things to check**
- Content centering: nav + 960px + spacer should be balanced
- Header alignment: logo should align with nav column, "Contacts" title should align with content start
- Search input styling matches Figma exactly
- "Add Contact" button: purple bg, white text, bold, plus-circle icon

**Step 4: Fix any issues found**

**Step 5: Kill dev servers**

```bash
kill $(lsof -ti :3000) 2>/dev/null
kill $(lsof -ti :5173) 2>/dev/null
```

**Step 6: Final commit**

```bash
git add -A
git commit -m "fix: visual QA polish for Figma-matched redesign"
```

---

## Mobile Considerations

Same as v1: NavRail is desktop-only. Mobile uses BottomTabBar. PageHeader simplifies on mobile:

```css
@media (max-width: 768px) {
  .page-header {
    padding: 0 var(--ds-space-4);
    height: 48px;
  }

  .page-header-col-left,
  .page-header-col-right {
    flex: 0;
  }

  .page-header-col-center {
    width: 100%;
  }

  .page-header-search {
    width: auto;
    flex: 1;
  }

  .page-header-info {
    display: none;
  }

  .app-body-spacer {
    display: none;
  }

  .app-body-center {
    width: 100%;
  }
}
```

---

## Architecture Decision: PageHeader Rendering

Two valid approaches exist for where PageHeader is rendered:

**Option A (chosen): Pages render PageHeader as their first child**
- Each page component returns `<> <PageHeader .../> <content/> </>`
- Layout just provides `app-body` wrapper with NavRail + content + spacer
- Pro: Simple, no context needed, page controls its own header
- Con: Header is inside `app-body-center` (960px) — need CSS trick to make it span full-width OR the header sits above `app-body` visually via `position: sticky` on the body container

**Option B: Layout renders PageHeader, pages configure via context**
- Layout renders `<PageHeader />` above `app-body`
- Pages use `usePageHeader({ title, search, ... })` hook to set config
- Pro: Header naturally spans full width
- Con: More complex, context updates, risk of stale state

**Resolution:** Go with Option A for simplicity. The CSS structure should be:

```
.app-layout
├── .page-header (rendered by page, but positioned at full-width via CSS grid or position)
└── .app-body
    ├── .nav-rail
    ├── .app-body-center (960px)
    │   └── page content
    └── .app-body-spacer
```

Actually, the cleanest way to match the Figma exactly: use CSS Grid on `.app-layout`:

```css
.app-layout {
  display: grid;
  grid-template-rows: var(--ds-header-height) 1fr;
  grid-template-columns: 1fr var(--ds-content-width) 1fr;
  min-height: 100vh;
}

.page-header {
  grid-column: 1 / -1; /* spans all columns */
}

.nav-rail {
  grid-column: 1;
}

.main-content {
  grid-column: 2;
}

.app-body-spacer {
  grid-column: 3;
}
```

This way, the header naturally spans full-width and the nav/content/spacer sit in their columns below. **But** the header is rendered by the page (inside Outlet which is in main-content grid-column 2). This won't work.

**Final answer:** Use Option B (Layout renders header) OR restructure so Layout renders PageHeader at the top and passes header config via outlet context.

The implementation in Task 4 should use the **outlet context approach**: Layout renders PageHeader, and pages set header config via `useOutletContext`. This is the v1 pattern already in use (`useOutletContext<OutletContext>`) — just extend the context:

```tsx
// Layout passes to Outlet:
<Outlet context={{ setModalOpen, isMobile, setHeaderConfig }} />

// Pages use:
const { setHeaderConfig, isMobile } = useOutletContext<OutletContext>();
useEffect(() => {
  setHeaderConfig({ title: 'Contacts', search, onSearchChange: setSearch, ... });
}, [search, totalContacts]);
```

This is the cleanest approach that matches the Figma grid layout.

---

## Summary of New Files

| File | Type | Purpose |
|------|------|---------|
| `frontend/src/components/NavRail.tsx` | New | Floating icon navigation |
| `frontend/src/components/PageHeader.tsx` | New | Full-width centered page header |

## Summary of Modified Files

| File | Changes |
|------|---------|
| `frontend/src/styles/design-system.css` | New layout tokens (content-width, header, nav) |
| `frontend/src/components/Layout.tsx` | CSS Grid layout, PageHeader rendering, NavRail |
| `frontend/src/index.css` | All new layout CSS, remove old sidebar/header CSS |
| `frontend/src/components/ContactsPage.tsx` | Configure PageHeader via context |
| `frontend/src/components/DashboardView.tsx` | Configure PageHeader via context |
| `frontend/src/components/DeduplicationView.tsx` | Configure PageHeader via context |
| `frontend/src/components/CleanupView.tsx` | Configure PageHeader via context |
| `frontend/src/components/ArchivedView.tsx` | Configure PageHeader via context |
| `frontend/src/components/GroupsView.tsx` | Configure PageHeader via context |
| `frontend/src/components/MapView.tsx` | Configure PageHeader via context |
| `frontend/src/components/SettingsView.tsx` | Configure PageHeader via context |
| `frontend/src/components/EnrichView.tsx` | Configure PageHeader via context |
| `frontend/src/components/AddContactPage.tsx` | Configure PageHeader via context |
| `frontend/src/components/ContactDetailPage.tsx` | Configure PageHeader via context |
| `frontend/src/components/UserProfilePage.tsx` | Configure PageHeader via context |

## Files to Delete

| File | Reason |
|------|--------|
| `Sidebar.tsx` | Replaced by NavRail |
| `TopHeader.tsx` | Replaced by PageHeader |

## Files Kept (evaluate in Phase 2)

| File | Reason |
|------|--------|
| `MobileHeader.tsx` | May still be needed for BottomTabBar / mobile |
| `BottomTabBar.tsx` | Mobile nav — separate redesign |

# Visual Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the app layout with a minimal floating navigation rail, a consistent reusable PageHeader component across all pages, and an open, spacious feel.

**Architecture:** Replace the current 256px sidebar with a narrow icon-only navigation rail (64px) that shows labels on hover via tooltips. Create a `PageHeader` component used by every page, providing consistent height, logo, page title, search, stats area, and action slots. The Layout component orchestrates these pieces. Phase 1 covers the shared shell (nav + header); Phase 2 (future plan) refines individual page content areas.

**Tech Stack:** React 19, CSS custom properties (design-system.css), React Router NavLink, existing Material Symbols icons.

---

## Phase 1 Overview

| Task | What | Files |
|------|------|-------|
| 1 | Design tokens for new layout | `design-system.css` |
| 2 | NavRail component (replaces Sidebar) | `NavRail.tsx` (new) |
| 3 | PageHeader component | `PageHeader.tsx` (new) |
| 4 | Layout shell integration | `Layout.tsx` |
| 5 | CSS for NavRail + PageHeader | `index.css` |
| 6 | Wire PageHeader into ContactsPage | `ContactsPage.tsx` |
| 7 | Wire PageHeader into DashboardView | `DashboardView.tsx` |
| 8 | Wire PageHeader into DeduplicationView | `DeduplicationView.tsx` |
| 9 | Wire PageHeader into CleanupView | `CleanupView.tsx` |
| 10 | Wire PageHeader into ArchivedView | `ArchivedView.tsx` |
| 11 | Wire PageHeader into GroupsView | `GroupsView.tsx` |
| 12 | Wire PageHeader into MapView | `MapView.tsx` |
| 13 | Wire PageHeader into SettingsView | `SettingsView.tsx` |
| 14 | Wire PageHeader into EnrichView | `EnrichView.tsx` |
| 15 | Wire PageHeader into AddContactPage & ContactDetailPage | `AddContactPage.tsx`, `ContactDetailPage.tsx`, `UserProfilePage.tsx` |
| 16 | Clean up old Sidebar CSS & dead code | `index.css`, `Sidebar.tsx` |
| 17 | Visual QA & polish | Various |

---

### Task 1: Add Design Tokens for New Layout

**Files:**
- Modify: `frontend/src/styles/design-system.css`

**Step 1: Add new layout tokens to design-system.css**

Add these tokens at the end of the `:root` block:

```css
/* Layout - Navigation Rail */
--ds-nav-width: 64px;
--ds-nav-width-expanded: 200px;
--ds-nav-bg: var(--ds-bg-primary);
--ds-nav-border: var(--ds-border-light);
--ds-nav-icon-size: 22px;
--ds-nav-item-size: 44px;
--ds-nav-tooltip-bg: var(--ds-text-primary);
--ds-nav-tooltip-text: var(--ds-text-inverse);

/* Layout - Page Header */
--ds-header-height: 56px;
--ds-header-bg: var(--ds-bg-primary);
--ds-header-border: var(--ds-border-light);
--ds-header-logo-size: 24px;
```

**Step 2: Commit**

```bash
git add frontend/src/styles/design-system.css
git commit -m "feat: add design tokens for nav rail and page header layout"
```

---

### Task 2: Create NavRail Component

**Files:**
- Create: `frontend/src/components/NavRail.tsx`

**Step 1: Create the NavRail component**

```tsx
import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import logoSvg from '../assets/logo.svg';

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
      <span className="nav-rail-label">{label}</span>
    </NavLink>
  );
}

export function NavRail() {
  const { user, logout, isLoggingOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toolsRoutes = ['/archived', '/merge', '/cleanup', '/enrich'];
  const isToolsRoute = toolsRoutes.some(route => location.pathname.startsWith(route));

  // Close user menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      <div className="nav-rail-top">
        <div className="nav-rail-logo">
          <img src={logoSvg} alt="Yellow" />
        </div>

        <div className="nav-rail-items">
          <NavRailItem to="/dashboard" icon="dashboard" label="Dashboard" />
          <NavRailItem to="/contacts" icon="contacts" label="Contacts" />
          <NavRailItem to="/map" icon="map" label="Map" />
          <NavRailItem to="/groups" icon="group" label="Groups" />
        </div>

        <div className="nav-rail-divider" />

        <div className="nav-rail-items">
          <NavRailItem to="/archived" icon="archive" label="Archived" />
          <NavRailItem to="/merge" icon="merge" label="Merge" />
          <NavRailItem to="/cleanup" icon="cleaning_services" label="Cleanup" />
          <NavRailItem to="/enrich" icon="auto_awesome" label="Enrich" />
        </div>
      </div>

      <div className="nav-rail-bottom" ref={menuRef}>
        <button
          type="button"
          className="nav-rail-item nav-rail-settings"
          title="Settings"
          onClick={() => navigate('/settings')}
        >
          <span className="material-symbols-outlined">settings</span>
          <span className="nav-rail-label">Settings</span>
        </button>

        <button
          type="button"
          className={`nav-rail-avatar ${showUserMenu ? 'active' : ''}`}
          onClick={() => setShowUserMenu(!showUserMenu)}
          aria-expanded={showUserMenu}
          aria-haspopup="menu"
          title={displayName}
        >
          <div className="nav-rail-avatar-img">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} referrerPolicy="no-referrer" />
            ) : (
              initials
            )}
          </div>
        </button>

        {showUserMenu && (
          <div className="nav-rail-user-menu" role="menu">
            <button
              type="button"
              className="nav-rail-menu-item"
              onClick={() => { setShowUserMenu(false); navigate('/profile'); }}
              role="menuitem"
            >
              <span className="material-symbols-outlined">person</span>
              <span>Profile</span>
            </button>
            <button
              type="button"
              className={`nav-rail-menu-item logout ${isLoggingOut ? 'disabled' : ''}`}
              onClick={() => { setShowUserMenu(false); if (!isLoggingOut) logout(); }}
              disabled={isLoggingOut}
              role="menuitem"
            >
              <span className="material-symbols-outlined">logout</span>
              <span>{isLoggingOut ? 'Signing out...' : 'Sign out'}</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
```

**Design decisions:**
- Flat list instead of collapsible Tools submenu — all nav items visible, separated by a divider
- Icons only at rest; labels appear on hover (CSS handles this)
- Settings promoted from user submenu to its own nav item (it's frequently used)
- User avatar at bottom opens a minimal menu (Profile, Sign out)
- Left-aligned layout with icons centered in the 64px rail

**Step 2: Commit**

```bash
git add frontend/src/components/NavRail.tsx
git commit -m "feat: create NavRail component for minimal icon navigation"
```

---

### Task 3: Create PageHeader Component

**Files:**
- Create: `frontend/src/components/PageHeader.tsx`

**Step 1: Create the reusable PageHeader component**

```tsx
import { type ReactNode } from 'react';

interface PageHeaderProps {
  /** Page title displayed after the logo */
  title: string;
  /** Icon name from Material Symbols (optional, shown before title) */
  icon?: string;
  /** Search input value — omit to hide search */
  search?: string;
  /** Search input change handler */
  onSearchChange?: (value: string) => void;
  /** Search placeholder text */
  searchPlaceholder?: string;
  /** Stats/info area between search and actions (e.g. "1,234 contacts") */
  info?: ReactNode;
  /** Action buttons on the right side */
  actions?: ReactNode;
  /** Additional content below the main header row (e.g. filters, mode selectors) */
  children?: ReactNode;
}

export function PageHeader({
  title,
  icon,
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  info,
  actions,
  children,
}: PageHeaderProps) {
  const showSearch = onSearchChange !== undefined;

  return (
    <header className="page-header-bar">
      <div className="page-header-row">
        <div className="page-header-left">
          {icon && (
            <span className="material-symbols-outlined page-header-icon">{icon}</span>
          )}
          <h1 className="page-header-title">{title}</h1>
        </div>

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

        <div className="page-header-right">
          {info && <div className="page-header-info">{info}</div>}
          {actions && <div className="page-header-actions">{actions}</div>}
        </div>
      </div>

      {children && (
        <div className="page-header-sub">
          {children}
        </div>
      )}
    </header>
  );
}
```

**Design decisions:**
- Single row: [icon? title] [search] [info | actions]
- `children` slot renders below the main row for sub-controls (mode selectors, filters, etc.)
- All props optional except `title` — pages opt into search, info, actions as needed
- Consistent 56px height for the main row, sub-row adds more if present
- No logo in header (logo is in the NavRail) — the icon+title identifies the page

**Step 2: Commit**

```bash
git add frontend/src/components/PageHeader.tsx
git commit -m "feat: create PageHeader component for consistent page headers"
```

---

### Task 4: Update Layout Shell

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

**Step 1: Replace Sidebar with NavRail in Layout**

Replace the full Layout.tsx content:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NavRail } from './NavRail';
import { BottomTabBar } from './BottomTabBar';
import { useIsMobile } from '../hooks/useIsMobile';

// Routes that are not accessible on mobile
const DESKTOP_ONLY_ROUTES = ['/merge', '/cleanup', '/archived'];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [modalOpen, setModalOpen] = useState(false);

  // Redirect mobile users away from desktop-only routes
  useEffect(() => {
    if (isMobile && DESKTOP_ONLY_ROUTES.includes(location.pathname)) {
      navigate('/contacts', { replace: true });
    }
  }, [isMobile, location.pathname, navigate]);

  // Listen for modal state changes from child components
  useEffect(() => {
    const handleModalChange = (e: CustomEvent<{ open: boolean }>) => {
      setModalOpen(e.detail.open);
    };
    window.addEventListener('layout-modal-change', handleModalChange as EventListener);
    return () => window.removeEventListener('layout-modal-change', handleModalChange as EventListener);
  }, []);

  // Escape key navigation
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
      {!isMobile && <NavRail />}
      <main className="main-content">
        <Outlet context={{ setModalOpen: handleSetModalOpen, isMobile }} />
      </main>
      {isMobile && <BottomTabBar />}
    </div>
  );
}
```

**Key changes:**
- Removed all view-specific layout classes (no longer needed — pages handle their own sub-layouts)
- Replaced `<Sidebar>` with `<NavRail>`
- Removed `currentView` state tracking (NavRail doesn't need it — NavLink handles active state)
- Kept modal handling and escape-key behavior unchanged

**Step 2: Commit**

```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat: update Layout to use NavRail instead of Sidebar"
```

---

### Task 5: Add CSS for NavRail and PageHeader

**Files:**
- Modify: `frontend/src/index.css`

**Step 1: Add NavRail CSS**

Replace the existing `.sidebar`, `.sidebar-*`, and `.nav-item` CSS blocks (lines ~109-235) with the new NavRail styles. Also replace the `.app-layout` rule. Keep all other CSS intact.

```css
/* ===== App Layout ===== */

.app-layout {
  display: flex;
  min-height: 100vh;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--ds-bg-secondary);
}

/* ===== Navigation Rail ===== */

.nav-rail {
  width: var(--ds-nav-width);
  min-width: var(--ds-nav-width);
  height: 100vh;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: var(--ds-nav-bg);
  border-right: 1px solid var(--ds-nav-border);
  padding: var(--ds-space-3) 0;
  z-index: var(--ds-z-sticky);
  transition: width 0.2s ease;
}

.nav-rail:hover {
  width: var(--ds-nav-width-expanded);
}

.nav-rail-top,
.nav-rail-bottom {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.nav-rail-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--ds-nav-item-size);
  margin-bottom: var(--ds-space-4);
  padding: 0 var(--ds-space-3);
  overflow: hidden;
}

.nav-rail-logo img {
  height: var(--ds-header-logo-size);
  width: auto;
  flex-shrink: 0;
}

.nav-rail-items {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-1);
  padding: 0 var(--ds-space-2);
}

.nav-rail-divider {
  height: 1px;
  background: var(--ds-nav-border);
  margin: var(--ds-space-3) var(--ds-space-4);
}

.nav-rail-item {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  height: var(--ds-nav-item-size);
  padding: 0 var(--ds-space-3);
  border-radius: var(--ds-radius-md, 8px);
  color: var(--ds-text-secondary);
  text-decoration: none;
  font-size: var(--ds-font-sm);
  font-weight: 500;
  cursor: pointer;
  background: none;
  border: none;
  font-family: inherit;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  transition: background-color 0.15s, color 0.15s;
}

.nav-rail-item .material-symbols-outlined {
  font-size: var(--ds-nav-icon-size);
  flex-shrink: 0;
  width: var(--ds-nav-icon-size);
}

.nav-rail-label {
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}

.nav-rail:hover .nav-rail-label {
  opacity: 1;
}

.nav-rail-item:hover {
  background-color: var(--ds-bg-hover);
  color: var(--ds-text-primary);
}

.nav-rail-item.active,
a.nav-rail-item.active {
  background-color: var(--ds-color-primary-light);
  color: var(--ds-color-primary);
}

.nav-rail-item:focus-visible {
  outline: 2px solid var(--ds-color-primary);
  outline-offset: -2px;
}

/* Nav Rail Bottom */

.nav-rail-bottom {
  padding: 0 var(--ds-space-2);
  gap: var(--ds-space-1);
  position: relative;
}

.nav-rail-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--ds-nav-item-size);
  padding: 0 var(--ds-space-3);
  cursor: pointer;
  background: none;
  border: none;
  border-radius: var(--ds-radius-md, 8px);
  transition: background-color 0.15s;
}

.nav-rail-avatar:hover,
.nav-rail-avatar.active {
  background-color: var(--ds-bg-hover);
}

.nav-rail-avatar-img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  overflow: hidden;
}

.nav-rail-avatar-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

/* Nav Rail User Menu */

.nav-rail-user-menu {
  position: absolute;
  bottom: 100%;
  left: var(--ds-space-2);
  right: var(--ds-space-2);
  background: var(--ds-text-primary);
  border-radius: 8px;
  padding: 4px;
  margin-bottom: 4px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
  z-index: var(--ds-z-dropdown);
  min-width: 160px;
}

.nav-rail-menu-item {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--ds-bg-tertiary);
  font-size: var(--ds-font-sm);
  background: none;
  border: none;
  width: 100%;
  text-align: left;
  font-family: inherit;
  transition: background-color 0.15s;
}

.nav-rail-menu-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.nav-rail-menu-item.logout {
  color: var(--ds-color-error);
}

.nav-rail-menu-item.logout:hover {
  background-color: rgba(252, 129, 129, 0.15);
}

.nav-rail-menu-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nav-rail-menu-item .material-symbols-outlined {
  font-size: 20px;
}

/* ===== Page Header Bar ===== */

.page-header-bar {
  background: var(--ds-header-bg);
  border-bottom: 1px solid var(--ds-header-border);
  padding: 0 var(--ds-space-6);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: var(--ds-z-sticky);
}

.page-header-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-4);
  height: var(--ds-header-height);
}

.page-header-left {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  flex-shrink: 0;
}

.page-header-icon {
  font-size: 20px;
  color: var(--ds-text-secondary);
}

.page-header-title {
  font-size: var(--ds-font-lg);
  font-weight: 600;
  color: var(--ds-text-primary);
  margin: 0;
  white-space: nowrap;
}

.page-header-search {
  flex: 1;
  max-width: 400px;
  position: relative;
  display: flex;
  align-items: center;
}

.page-header-search-icon {
  position: absolute;
  left: 10px;
  font-size: 18px;
  color: var(--ds-text-muted);
  pointer-events: none;
}

.page-header-search-input {
  width: 100%;
  height: 36px;
  padding: 0 36px 0 36px;
  border: 1px solid var(--ds-border-color);
  border-radius: 8px;
  font-size: var(--ds-font-sm);
  background: var(--ds-bg-secondary);
  color: var(--ds-text-primary);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.page-header-search-input:focus {
  border-color: var(--ds-color-primary);
  box-shadow: var(--ds-shadow-focus);
}

.page-header-search-input::placeholder {
  color: var(--ds-text-muted);
}

.page-header-search-clear {
  position: absolute;
  right: 6px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--ds-text-muted);
  display: flex;
  align-items: center;
}

.page-header-search-clear:hover {
  color: var(--ds-text-primary);
}

.page-header-search-clear .material-symbols-outlined {
  font-size: 16px;
}

.page-header-right {
  display: flex;
  align-items: center;
  gap: var(--ds-space-4);
  margin-left: auto;
  flex-shrink: 0;
}

.page-header-info {
  font-size: var(--ds-font-sm);
  color: var(--ds-text-secondary);
  white-space: nowrap;
}

.page-header-actions {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
}

.page-header-sub {
  padding: var(--ds-space-2) 0 var(--ds-space-3);
  border-top: 1px solid var(--ds-border-light);
}
```

**Step 2: Remove the old sidebar CSS**

Delete the following class blocks from `index.css`:
- `.sidebar` and all `.sidebar-*` rules (~lines 109-235)
- `.nav-item` and related rules (~lines 150-188)
- `.nav-spacer` rule
- View-specific `.xxx-layout .main-content` overrides (~lines 676, 1694, 2761, 3706)

**Step 3: Update main-content background**

The `.main-content` background changes from white to `var(--ds-bg-secondary)` (light gray) — this creates the "floating" effect where the page header and content cards feel like they're sitting on a subtle surface.

**Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add NavRail and PageHeader CSS, remove old sidebar styles"
```

---

### Task 6: Wire PageHeader into ContactsPage

**Files:**
- Modify: `frontend/src/components/ContactsPage.tsx`

**Step 1: Replace the inline header with PageHeader**

```tsx
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ContactList } from './ContactList';
import { PageHeader } from './PageHeader';
import { ViewToggle } from './ViewToggle';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

export function ContactsPage() {
  const { isMobile } = useOutletContext<OutletContext>();
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
        title="All Contacts"
        icon="contacts"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search contacts..."
        info={
          <span>{totalContacts.toLocaleString()} contact{totalContacts !== 1 ? 's' : ''}</span>
        }
        actions={
          !isMobile ? <ViewToggle view={viewMode} onViewChange={handleViewChange} /> : undefined
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

**Key changes:**
- Removed MobileHeader import and usage (PageHeader works for both)
- Removed `mobileSearchOpen` state (search is always visible in header)
- Removed old `.contacts-page-header` div
- ViewToggle placed in `actions` slot

**Step 2: Remove old contacts-page-header CSS from index.css**

Delete the `.contacts-page-header`, `.contacts-title`, and `.contact-count` CSS blocks.

**Step 3: Commit**

```bash
git add frontend/src/components/ContactsPage.tsx frontend/src/index.css
git commit -m "feat: use PageHeader in ContactsPage"
```

---

### Task 7: Wire PageHeader into DashboardView

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx`

**Step 1: Replace dashboard header with PageHeader**

Replace the header sections (both mobile and desktop patterns) with:

```tsx
<PageHeader title="Dashboard" icon="dashboard" />
```

Remove the `MobileHeader` import and all conditional `isMobile ? <MobileHeader ... /> : <div className="dashboard-header">` blocks. The PageHeader renders the same way on both.

**Step 2: Remove old `.dashboard-header` CSS from index.css**

**Step 3: Commit**

```bash
git add frontend/src/components/DashboardView.tsx frontend/src/index.css
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
  icon="merge"
  info={
    <span>
      {visibleCount} of {totalGroups} duplicate groups
      {hiddenGroupIds.size > 0 && (
        <span className="hidden-count"> ({hiddenGroupIds.size} hidden)</span>
      )}
    </span>
  }
  actions={
    <>
      {selectedContactIds.size > 0 && (
        <>
          <button className="header-action-btn danger" onClick={() => setShowArchiveConfirm(true)}>
            Archive ({selectedContactIds.size})
          </button>
          <button className="header-action-btn danger" onClick={() => setShowDeleteConfirm(true)}>
            Delete ({selectedContactIds.size})
          </button>
        </>
      )}
      {visibleCount > 0 && (
        <>
          <button className="header-action-btn" onClick={handleMergeAllPage}>
            Merge Page ({pageGroupCount})
          </button>
          <button className="header-action-btn primary" onClick={() => setShowMergeAllGlobalConfirm(true)}>
            Merge All ({totalGroups})
          </button>
        </>
      )}
    </>
  }
>
  {/* Sub-row: mode selector + confidence filter */}
  <div className="dedup-controls">
    <ModeSelector ... />
    {selectedMode === 'recommended' && <ConfidenceFilter ... />}
  </div>
</PageHeader>
```

**Note:** The mode selector and confidence filter go into the `children` slot (sub-row). The exact handler names and props should match the existing code — this is a layout move, not a logic change.

**Step 2: Remove old `.dedup-header` and `.dedup-header-top` CSS**

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
  title="Cleanup Contacts"
  icon="cleaning_services"
  info={total !== undefined ? <span>{total} contact(s) found</span> : undefined}
  actions={
    selectedContactIds.size > 0 ? (
      <>
        <button className="header-action-btn danger" onClick={() => setShowArchiveConfirm(true)}>
          Archive ({selectedContactIds.size})
        </button>
        <button className="header-action-btn danger" onClick={() => setShowDeleteConfirm(true)}>
          Delete ({selectedContactIds.size})
        </button>
      </>
    ) : undefined
  }
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
  title="Archived Contacts"
  icon="archive"
  info={<span>{totalArchived} archived</span>}
  actions={
    <>
      <button className="header-action-btn" onClick={handleExport}>Export All VCF</button>
      {selectedIds.size > 0 && (
        <>
          <button className="header-action-btn" onClick={handleRestore}>
            Restore ({selectedIds.size})
          </button>
          <button className="header-action-btn danger" onClick={() => setShowDeleteConfirm(true)}>
            Delete ({selectedIds.size})
          </button>
        </>
      )}
    </>
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

For the groups list view:
```tsx
<PageHeader
  title="Groups"
  icon="group"
  info={data?.groups ? <span>{data.groups.length} groups</span> : undefined}
/>
```

For the filtered category view:
```tsx
<PageHeader
  title={selectedCategory}
  icon="group"
  actions={
    <button className="header-action-btn" onClick={handleBackToGroups}>
      <span className="material-symbols-outlined">arrow_back</span>
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
  icon="map"
  search={searchQuery}
  onSearchChange={setSearchQuery}
  searchPlaceholder="Search contacts on map..."
  info={
    <span>{geocodedCount} of {totalContacts} contacts on map</span>
  }
  actions={
    pendingCount > 0 ? (
      <button className="header-action-btn primary" onClick={handleGeocode}>
        Geocode {pendingCount} addresses
      </button>
    ) : undefined
  }
/>
```

**Step 2: Remove old map header CSS**

**Step 3: Commit**

```bash
git add frontend/src/components/MapView.tsx frontend/src/index.css
git commit -m "feat: use PageHeader in MapView"
```

---

### Task 13: Wire PageHeader into SettingsView

**Files:**
- Modify: `frontend/src/components/SettingsView.tsx`

**Step 1: Replace settings header with PageHeader**

```tsx
<PageHeader title="Settings" icon="settings" />
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
  title="Enrich Contacts"
  icon="auto_awesome"
  info={readyCount > 0 ? <span>{readyCount} ready to enrich</span> : undefined}
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
  icon="person_add"
  actions={
    <>
      <button className="header-action-btn" onClick={() => navigate(-1)}>Cancel</button>
      <button className="header-action-btn primary" onClick={handleSave}>Save Contact</button>
    </>
  }
/>
```

**Step 2: ContactDetailPage**

```tsx
<PageHeader
  title={contact.displayName}
  actions={
    <button className="header-action-btn" onClick={() => navigate(-1)}>
      <span className="material-symbols-outlined">arrow_back</span>
      Back
    </button>
  }
/>
```

**Step 3: UserProfilePage**

```tsx
<PageHeader title="Profile" icon="person" />
```

**Step 4: Remove old `.top-header` and `.page-header` CSS blocks from index.css**

Note: `.page-header` was the old class name. The new component uses `.page-header-bar` to avoid conflicts during migration. After this task, the old `.page-header` styles can be removed.

**Step 5: Commit**

```bash
git add frontend/src/components/AddContactPage.tsx frontend/src/components/ContactDetailPage.tsx frontend/src/components/UserProfilePage.tsx frontend/src/index.css
git commit -m "feat: use PageHeader in AddContact, ContactDetail, and UserProfile pages"
```

---

### Task 16: Clean Up Old Code

**Files:**
- Modify: `frontend/src/index.css` — remove all orphaned CSS
- Keep: `frontend/src/components/Sidebar.tsx` — do not delete yet (keep as reference, will be removed after QA)
- Modify: `frontend/src/components/MobileHeader.tsx` — keep for now (BottomTabBar still uses mobile header pattern)

**Step 1: Search for and remove orphaned CSS**

Search `index.css` for these class prefixes and remove if no longer referenced by any component:
- `.sidebar` (all sidebar-related rules)
- `.nav-item` (old navigation styles)
- `.nav-spacer`
- `.contacts-page-header`, `.contacts-title`
- `.dashboard-header`
- `.dedup-header`, `.dedup-header-top`
- `.cleanup-header`, `.cleanup-header-top`
- `.archived-header`, `.archived-header-top`
- `.groups-header`
- `.top-header` (old generic header)
- Old `.page-header` (replaced by `.page-header-bar`)
- View-specific `.xxx-layout` overrides

**Step 2: Add a shared button style for header actions**

```css
.header-action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-2);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: var(--ds-font-sm);
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--ds-border-color);
  background: var(--ds-bg-primary);
  color: var(--ds-text-primary);
  transition: background-color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.header-action-btn:hover {
  background: var(--ds-bg-secondary);
  border-color: var(--ds-border-dark);
}

.header-action-btn.primary {
  background: var(--ds-color-primary);
  color: var(--ds-text-inverse);
  border-color: var(--ds-color-primary);
}

.header-action-btn.primary:hover {
  background: var(--ds-color-primary-hover);
}

.header-action-btn.danger {
  color: var(--ds-color-error);
  border-color: var(--ds-color-error);
}

.header-action-btn.danger:hover {
  background: rgba(220, 38, 38, 0.08);
}

.header-action-btn .material-symbols-outlined {
  font-size: 16px;
}
```

**Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "refactor: clean up old sidebar CSS, add header action button styles"
```

---

### Task 17: Visual QA & Polish

**Files:**
- Various (based on QA findings)

**Step 1: Start dev server and test each page**

```bash
cd /Users/trarara/Dropbox/+Projects/2601\ Address\ Book\ Cleanup/ello-claude && npm run dev
```

**Step 2: Test the following in browser**

For each page, verify:
- [ ] NavRail shows icons at 64px, expands on hover to show labels
- [ ] Active nav item highlighted with purple
- [ ] PageHeader renders at consistent 56px height
- [ ] Search works (ContactsPage, MapView)
- [ ] Info/stats display correctly
- [ ] Action buttons appear where expected
- [ ] Sub-rows (mode selectors, filters) display below header
- [ ] User avatar menu works (Profile, Sign out)
- [ ] Mobile layout still works (NavRail hidden, BottomTabBar shows)
- [ ] Escape key still navigates to /contacts
- [ ] No layout shift on page transitions (header stays fixed)

**Step 3: Fix any visual issues found**

Common things to watch for:
- Content overlapping under sticky header (add `padding-top` or `scroll-margin-top`)
- NavRail hover expansion overlapping content (ensure `z-index` is correct)
- Search input sizing on different pages
- Button alignment in actions area

**Step 4: Kill dev servers**

```bash
kill $(lsof -ti :3000) 2>/dev/null
kill $(lsof -ti :5173) 2>/dev/null
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "fix: visual QA polish for redesigned layout"
```

---

## Mobile Considerations

The NavRail is desktop-only (hidden on mobile). Mobile continues to use `BottomTabBar` for navigation. However, **PageHeader is used on both mobile and desktop** — it replaces both the old desktop headers AND `MobileHeader`. On mobile, the PageHeader will need these responsive adjustments (add to Task 5 CSS):

```css
@media (max-width: 768px) {
  .page-header-bar {
    padding: 0 var(--ds-space-4);
  }

  .page-header-row {
    height: 48px;
    gap: var(--ds-space-2);
  }

  .page-header-title {
    font-size: var(--ds-font-md);
  }

  .page-header-search {
    max-width: none;
  }

  .page-header-info {
    display: none;
  }
}
```

---

## Summary of New Files

| File | Type | Purpose |
|------|------|---------|
| `frontend/src/components/NavRail.tsx` | New | Icon navigation rail replacing Sidebar |
| `frontend/src/components/PageHeader.tsx` | New | Reusable page header component |

## Summary of Modified Files

| File | Changes |
|------|---------|
| `frontend/src/styles/design-system.css` | New layout tokens |
| `frontend/src/components/Layout.tsx` | Use NavRail, remove view classes |
| `frontend/src/index.css` | NavRail CSS, PageHeader CSS, remove old sidebar/header CSS |
| `frontend/src/components/ContactsPage.tsx` | Use PageHeader |
| `frontend/src/components/DashboardView.tsx` | Use PageHeader |
| `frontend/src/components/DeduplicationView.tsx` | Use PageHeader |
| `frontend/src/components/CleanupView.tsx` | Use PageHeader |
| `frontend/src/components/ArchivedView.tsx` | Use PageHeader |
| `frontend/src/components/GroupsView.tsx` | Use PageHeader |
| `frontend/src/components/MapView.tsx` | Use PageHeader |
| `frontend/src/components/SettingsView.tsx` | Use PageHeader |
| `frontend/src/components/EnrichView.tsx` | Use PageHeader |
| `frontend/src/components/AddContactPage.tsx` | Use PageHeader |
| `frontend/src/components/ContactDetailPage.tsx` | Use PageHeader |
| `frontend/src/components/UserProfilePage.tsx` | Use PageHeader |

## Files NOT Changed (kept for now)

| File | Reason |
|------|--------|
| `Sidebar.tsx` | Keep as reference until QA confirms NavRail works; delete in Phase 2 |
| `MobileHeader.tsx` | May still be used by BottomTabBar; evaluate in Phase 2 |
| `BottomTabBar.tsx` | Mobile nav — separate redesign in Phase 2 |
| `TopHeader.tsx` | Check if anything still imports it; delete if orphaned |

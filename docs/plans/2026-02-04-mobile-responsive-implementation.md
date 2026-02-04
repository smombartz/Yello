# Mobile Responsive Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add mobile-friendly responsive layout with bottom tab navigation, mobile header, and touch-optimized interactions for viewports ≤768px.

**Architecture:** CSS media queries detect mobile breakpoint. New `useIsMobile` hook provides JS detection. Mobile layout replaces sidebar with bottom tab bar and top header. Desktop-only routes (/merge, /cleanup, /archived) redirect to /contacts on mobile.

**Tech Stack:** React, React Router, CSS media queries, CSS custom properties

---

## Task 1: Update Viewport Meta Tag

**Files:**
- Modify: `frontend/index.html:6`

**Step 1: Update viewport meta tag for notched devices**

Change line 6 from:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

To:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

**Step 2: Verify change**

Run: `grep "viewport-fit" frontend/index.html`
Expected: Line containing `viewport-fit=cover`

**Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: add viewport-fit=cover for notched device support"
```

---

## Task 2: Create useIsMobile Hook

**Files:**
- Create: `frontend/src/hooks/useIsMobile.ts`

**Step 1: Create hooks directory and file**

```typescript
import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}
```

**Step 2: Verify file exists**

Run: `cat frontend/src/hooks/useIsMobile.ts`
Expected: Hook code with MOBILE_BREAKPOINT = 768

**Step 3: Commit**

```bash
git add frontend/src/hooks/useIsMobile.ts
git commit -m "feat: add useIsMobile hook for responsive detection"
```

---

## Task 3: Create BottomTabBar Component

**Files:**
- Create: `frontend/src/components/BottomTabBar.tsx`

**Step 1: Create the component**

```tsx
import { NavLink, useNavigate } from 'react-router-dom';

interface TabItemProps {
  to: string;
  icon: string;
  label: string;
}

function TabItem({ to, icon, label }: TabItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}
    >
      <span className="material-symbols-outlined">{icon}</span>
      <span className="tab-label">{label}</span>
    </NavLink>
  );
}

export function BottomTabBar() {
  const navigate = useNavigate();

  const handleAddContact = () => {
    navigate('/contacts/new');
  };

  return (
    <nav className="bottom-tab-bar">
      <TabItem to="/contacts" icon="contacts" label="Contacts" />
      <TabItem to="/map" icon="map" label="Map" />

      <button className="tab-add-button" onClick={handleAddContact} aria-label="Add contact">
        <span className="material-symbols-outlined">add</span>
      </button>

      <TabItem to="/groups" icon="group" label="Groups" />
      <TabItem to="/settings" icon="settings" label="Settings" />
    </nav>
  );
}
```

**Step 2: Verify file exists**

Run: `grep "bottom-tab-bar" frontend/src/components/BottomTabBar.tsx`
Expected: className="bottom-tab-bar"

**Step 3: Commit**

```bash
git add frontend/src/components/BottomTabBar.tsx
git commit -m "feat: add BottomTabBar component for mobile navigation"
```

---

## Task 4: Create MobileHeader Component

**Files:**
- Create: `frontend/src/components/MobileHeader.tsx`

**Step 1: Create the component**

```tsx
import { useNavigate, useLocation } from 'react-router-dom';

interface MobileHeaderProps {
  title: string;
  showBack?: boolean;
  onSearch?: () => void;
  onEdit?: () => void;
  onRecenter?: () => void;
}

export function MobileHeader({
  title,
  showBack = false,
  onSearch,
  onEdit,
  onRecenter
}: MobileHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <header className="mobile-header">
      <div className="mobile-header-left">
        {showBack && (
          <button className="mobile-header-btn" onClick={handleBack} aria-label="Go back">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        )}
      </div>

      <h1 className="mobile-header-title">{title}</h1>

      <div className="mobile-header-right">
        {onSearch && (
          <button className="mobile-header-btn" onClick={onSearch} aria-label="Search">
            <span className="material-symbols-outlined">search</span>
          </button>
        )}
        {onEdit && (
          <button className="mobile-header-btn" onClick={onEdit} aria-label="Edit">
            <span className="material-symbols-outlined">edit</span>
          </button>
        )}
        {onRecenter && (
          <button className="mobile-header-btn" onClick={onRecenter} aria-label="Recenter map">
            <span className="material-symbols-outlined">my_location</span>
          </button>
        )}
      </div>
    </header>
  );
}
```

**Step 2: Verify file exists**

Run: `grep "mobile-header" frontend/src/components/MobileHeader.tsx`
Expected: className="mobile-header"

**Step 3: Commit**

```bash
git add frontend/src/components/MobileHeader.tsx
git commit -m "feat: add MobileHeader component with contextual actions"
```

---

## Task 5: Add Mobile CSS Styles

**Files:**
- Modify: `frontend/src/index.css` (append to end)

**Step 1: Add mobile styles**

Append to end of `frontend/src/index.css`:

```css
/* ============================================================
   Mobile Responsive Styles (≤768px)
   ============================================================ */

/* Hide sidebar on mobile */
@media (max-width: 768px) {
  .sidebar {
    display: none;
  }

  .app-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .main-content {
    flex: 1;
    padding-bottom: calc(56px + env(safe-area-inset-bottom));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* Adjust page content for mobile */
  .page-content {
    padding: 1rem;
  }

  /* Hide desktop header elements that mobile header replaces */
  .top-header {
    display: none;
  }
}

/* Mobile Header */
.mobile-header {
  display: none;
}

@media (max-width: 768px) {
  .mobile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 0.5rem;
    padding-top: env(safe-area-inset-top);
    background: var(--stitch-card-bg);
    border-bottom: 1px solid var(--stitch-border);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .mobile-header-left,
  .mobile-header-right {
    display: flex;
    align-items: center;
    min-width: 48px;
  }

  .mobile-header-right {
    justify-content: flex-end;
  }

  .mobile-header-title {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    text-align: center;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-header-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    background: transparent;
    color: var(--stitch-text-main);
    cursor: pointer;
    border-radius: 50%;
    -webkit-tap-highlight-color: transparent;
  }

  .mobile-header-btn:active {
    background: var(--stitch-background);
  }

  .mobile-header-btn .material-symbols-outlined {
    font-size: 24px;
  }
}

/* Bottom Tab Bar */
.bottom-tab-bar {
  display: none;
}

@media (max-width: 768px) {
  .bottom-tab-bar {
    display: flex;
    align-items: flex-end;
    justify-content: space-around;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: calc(56px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--stitch-card-bg);
    border-top: 1px solid var(--stitch-border);
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
    z-index: 1000;
  }

  .tab-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    height: 56px;
    padding: 6px 0;
    text-decoration: none;
    color: var(--stitch-text-secondary);
    -webkit-tap-highlight-color: transparent;
    transition: color 0.15s ease;
  }

  .tab-item .material-symbols-outlined {
    font-size: 24px;
  }

  .tab-label {
    font-size: 10px;
    margin-top: 2px;
    font-weight: 500;
  }

  .tab-item.active {
    color: var(--stitch-primary);
  }

  .tab-add-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    margin-top: -12px;
    border: none;
    border-radius: 50%;
    background: var(--stitch-primary);
    color: white;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(95, 39, 227, 0.3);
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .tab-add-button:active {
    transform: scale(0.95);
    box-shadow: 0 2px 8px rgba(95, 39, 227, 0.3);
  }

  .tab-add-button .material-symbols-outlined {
    font-size: 28px;
  }
}

/* Mobile touch optimizations */
@media (max-width: 768px) {
  /* Larger touch targets */
  .contact-row {
    min-height: 56px;
    padding: 12px 16px;
  }

  /* Prevent text selection on tap */
  .tab-item,
  .tab-add-button,
  .mobile-header-btn {
    user-select: none;
    -webkit-user-select: none;
  }

  /* Smooth scrolling */
  .main-content,
  .contact-list-container {
    overscroll-behavior: contain;
  }
}
```

**Step 2: Verify styles added**

Run: `grep "bottom-tab-bar" frontend/src/index.css | head -3`
Expected: Lines with .bottom-tab-bar styles

**Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add mobile responsive CSS styles"
```

---

## Task 6: Update Layout Component for Mobile

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

**Step 1: Update Layout.tsx with mobile support**

Replace entire contents of `frontend/src/components/Layout.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomTabBar } from './BottomTabBar';
import { useIsMobile } from '../hooks/useIsMobile';

type AppView = 'contacts' | 'merge' | 'cleanup' | 'archived' | 'groups' | 'map' | 'settings';

const pathToView: Record<string, AppView> = {
  '/contacts': 'contacts',
  '/merge': 'merge',
  '/cleanup': 'cleanup',
  '/archived': 'archived',
  '/groups': 'groups',
  '/map': 'map',
  '/settings': 'settings',
};

const viewToLayoutClass: Record<AppView, string> = {
  contacts: 'app-layout',
  merge: 'app-layout dedup-layout',
  cleanup: 'app-layout cleanup-layout',
  archived: 'app-layout archived-layout',
  groups: 'app-layout groups-layout',
  map: 'app-layout map-layout',
  settings: 'app-layout settings-layout',
};

// Routes that are not accessible on mobile
const DESKTOP_ONLY_ROUTES = ['/merge', '/cleanup', '/archived'];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [modalOpen, setModalOpen] = useState(false);

  const currentView = pathToView[location.pathname] || 'contacts';
  const layoutClass = viewToLayoutClass[currentView];

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

  // Escape key navigation - navigate to home unless a modal is open
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
    <div className={layoutClass}>
      {!isMobile && <Sidebar currentView={currentView} />}
      <main className="main-content">
        <Outlet context={{ setModalOpen: handleSetModalOpen, isMobile }} />
      </main>
      {isMobile && <BottomTabBar />}
    </div>
  );
}

// Hook for child components to signal modal state
export function useLayoutModal() {
  return {
    setModalOpen: (open: boolean) => {
      window.dispatchEvent(new CustomEvent('layout-modal-change', { detail: { open } }));
    }
  };
}
```

**Step 2: Verify changes**

Run: `grep "useIsMobile" frontend/src/components/Layout.tsx`
Expected: Import and usage of useIsMobile hook

**Step 3: Commit**

```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat: update Layout to conditionally render mobile/desktop navigation"
```

---

## Task 7: Update ContactsPage with Mobile Header

**Files:**
- Modify: `frontend/src/components/ContactsPage.tsx`

**Step 1: Read current file**

First, check current contents of ContactsPage.tsx

**Step 2: Update ContactsPage.tsx**

Replace contents of `frontend/src/components/ContactsPage.tsx`:

```tsx
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ContactList } from './ContactList';
import { MobileHeader } from './MobileHeader';
import { useIsMobile } from '../hooks/useIsMobile';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

export function ContactsPage() {
  const { isMobile } = useOutletContext<OutletContext>();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const handleSearchToggle = () => {
    setMobileSearchOpen(!mobileSearchOpen);
  };

  return (
    <>
      {isMobile && (
        <MobileHeader
          title="All Contacts"
          onSearch={handleSearchToggle}
        />
      )}
      <ContactList mobileSearchOpen={mobileSearchOpen} />
    </>
  );
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/ContactsPage.tsx
git commit -m "feat: add mobile header to ContactsPage"
```

---

## Task 8: Update ContactList for Mobile Search

**Files:**
- Modify: `frontend/src/components/ContactList.tsx`

**Step 1: Update ContactList props and search behavior**

Add `mobileSearchOpen` prop to ContactList. Find the component definition and update it.

At the top of the component, add the prop:

```tsx
interface ContactListProps {
  mobileSearchOpen?: boolean;
}

export function ContactList({ mobileSearchOpen = false }: ContactListProps) {
```

Find the search input section and wrap it to show on mobile when mobileSearchOpen is true:

```tsx
// Update the search section's className or wrapper
<div className={`search-container ${mobileSearchOpen ? 'mobile-search-open' : ''}`}>
```

**Step 2: Add mobile search CSS to index.css**

Append to mobile section in index.css:

```css
/* Mobile search */
@media (max-width: 768px) {
  .search-container {
    display: none;
  }

  .search-container.mobile-search-open {
    display: block;
    position: fixed;
    top: calc(56px + env(safe-area-inset-top));
    left: 0;
    right: 0;
    padding: 0.75rem 1rem;
    background: var(--stitch-card-bg);
    border-bottom: 1px solid var(--stitch-border);
    z-index: 99;
  }

  .search-container.mobile-search-open input {
    width: 100%;
  }
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/ContactList.tsx frontend/src/index.css
git commit -m "feat: add mobile search toggle to ContactList"
```

---

## Task 9: Update ContactDetailPage for Mobile

**Files:**
- Modify: `frontend/src/components/ContactDetailPage.tsx`

**Step 1: Update ContactDetailPage with MobileHeader**

Replace contents of `frontend/src/components/ContactDetailPage.tsx`:

```tsx
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useContactDetail } from '../api/hooks';
import { ContactRowExpanded } from './ContactRowExpanded';
import { Avatar } from './Avatar';
import { MobileHeader } from './MobileHeader';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isMobile } = useOutletContext<OutletContext>();
  const contactId = id ? parseInt(id, 10) : null;

  const { data: contact, isLoading, error } = useContactDetail(contactId);

  const handleBack = () => {
    navigate('/contacts');
  };

  const handleEdit = () => {
    // TODO: Navigate to edit page when implemented
    console.log('Edit contact:', contactId);
  };

  if (isLoading) {
    return (
      <>
        {isMobile ? (
          <MobileHeader title="Contact" showBack />
        ) : (
          <header className="top-header">
            <div className="page-header">
              <button className="back-button" onClick={handleBack}>
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <h1>Contact</h1>
            </div>
          </header>
        )}
        <div className="page-content">
          <div className="loading-state">
            <span aria-busy="true">Loading contact...</span>
          </div>
        </div>
      </>
    );
  }

  if (error || !contact) {
    return (
      <>
        {isMobile ? (
          <MobileHeader title="Contact" showBack />
        ) : (
          <header className="top-header">
            <div className="page-header">
              <button className="back-button" onClick={handleBack}>
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <h1>Contact</h1>
            </div>
          </header>
        )}
        <div className="page-content">
          <div className="error-state">
            {error ? `Error loading contact: ${error.message}` : 'Contact not found'}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {isMobile ? (
        <MobileHeader
          title={contact.displayName}
          showBack
          onEdit={handleEdit}
        />
      ) : (
        <header className="top-header">
          <div className="page-header">
            <button className="back-button" onClick={handleBack}>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1>{contact.displayName}</h1>
          </div>
        </header>
      )}

      <div className="page-content">
        <div className="contact-detail-content">
          <div className="contact-detail-identity">
            <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={96} />
            <div className="contact-detail-name-section">
              <h2 className="contact-detail-name">{contact.displayName}</h2>
              {contact.company && (
                <p className="contact-detail-company">{contact.company}</p>
              )}
            </div>
          </div>

          <ContactRowExpanded contact={contact} />
        </div>
      </div>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ContactDetailPage.tsx
git commit -m "feat: add mobile header to ContactDetailPage"
```

---

## Task 10: Update MapView for Mobile

**Files:**
- Modify: `frontend/src/components/MapView.tsx`

**Step 1: Add MobileHeader to MapView**

Add import at top:
```tsx
import { MobileHeader } from './MobileHeader';
import { useOutletContext } from 'react-router-dom';
```

Add outlet context and recenter handler:
```tsx
const { isMobile } = useOutletContext<{ isMobile: boolean }>();

const handleRecenter = () => {
  // Recenter map to default position or user location
  // Implementation depends on existing map logic
};
```

Add MobileHeader at start of return:
```tsx
{isMobile && (
  <MobileHeader
    title="Map"
    onRecenter={handleRecenter}
  />
)}
```

**Step 2: Commit**

```bash
git add frontend/src/components/MapView.tsx
git commit -m "feat: add mobile header to MapView"
```

---

## Task 11: Update GroupsView for Mobile

**Files:**
- Modify: `frontend/src/components/GroupsView.tsx`

**Step 1: Add MobileHeader to GroupsView**

Add import at top:
```tsx
import { MobileHeader } from './MobileHeader';
import { useOutletContext } from 'react-router-dom';
```

Add outlet context:
```tsx
const { isMobile } = useOutletContext<{ isMobile: boolean }>();
```

Add MobileHeader at start of return:
```tsx
{isMobile && <MobileHeader title="Groups" />}
```

**Step 2: Commit**

```bash
git add frontend/src/components/GroupsView.tsx
git commit -m "feat: add mobile header to GroupsView"
```

---

## Task 12: Update SettingsView for Mobile

**Files:**
- Modify: `frontend/src/components/SettingsView.tsx`

**Step 1: Add MobileHeader to SettingsView**

Add import at top:
```tsx
import { MobileHeader } from './MobileHeader';
import { useOutletContext } from 'react-router-dom';
```

Add outlet context:
```tsx
const { isMobile } = useOutletContext<{ isMobile: boolean }>();
```

Add MobileHeader at start of return:
```tsx
{isMobile && <MobileHeader title="Settings" />}
```

**Step 2: Commit**

```bash
git add frontend/src/components/SettingsView.tsx
git commit -m "feat: add mobile header to SettingsView"
```

---

## Task 13: Update AddContactPage for Mobile

**Files:**
- Modify: `frontend/src/components/AddContactPage.tsx`

**Step 1: Add MobileHeader to AddContactPage**

Add import at top:
```tsx
import { MobileHeader } from './MobileHeader';
import { useOutletContext } from 'react-router-dom';
```

Add outlet context:
```tsx
const { isMobile } = useOutletContext<{ isMobile: boolean }>();
```

Replace the existing header with conditional rendering:
```tsx
{isMobile ? (
  <MobileHeader title="Add Contact" showBack />
) : (
  <header className="top-header">
    {/* existing desktop header */}
  </header>
)}
```

**Step 2: Commit**

```bash
git add frontend/src/components/AddContactPage.tsx
git commit -m "feat: add mobile header to AddContactPage"
```

---

## Task 14: Build and Test

**Step 1: Run TypeScript check**

Run: `cd frontend && npm run build`
Expected: Build completes without errors

**Step 2: Start dev server and test**

Run: `npm run dev`

Test checklist:
- [ ] Open browser, resize to ≤768px
- [ ] Sidebar hidden, bottom tab bar visible
- [ ] Tabs navigate: Contacts, Map, Groups, Settings
- [ ] Center + button opens Add Contact
- [ ] Mobile headers show on each page
- [ ] Contacts page search icon works
- [ ] Contact detail shows back button and edit
- [ ] Visiting /merge, /cleanup, /archived redirects to /contacts
- [ ] Resize to >768px: sidebar returns, tab bar hidden

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete mobile responsive implementation"
```

---

## Verification Summary

1. Viewport ≤768px: Mobile layout active
2. Sidebar hidden, bottom tab bar with 4 tabs + center add button
3. Mobile header with title and contextual actions per page
4. Desktop-only routes redirect to /contacts
5. Touch targets meet 44px minimum
6. Safe areas respected on notched devices

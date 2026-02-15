# Mobile-Friendly Responsive Design

**Status:** Planned
**Date:** 2026-02-04

## Summary

Add mobile-friendly responsive layout with bottom tab navigation, mobile header, and touch-optimized interactions. Merge and Cleanup features are desktop-only.

---

## Breakpoint Strategy

- **≤768px**: Mobile layout (bottom tab bar, mobile header)
- **>768px**: Desktop layout (current sidebar)

---

## Layout Structure

```
┌─────────────────────────┐
│  Header (title + actions)│  ← Fixed top
├─────────────────────────┤
│                         │
│                         │
│     Page Content        │  ← Scrollable
│                         │
│                         │
├─────────────────────────┤
│ 📇  🗺️  [＋]  👥  ⚙️  │  ← Fixed bottom tab bar
└─────────────────────────┘
```

**Hidden on Mobile**
- Entire sidebar (replaced by bottom tabs)
- Merge and Cleanup nav items (not accessible)
- Dashboard and Favorites (placeholder items, not implemented)
- Archived (accessible only on desktop)

---

## Bottom Tab Bar

**Visual Design**
```
┌──────────────────────────────────────────┐
│                                          │
│  Contacts    Map    ╭──╮   Groups  Settings
│    📇       🗺️    │＋│    👥      ⚙️
│                    ╰──╯
│   active          raised
│    ●
└──────────────────────────────────────────┘
```

**Specifications**
- Height: 56px (plus safe area padding for notched phones)
- Background: White with subtle top border/shadow
- Icons: Material Symbols, 24px
- Labels: 10-11px below icons
- Active state: Primary purple color (`--stitch-primary`)
- Inactive: Gray (`--stitch-text-secondary`)

**Center "Add" Button**
- Raised 12px above the tab bar
- 56px circular button
- Primary purple background, white plus icon
- Subtle shadow for depth
- Tapping navigates to `/contacts/new` (Add Contact page)

**Safe Area Handling**
- `padding-bottom: env(safe-area-inset-bottom)` for iPhone notch/home indicator
- Tab bar sits above the safe area, not behind it

---

## Mobile Header

**Visual Design**
```
┌──────────────────────────────────────────┐
│  ◀  All Contacts                    🔍  │  ← Contacts page
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│      Map                            📍  │  ← Map page (recenter)
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│      Groups                              │  ← Groups page (no actions)
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│      Settings                            │  ← Settings page (no actions)
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│  ◀  John Smith                      ✏️  │  ← Contact detail (back + edit)
└──────────────────────────────────────────┘
```

**Specifications**
- Height: 56px (plus safe area padding at top)
- Background: White with subtle bottom border
- Title: 18px semibold, centered (or left-aligned if back button present)
- Back button: Shows on sub-pages (contact detail, add contact)
- Action icons: 24px, right-aligned

**Contextual Actions by Page**
| Page | Actions |
|------|---------|
| Contacts | Search icon (opens search bar) |
| Map | Recenter/location icon |
| Groups | None |
| Settings | None |
| Contact Detail | Edit icon |
| Add Contact | None (has Save in form) |

---

## Page Adaptations

**Contacts List**
- Full-width cards, no sidebar taking space
- Contact rows: Avatar + Name + Company (phone/email hidden to save space)
- Tap row → navigate to contact detail page
- Search: Header icon reveals a full-width search input that slides down
- Pull-to-refresh support (nice-to-have)

**Contact Detail**
- Full-screen view (not the current expandable row)
- Sections stack vertically: Info, Phones, Emails, Addresses, etc.
- Tap phone → opens dialer (`tel:` link)
- Tap email → opens mail client (`mailto:` link)
- Tap address → opens in Maps app (Google Maps deep link)
- Edit button in header → navigates to edit form

**Map**
- Full viewport (minus header and tab bar)
- Touch gestures for pan/zoom
- Tap marker → shows contact name bubble, tap bubble → contact detail

**Groups**
- Simple list of group names with contact counts
- Tap group → filtered contacts list

**Settings**
- Same as desktop but full-width
- User profile at top, options below

---

## Route Protection

**Hidden Routes on Mobile**
When viewport is ≤768px, these routes redirect to `/contacts`:
- `/merge`
- `/cleanup`
- `/archived`

**Implementation**
```tsx
// New hook: useIsMobile()
const isMobile = useIsMobile(); // true when ≤768px

// In router or Layout component
if (isMobile && ['/merge', '/cleanup', '/archived'].includes(path)) {
  redirect('/contacts');
}
```

**Why redirect instead of just hiding nav?**
- Users might bookmark or share desktop URLs
- Prevents broken experience if someone resizes browser
- Clean behavior: mobile users simply can't access those features

**Handling Resize**
- If user resizes from desktop to mobile while on /merge → redirect to /contacts
- If user resizes from mobile to desktop → sidebar appears, all routes accessible

---

## Touch & CSS Best Practices

**Touch Targets**
- Minimum 44x44px for all tappable elements (Apple HIG)
- Tab bar icons: 48px touch area
- List rows: Full-width tap target, minimum 56px height
- Action buttons: 44px minimum

**CSS Considerations**
```css
/* Prevent tap highlight on iOS */
-webkit-tap-highlight-color: transparent;

/* Smooth scrolling */
-webkit-overflow-scrolling: touch;

/* Prevent pull-to-refresh interfering with scroll */
overscroll-behavior: contain;

/* Safe areas for notched devices */
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
```

**Performance**
- Use `transform` for animations (GPU accelerated)
- Avoid `position: fixed` jank with `will-change: transform`
- Debounce resize listener for breakpoint detection

**Viewport Meta** (verify in index.html)
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `frontend/src/components/BottomTabBar.tsx` | Bottom navigation with 4 tabs + center add button |
| `frontend/src/components/MobileHeader.tsx` | Page header with title and contextual actions |
| `frontend/src/hooks/useIsMobile.ts` | Hook to detect ≤768px viewport |

## Files to Modify

| File | Changes |
|------|---------|
| `frontend/src/components/Layout.tsx` | Conditionally render sidebar vs mobile layout |
| `frontend/src/index.css` | Mobile styles, hide sidebar at ≤768px, tab bar styles |
| `frontend/src/components/ContactList.tsx` | Simplified row display for mobile |
| `frontend/src/components/ContactDetailPage.tsx` | Full-screen mobile view with tap actions |
| `frontend/index.html` | Verify/add viewport meta tag with `viewport-fit=cover` |

---

## Verification

1. Run `npm run dev`
2. Open browser dev tools, toggle device mode (or resize to ≤768px)
3. Verify:
   - Sidebar hidden, bottom tab bar visible
   - Header shows page title with contextual actions
   - Tabs navigate correctly: Contacts, Map, Groups, Settings
   - Center plus button opens Add Contact page
   - Visiting /merge, /cleanup, /archived redirects to /contacts
   - Contact list rows are tappable, lead to detail page
   - Detail page has back button, edit action, tap-to-call/email/map
   - Safe areas respected on iPhone simulator

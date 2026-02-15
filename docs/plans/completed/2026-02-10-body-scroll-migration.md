# Body Scroll Migration

**Date:** 2026-02-10
**Status:** In Progress

## Problem

The app uses nested scroll containers (`.main-content` with `overflow-y: auto` and `.virtual-scroll-container` inside it). This means scrolling only works when the mouse is directly over the content area. Users can't scroll when their mouse is over the nav rail or header.

## Solution

Switch to native body scrolling with fixed header and nav rail. This is the standard pattern used by modern apps (Gmail, Linear, Notion).

## Changes

### CSS (`index.css`)

1. **`.page-header`** — `position: fixed; top: 0; left: 0; width: 100%; z-index: var(--ds-z-fixed); background: white;`
2. **`.app-body`** — Add `padding-top: var(--ds-header-height)` to clear fixed header
3. **`.nav-rail`** — `position: fixed; left: 0; top: var(--ds-header-height); height: calc(100vh - var(--ds-header-height));` Remove `flex: 1` and `padding-top: 260px`
4. **`.main-content`** — Remove `overflow-y: auto` and `height` constraint. Add `margin: 0 auto` for centering (since nav-rail is out of flow)
5. **`.virtual-scroll-container`** — Delete entirely
6. **`.contact-grid`** — Remove `max-height` and `overflow-y: auto`
7. **`.contact-list-actions`** — Add `position: sticky; top: var(--ds-header-height); z-index: var(--ds-z-sticky); background: white;`
8. **Mobile (≤768px)** — Remove `overflow-y: auto` from `.main-content`, keep `padding-bottom` for bottom tab bar

### ContactList.tsx

1. Switch `useVirtualizer` → `useWindowVirtualizer`
2. Remove `getScrollElement` (window virtualizer uses window automatically)
3. Keep `parentRef` on list container div for `scrollMargin` measurement
4. Add `scrollMargin: parentRef.current?.offsetTop ?? 0`
5. Update transforms: `virtualRow.start - virtualizer.options.scrollMargin`

### Layout.tsx

No structural changes needed. Nav rail stays in DOM but CSS makes it fixed/out of flow.

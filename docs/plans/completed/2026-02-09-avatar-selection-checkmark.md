# Replace Checkbox Selection with Avatar Overlay Checkmark

**Status:** Proposed
**Date:** 2026-02-09
**Figma:** node `190:5368`

## Summary

Replace the native HTML checkbox next to contact cards with a custom checkmark badge overlaid on the top-left corner of the avatar. Three visual states:

1. **Default** — No checkmark visible (clean avatar)
2. **Hover** — Grey checkmark icon appears at top-left of avatar (unselected hover)
3. **Selected** — Blue checkmark icon (#2563EB) at top-left of avatar, card gets 2px `#DBEAFE` border

## Figma Design Spec

From the screenshot, three card states are shown top-to-bottom:

| State | Avatar badge | Card border |
|-------|-------------|-------------|
| Default (no hover) | Hidden | `1px solid #E5E7EB` (normal) |
| Hover (unselected) | 16px grey circle-check icon, positioned top-left of avatar, offset `left: -3.5px; top: -2px` | Normal + hover shadow |
| Selected | 16px blue (#2563EB) circle-check icon, same position | `2px solid #DBEAFE` outer border wrapper |

**Badge specs from Figma:**
- Size: 16x16px
- Position: absolute, `left: -3.5px`, `top: -2px` relative to avatar container
- Icon: Font Awesome `circle-check` (solid)
- Hover/unselected color: `#9CA3AF` (grey)
- Selected color: `var(--ds-color-info)` = `#2563EB`
- Cursor: pointer
- `overflow: clip` on the badge (so it doesn't bleed outside the clipping area)

**Selected card border:**
- Outer wrapper: `border: 2px solid #DBEAFE` (`var(--ds-color-info-light)`), `border-radius: 8px`

## Files to Modify

### 1. `frontend/src/components/Avatar.tsx`

Add an optional selection overlay to the Avatar component.

**New props:**
```typescript
interface AvatarProps {
  photoUrl: string | null;
  name: string;
  size?: number;
  className?: string;
  selectable?: boolean;       // NEW: enables selection badge
  isSelected?: boolean;       // NEW: selected state
  onToggleSelect?: () => void; // NEW: click handler for badge
}
```

**New rendering:** When `selectable` is true, wrap the avatar in a `position: relative` container and render an absolutely-positioned checkmark badge. The badge:
- Is always in the DOM when `selectable=true` (for CSS transition purposes)
- Has class `.avatar-select-badge`
- Has additional class `.avatar-select-badge--visible` on hover (applied to parent) or when `isSelected=true`
- Has additional class `.avatar-select-badge--selected` when `isSelected=true`
- Uses `<Icon name="circle-check" />` (Font Awesome solid)
- Calls `onToggleSelect()` on click (with `e.stopPropagation()`)

**Implementation approach:**

```tsx
export function Avatar({ photoUrl, name, size = 48, className = '', selectable = false, isSelected = false, onToggleSelect }: AvatarProps) {
  const style: React.CSSProperties = { ... };

  const avatarEl = (
    <div className={`avatar ${className}`} style={style}>
      {photoUrl ? <img ... /> : getInitials(name)}
    </div>
  );

  if (!selectable) return avatarEl;

  return (
    <div className="avatar-wrapper">
      {avatarEl}
      <button
        className={`avatar-select-badge ${isSelected ? 'avatar-select-badge--selected' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
        aria-label={isSelected ? 'Deselect contact' : 'Select contact'}
      >
        <Icon name="circle-check" />
      </button>
    </div>
  );
}
```

### 2. `frontend/src/components/ContactRow.tsx`

**Remove:** The `contact-card-checkbox` div and native `<input type="checkbox">` (lines 34-43).

**Update Avatar call** to pass selection props:

```tsx
<Avatar
  photoUrl={contact.photoUrl}
  name={contact.displayName}
  size={48}
  selectable={selectionEnabled}
  isSelected={isSelected}
  onToggleSelect={() => onToggleSelect?.(contact.id)}
/>
```

**Update card selected class:** Change from `selected` to use the new info-light border style. The `.contact-card.selected` class remains but its CSS changes (see CSS section).

### 3. `frontend/src/components/ContactGridCard.tsx`

**Remove:** The `contact-grid-card-checkbox` div and native `<input type="checkbox">` (lines 22-30).

**Update Avatar call** to pass selection props:

```tsx
<Avatar
  photoUrl={contact.photoUrl}
  name={contact.displayName}
  size={64}
  selectable={selectionEnabled}
  isSelected={isSelected}
  onToggleSelect={() => onToggleSelect?.(contact.id)}
/>
```

### 4. `frontend/src/index.css`

**Add new avatar selection styles:**

```css
/* Avatar selection overlay */
.avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.avatar-select-badge {
  position: absolute;
  top: -2px;
  left: -3.5px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 1;
  overflow: clip;
}

.avatar-select-badge [class*="fa-"] {
  font-size: 16px;
  color: #9CA3AF;
}

/* Show badge on card hover (grey) */
.contact-card:hover .avatar-select-badge,
.contact-grid-card:hover .avatar-select-badge {
  opacity: 1;
}

/* Selected state: always visible, blue */
.avatar-select-badge--selected {
  opacity: 1;
}

.avatar-select-badge--selected [class*="fa-"] {
  color: var(--ds-color-info);
}
```

**Update card selected styles:**

```css
/* Replace old selected styles */
.contact-card.selected {
  border-color: var(--ds-color-info-light);
  box-shadow: 0 0 0 2px var(--ds-color-info-light);
}

.contact-grid-card.selected {
  box-shadow: 0 0 0 2px var(--ds-color-info-light);
}
```

**Remove old checkbox styles:**

```css
/* DELETE these blocks: */
.contact-card-checkbox { ... }
.contact-card-checkbox input[type="checkbox"] { ... }
.contact-grid-card-checkbox { ... }
.contact-grid-card-checkbox input[type="checkbox"] { ... }
```

## Behavioral Notes

- **Hover to reveal:** The checkmark badge only appears when the user hovers over the contact card row/grid card. Once selected, it stays visible regardless of hover.
- **Click target:** The badge button itself is the click target (16x16). The card click handler still handles row expansion. `e.stopPropagation()` on the badge prevents row toggle.
- **No checkbox in DOM:** The native checkbox is fully removed. The `selectionEnabled` prop on ContactRow/ContactGridCard still controls whether the badge appears.
- **Accessibility:** The badge is a `<button>` with `aria-label` for screen readers.
- **Grid view:** Same behavior — badge appears on top-left of the 64px avatar on hover.

## Verification

1. `cd frontend && npm run build` — TypeScript compiles
2. Hover over a contact card → grey circle-check appears at top-left of avatar
3. Click the badge → card gets info-light border, badge turns info blue
4. Click again → deselects, border reverts, badge hides (until hover)
5. Bulk operations (delete, archive, merge) still work with selected contacts
6. Grid view: same hover/select behavior on avatar
7. Select All / Select None still works from the toolbar

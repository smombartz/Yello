# Drag-to-Reorder Contact Details Design

**Issue:** M-62 - Drag Contact Details to change order and make primary

## Overview

Enable users to drag contact detail blocks (emails, phones, addresses, etc.) within edit mode to reorder them. Moving an item to the first position automatically makes it primary and updates the visual label accordingly.

## Requirements

1. **Scope:** Edit mode only (not view mode)
2. **Affected Detail Types:** All detail sections
   - Phones
   - Emails
   - Addresses
   - Social Profiles
   - URLs
   - Related People
   - Categories
   - Instant Messages

3. **Primary Status:**
   - First item in each section is automatically primary
   - Moving item to position 1 sets `isPrimary = true`
   - Previous primary item loses primary status
   - Visual label shows which item is primary

4. **Visual Feedback:**
   - Highlight item being dragged (opacity/ghost effect)
   - Show drop zone indicator when hovering over valid drop targets
   - Smooth state transitions

## Technical Approach

### Implementation Strategy

**Use HTML5 Drag & Drop API** (not a library) because:
- No new dependencies required
- Straightforward list reordering
- Native browser support
- CSS provides visual feedback

### Component Structure

1. **Create `DraggableDetailItem` wrapper component**
   - Wraps each detail item (phone, email, etc.)
   - Handles `draggable`, `onDragStart`, `onDragEnd` events
   - Manages visual state (dragging, dragover)

2. **Enhance all detail sections** (PhoneSection, EmailSection, etc.)
   - Add `onReorder` callback to handle array reordering
   - Use `DraggableDetailItem` to wrap each item in edit mode
   - Auto-update `isPrimary` on drop

3. **State Management**
   - Dragging state: which item index is being dragged
   - DropZone state: where will the item land
   - Both stored in component local state (since edits aren't persisted until save)

### Data Flow

```
EditForm state (array of details)
         ↓
PhoneSection (isEditMode=true)
         ↓
DraggableDetailItem (for each phone)
         ↓
onDragStart → set draggedIndex
onDragOver  → set dropZoneIndex, highlight
onDrop      → reorder array, update isPrimary, call onEditStateChange
onDragEnd   → clear dragging state
```

### Key Implementation Details

**Primary Status Logic:**
```typescript
// After reordering:
items.forEach((item, index) => {
  item.isPrimary = (index === 0);
});
```

**CSS Classes for Visual Feedback:**
- `.dragging` - semi-transparent, reduced opacity on the dragged item
- `.drag-over` - highlight the drop zone (border, background color)
- `.dragging-primary-item` - special styling if primary item is being dragged

**Accessible Markup:**
- Use `draggable="true"` on detail items
- Add data attributes to identify item index
- Maintain keyboard focus management

## Files to Modify

### Frontend
1. `frontend/src/components/ContactFormSections.tsx`
   - Add `DraggableDetailItem` helper component
   - Update PhoneSection, EmailSection, LocationsSection, SocialLinksSection, UrlsSection, RelatedPeopleSection, CategoriesSection, InstantMessagesSection
   - Add reorder logic to each section

2. `frontend/src/styles/` (or inline CSS)
   - Add `.dragging`, `.drag-over` classes
   - Add smooth transitions for visual feedback

### No Backend Changes
- Reordering happens only in edit mode (local state)
- When user clicks Save, the updated array is sent to backend
- Backend already handles `isPrimary` field

## Testing Strategy

1. **Functional Tests:**
   - Drag phone 3 to position 1 → verify order changes and isPrimary updates
   - Drag email 2 to position 1 → verify previous primary loses status
   - Drag to same position → no change
   - Drag each detail type (addresses, URLs, etc.) → all work

2. **Visual Tests:**
   - Dragged item shows as semi-transparent
   - Drop zone is highlighted during drag
   - Visual label updates to show primary status

3. **Edge Cases:**
   - Single item (can't reorder, but should still work)
   - Many items (scrolling + dragging)
   - Dragging back to original position

## Success Criteria

✅ User can drag detail items to reorder them in edit mode
✅ First position item is automatically marked as primary
✅ Visual feedback shows dragged item and drop zone
✅ All detail types support reordering
✅ Save button persists the reordered list with updated isPrimary
✅ No new dependencies added

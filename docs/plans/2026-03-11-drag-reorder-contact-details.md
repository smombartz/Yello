# Drag-to-Reorder Contact Details Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to drag contact detail items (phones, emails, addresses, etc.) in edit mode to reorder them, automatically setting the first item as primary.

**Architecture:** Use HTML5 Drag & Drop API with a reusable `DraggableArrayItem` component wrapper. Each detail section (PhoneSection, EmailSection, etc.) will handle drag events and manage array reordering with auto-updated `isPrimary` flags. Visual feedback via CSS classes for dragging and drop zones.

**Tech Stack:** React, TypeScript, HTML5 Drag & Drop API, CSS

---

## Task 1: Create DraggableArrayItem Wrapper Component

**Files:**
- Modify: `frontend/src/components/ContactFormSections.tsx`

**Description:** Add a new wrapper component `DraggableArrayItem` that handles all drag & drop logic. This replaces the current `EditableArrayItem` in edit mode when dragging is enabled.

**Step 1: Add DraggableArrayItem component code**

After the imports and before `EditableArrayItem`, add:

```typescript
interface DraggableArrayItemProps {
  index: number;
  itemKey: string;
  isDragging: boolean;
  draggedIndex: number | null;
  dropZoneIndex: number | null;
  onDragStart: (index: number) => void;
  onDragEnd: () => void;
  onDragOver: (index: number) => void;
  onDrop: (fromIndex: number, toIndex: number) => void;
  onRemove: () => void;
  children: React.ReactNode;
}

function DraggableArrayItem({
  index,
  itemKey,
  isDragging,
  draggedIndex,
  dropZoneIndex,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onRemove,
  children,
}: DraggableArrayItemProps) {
  const isCurrentlyDragging = draggedIndex === index;
  const isDropZone = dropZoneIndex === index;

  return (
    <div
      draggable
      key={itemKey}
      className={`draggable-array-item ${isCurrentlyDragging ? 'dragging' : ''} ${isDropZone ? 'drag-over' : ''}`}
      onDragStart={() => onDragStart(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault(); // Allow drop
        onDragOver(index);
      }}
      onDrop={() => {
        if (draggedIndex !== null && draggedIndex !== index) {
          onDrop(draggedIndex, index);
        }
      }}
      onDragLeave={(e) => {
        // Only clear if leaving the entire item
        if (e.currentTarget === e.target) {
          onDragOver(-1);
        }
      }}
    >
      {/* Use EditableArrayItem for UI, but inside draggable container */}
      <EditableArrayItem onRemove={onRemove}>
        {children}
      </EditableArrayItem>
    </div>
  );
}
```

**Step 2: Verify syntax and component exports**

Make sure the component is defined in the file and can be imported. Don't commit yet.

**Step 3: Commit**

```bash
git add frontend/src/components/ContactFormSections.tsx
git commit -m "feat: add DraggableArrayItem wrapper component for drag-drop support"
```

---

## Task 2: Add Drag State Hook

**Files:**
- Modify: `frontend/src/components/ContactFormSections.tsx`

**Description:** Add a custom hook `useDragState` to manage dragging and drop zone state for any detail section.

**Step 1: Add useDragState hook**

After imports, add:

```typescript
function useDragState() {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropZoneIndex, setDropZoneIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDropZoneIndex(null);
  };

  const handleDragOver = (index: number) => {
    setDropZoneIndex(index);
  };

  const handleDrop = <T extends { isPrimary?: boolean }>(
    fromIndex: number,
    toIndex: number,
    items: T[],
    onItemsChange: (items: T[]) => void
  ) => {
    const updated = [...items];
    const [movedItem] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, movedItem);

    // Update isPrimary: first item is always primary
    updated.forEach((item, idx) => {
      if ('isPrimary' in item) {
        item.isPrimary = idx === 0;
      }
    });

    onItemsChange(updated);
    handleDragEnd();
  };

  return {
    draggedIndex,
    dropZoneIndex,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
  };
}
```

**Step 2: Verify hook logic**

The hook manages dragging state and handles reordering with isPrimary auto-update. Check that it's syntactically correct.

**Step 3: Commit**

```bash
git add frontend/src/components/ContactFormSections.tsx
git commit -m "feat: add useDragState hook for managing drag-drop state and reordering"
```

---

## Task 3: Update PhoneSection with Drag Support

**Files:**
- Modify: `frontend/src/components/ContactFormSections.tsx` (PhoneSection function, lines 118-211)

**Description:** Integrate drag-and-drop into PhoneSection's edit mode.

**Step 1: Add drag state to PhoneSection**

In the PhoneSection function, add after the existing `useState` calls:

```typescript
const dragState = useDragState();
```

**Step 2: Update PhoneSection's render to use DraggableArrayItem**

Replace the `.map()` that renders phones in edit mode (around line 157) with:

```typescript
{phones.map((phone, i) => (
  <DraggableArrayItem
    key={`phone-${i}`}
    index={i}
    itemKey={`phone-${i}`}
    isDragging={dragState.draggedIndex === i}
    draggedIndex={dragState.draggedIndex}
    dropZoneIndex={dragState.dropZoneIndex}
    onDragStart={dragState.handleDragStart}
    onDragEnd={dragState.handleDragEnd}
    onDragOver={dragState.handleDragOver}
    onDrop={(fromIdx, toIdx) =>
      dragState.handleDrop(fromIdx, toIdx, phones, onPhonesChange || (() => {}))
    }
    onRemove={() => removePhone(i)}
  >
    <Icon name="phone" />
    <div className="edit-field-group">
      <EditableField
        value={phone.phoneDisplay}
        onChange={(v) => updatePhone(i, 'phone', v)}
        placeholder="Phone number"
      />
      <EditableField
        value={phone.type || ''}
        onChange={(v) => updatePhone(i, 'type', v)}
        placeholder="Type (home, work...)"
      />
    </div>
  </DraggableArrayItem>
))}
```

**Step 3: Verify the edit mode phones still render**

Make sure phones appear in the edit mode and no TypeScript errors occur.

**Step 4: Commit**

```bash
git add frontend/src/components/ContactFormSections.tsx
git commit -m "feat: add drag-drop support to PhoneSection"
```

---

## Task 4: Update EmailSection with Drag Support

**Files:**
- Modify: `frontend/src/components/ContactFormSections.tsx` (EmailSection function, lines 215-290)

**Description:** Integrate drag-and-drop into EmailSection's edit mode.

**Step 1: Add drag state to EmailSection**

In the EmailSection function, add after the existing `useState` calls:

```typescript
const dragState = useDragState();
```

**Step 2: Update EmailSection's render to use DraggableArrayItem**

Replace the `.map()` that renders emails in edit mode (around line 251) with:

```typescript
{emails.map((email, i) => (
  <DraggableArrayItem
    key={`email-${i}`}
    index={i}
    itemKey={`email-${i}`}
    isDragging={dragState.draggedIndex === i}
    draggedIndex={dragState.draggedIndex}
    dropZoneIndex={dragState.dropZoneIndex}
    onDragStart={dragState.handleDragStart}
    onDragEnd={dragState.handleDragEnd}
    onDragOver={dragState.handleDragOver}
    onDrop={(fromIdx, toIdx) =>
      dragState.handleDrop(fromIdx, toIdx, emails, onEmailsChange || (() => {}))
    }
    onRemove={() => removeEmail(i)}
  >
    <Icon name="envelope" />
    <div className="edit-field-group">
      <EditableField
        value={email.email}
        onChange={(v) => updateEmail(i, 'email', v)}
        placeholder="Email address"
        type="email"
      />
      <EditableField
        value={email.type || ''}
        onChange={(v) => updateEmail(i, 'type', v)}
        placeholder="Type (home, work...)"
      />
    </div>
  </DraggableArrayItem>
))}
```

**Step 3: Verify the edit mode emails still render**

Make sure emails appear in the edit mode and no TypeScript errors occur.

**Step 4: Commit**

```bash
git add frontend/src/components/ContactFormSections.tsx
git commit -m "feat: add drag-drop support to EmailSection"
```

---

## Task 5: Update LocationsSection with Drag Support

**Files:**
- Modify: `frontend/src/components/ContactFormSections.tsx` (LocationsSection function)

**Description:** Integrate drag-and-drop into LocationsSection's edit mode.

**Step 1: Find LocationsSection and add drag state**

Locate the LocationsSection function and add:

```typescript
const dragState = useDragState();
```

**Step 2: Update LocationsSection's render to use DraggableArrayItem**

Find the `.map()` that renders addresses in edit mode and replace it with:

```typescript
{addresses.map((address, i) => (
  <DraggableArrayItem
    key={`address-${i}`}
    index={i}
    itemKey={`address-${i}`}
    isDragging={dragState.draggedIndex === i}
    draggedIndex={dragState.draggedIndex}
    dropZoneIndex={dragState.dropZoneIndex}
    onDragStart={dragState.handleDragStart}
    onDragEnd={dragState.handleDragEnd}
    onDragOver={dragState.handleDragOver}
    onDrop={(fromIdx, toIdx) =>
      dragState.handleDrop(fromIdx, toIdx, addresses, onAddressesChange || (() => {}))
    }
    onRemove={() => removeAddress(i)}
  >
    <Icon name="map-location-dot" />
    <div className="edit-field-group">
      <EditableField
        value={address.street || ''}
        onChange={(v) => updateAddress(i, 'street', v)}
        placeholder="Street"
      />
      <EditableField
        value={address.city || ''}
        onChange={(v) => updateAddress(i, 'city', v)}
        placeholder="City"
      />
      <EditableField
        value={address.state || ''}
        onChange={(v) => updateAddress(i, 'state', v)}
        placeholder="State"
      />
      <EditableField
        value={address.postalCode || ''}
        onChange={(v) => updateAddress(i, 'postalCode', v)}
        placeholder="Postal Code"
      />
      <EditableField
        value={address.country || ''}
        onChange={(v) => updateAddress(i, 'country', v)}
        placeholder="Country"
      />
      <EditableField
        value={address.type || ''}
        onChange={(v) => updateAddress(i, 'type', v)}
        placeholder="Type (home, work...)"
      />
    </div>
  </DraggableArrayItem>
))}
```

**Step 3: Verify addresses render in edit mode**

Check that addresses appear correctly and no errors occur.

**Step 4: Commit**

```bash
git add frontend/src/components/ContactFormSections.tsx
git commit -m "feat: add drag-drop support to LocationsSection"
```

---

## Task 6: Update SocialLinksSection with Drag Support

**Files:**
- Modify: `frontend/src/components/ContactFormSections.tsx` (SocialLinksSection function)

**Description:** Integrate drag-and-drop into SocialLinksSection's edit mode.

**Step 1: Find SocialLinksSection and add drag state**

Locate the SocialLinksSection function and add:

```typescript
const dragState = useDragState();
```

**Step 2: Update SocialLinksSection's render to use DraggableArrayItem**

Find the `.map()` that renders social profiles in edit mode and replace it with:

```typescript
{socialProfiles.map((profile, i) => (
  <DraggableArrayItem
    key={`social-${i}`}
    index={i}
    itemKey={`social-${i}`}
    isDragging={dragState.draggedIndex === i}
    draggedIndex={dragState.draggedIndex}
    dropZoneIndex={dragState.dropZoneIndex}
    onDragStart={dragState.handleDragStart}
    onDragEnd={dragState.handleDragEnd}
    onDragOver={dragState.handleDragOver}
    onDrop={(fromIdx, toIdx) =>
      dragState.handleDrop(fromIdx, toIdx, socialProfiles, onSocialProfilesChange || (() => {}))
    }
    onRemove={() => removeSocialProfile(i)}
  >
    <Icon name="share-nodes" />
    <div className="edit-field-group">
      <EditableField
        value={profile.platform}
        onChange={(v) => updateSocialProfile(i, 'platform', v)}
        placeholder="Platform (LinkedIn, Twitter...)"
      />
      <EditableField
        value={profile.username}
        onChange={(v) => updateSocialProfile(i, 'username', v)}
        placeholder="Username"
      />
      <EditableField
        value={profile.profileUrl || ''}
        onChange={(v) => updateSocialProfile(i, 'profileUrl', v)}
        placeholder="Profile URL"
      />
      <EditableField
        value={profile.type || ''}
        onChange={(v) => updateSocialProfile(i, 'type', v)}
        placeholder="Type"
      />
    </div>
  </DraggableArrayItem>
))}
```

**Step 3: Verify social profiles render**

Check that profiles appear correctly.

**Step 4: Commit**

```bash
git add frontend/src/components/ContactFormSections.tsx
git commit -m "feat: add drag-drop support to SocialLinksSection"
```

---

## Task 7: Update UrlsSection with Drag Support

**Files:**
- Modify: `frontend/src/components/ContactFormSections.tsx` (UrlsSection function)

**Description:** Integrate drag-and-drop into UrlsSection's edit mode.

**Step 1: Find UrlsSection and add drag state**

Locate the UrlsSection function and add:

```typescript
const dragState = useDragState();
```

**Step 2: Update UrlsSection's render to use DraggableArrayItem**

Find the `.map()` that renders URLs in edit mode and replace it with:

```typescript
{urls.map((url, i) => (
  <DraggableArrayItem
    key={`url-${i}`}
    index={i}
    itemKey={`url-${i}`}
    isDragging={dragState.draggedIndex === i}
    draggedIndex={dragState.draggedIndex}
    dropZoneIndex={dragState.dropZoneIndex}
    onDragStart={dragState.handleDragStart}
    onDragEnd={dragState.handleDragEnd}
    onDragOver={dragState.handleDragOver}
    onDrop={(fromIdx, toIdx) =>
      dragState.handleDrop(fromIdx, toIdx, urls, onUrlsChange || (() => {}))
    }
    onRemove={() => removeUrl(i)}
  >
    <Icon name="link" />
    <div className="edit-field-group">
      <EditableField
        value={url.url}
        onChange={(v) => updateUrl(i, 'url', v)}
        placeholder="URL"
      />
      <EditableField
        value={url.label || ''}
        onChange={(v) => updateUrl(i, 'label', v)}
        placeholder="Label"
      />
      <EditableField
        value={url.type || ''}
        onChange={(v) => updateUrl(i, 'type', v)}
        placeholder="Type"
      />
    </div>
  </DraggableArrayItem>
))}
```

**Step 3: Verify URLs render**

Check that URLs appear correctly.

**Step 4: Commit**

```bash
git add frontend/src/components/ContactFormSections.tsx
git commit -m "feat: add drag-drop support to UrlsSection"
```

---

## Task 8: Update RelatedPeopleSection with Drag Support

**Files:**
- Modify: `frontend/src/components/ContactFormSections.tsx` (RelatedPeopleSection function)

**Description:** Integrate drag-and-drop into RelatedPeopleSection's edit mode.

**Step 1: Find RelatedPeopleSection and add drag state**

Locate the RelatedPeopleSection function and add:

```typescript
const dragState = useDragState();
```

**Step 2: Update RelatedPeopleSection's render to use DraggableArrayItem**

Find the `.map()` that renders related people in edit mode and replace it with:

```typescript
{relatedPeople.map((person, i) => (
  <DraggableArrayItem
    key={`related-${i}`}
    index={i}
    itemKey={`related-${i}`}
    isDragging={dragState.draggedIndex === i}
    draggedIndex={dragState.draggedIndex}
    dropZoneIndex={dragState.dropZoneIndex}
    onDragStart={dragState.handleDragStart}
    onDragEnd={dragState.handleDragEnd}
    onDragOver={dragState.handleDragOver}
    onDrop={(fromIdx, toIdx) =>
      dragState.handleDrop(fromIdx, toIdx, relatedPeople, onRelatedPeopleChange || (() => {}))
    }
    onRemove={() => removeRelatedPerson(i)}
  >
    <Icon name="user-group" />
    <div className="edit-field-group">
      <EditableField
        value={person.name}
        onChange={(v) => updateRelatedPerson(i, 'name', v)}
        placeholder="Name"
      />
      <EditableField
        value={person.relationship || ''}
        onChange={(v) => updateRelatedPerson(i, 'relationship', v)}
        placeholder="Relationship"
      />
    </div>
  </DraggableArrayItem>
))}
```

**Step 3: Verify related people render**

Check that people appear correctly.

**Step 4: Commit**

```bash
git add frontend/src/components/ContactFormSections.tsx
git commit -m "feat: add drag-drop support to RelatedPeopleSection"
```

---

## Task 9: Update CategoriesSection with Drag Support

**Files:**
- Modify: `frontend/src/components/ContactFormSections.tsx` (CategoriesSection function)

**Description:** Integrate drag-and-drop into CategoriesSection's edit mode.

**Step 1: Find CategoriesSection and add drag state**

Locate the CategoriesSection function and add:

```typescript
const dragState = useDragState();
```

**Step 2: Update CategoriesSection's render to use DraggableArrayItem**

Find the `.map()` that renders categories in edit mode and replace it with:

```typescript
{categories.map((category, i) => (
  <DraggableArrayItem
    key={`category-${i}`}
    index={i}
    itemKey={`category-${i}`}
    isDragging={dragState.draggedIndex === i}
    draggedIndex={dragState.draggedIndex}
    dropZoneIndex={dragState.dropZoneIndex}
    onDragStart={dragState.handleDragStart}
    onDragEnd={dragState.handleDragEnd}
    onDragOver={dragState.handleDragOver}
    onDrop={(fromIdx, toIdx) =>
      dragState.handleDrop(fromIdx, toIdx, categories, onCategoriesChange || (() => {}))
    }
    onRemove={() => removeCategory(i)}
  >
    <Icon name="tag" />
    <div className="edit-field-group">
      <EditableField
        value={category.category}
        onChange={(v) => updateCategory(i, 'category', v)}
        placeholder="Category"
      />
    </div>
  </DraggableArrayItem>
))}
```

**Step 3: Verify categories render**

Check that categories appear correctly.

**Step 4: Commit**

```bash
git add frontend/src/components/ContactFormSections.tsx
git commit -m "feat: add drag-drop support to CategoriesSection"
```

---

## Task 10: Update InstantMessagesSection with Drag Support

**Files:**
- Modify: `frontend/src/components/ContactFormSections.tsx` (InstantMessagesSection function)

**Description:** Integrate drag-and-drop into InstantMessagesSection's edit mode.

**Step 1: Find InstantMessagesSection and add drag state**

Locate the InstantMessagesSection function and add:

```typescript
const dragState = useDragState();
```

**Step 2: Update InstantMessagesSection's render to use DraggableArrayItem**

Find the `.map()` that renders instant messages in edit mode and replace it with:

```typescript
{instantMessages.map((message, i) => (
  <DraggableArrayItem
    key={`im-${i}`}
    index={i}
    itemKey={`im-${i}`}
    isDragging={dragState.draggedIndex === i}
    draggedIndex={dragState.draggedIndex}
    dropZoneIndex={dragState.dropZoneIndex}
    onDragStart={dragState.handleDragStart}
    onDragEnd={dragState.handleDragEnd}
    onDragOver={dragState.handleDragOver}
    onDrop={(fromIdx, toIdx) =>
      dragState.handleDrop(fromIdx, toIdx, instantMessages, onInstantMessagesChange || (() => {}))
    }
    onRemove={() => removeInstantMessage(i)}
  >
    <Icon name="comment-dots" />
    <div className="edit-field-group">
      <EditableField
        value={message.service}
        onChange={(v) => updateInstantMessage(i, 'service', v)}
        placeholder="Service (Slack, WhatsApp...)"
      />
      <EditableField
        value={message.handle}
        onChange={(v) => updateInstantMessage(i, 'handle', v)}
        placeholder="Handle/Username"
      />
      <EditableField
        value={message.type || ''}
        onChange={(v) => updateInstantMessage(i, 'type', v)}
        placeholder="Type"
      />
    </div>
  </DraggableArrayItem>
))}
```

**Step 3: Verify instant messages render**

Check that messages appear correctly.

**Step 4: Commit**

```bash
git add frontend/src/components/ContactFormSections.tsx
git commit -m "feat: add drag-drop support to InstantMessagesSection"
```

---

## Task 11: Add CSS Styling for Drag States

**Files:**
- Modify: `frontend/src/styles/` (main CSS file or create new `frontend/src/styles/drag-drop.css`)

**Description:** Add CSS classes for visual feedback during dragging.

**Step 1: Identify CSS file location**

Check which CSS file handles component styles (likely `index.css` or `App.css` in the frontend).

**Step 2: Add drag-drop CSS classes**

Add to the CSS file:

```css
/* Drag-and-Drop Styling */

.draggable-array-item {
  transition: all 0.2s ease;
}

.draggable-array-item.dragging {
  opacity: 0.5;
  background-color: rgba(0, 0, 0, 0.05);
}

.draggable-array-item.drag-over {
  border-top: 3px solid #007bff;
  padding-top: 8px;
  margin-top: 8px;
}

.draggable-array-item[draggable="true"] {
  cursor: grab;
}

.draggable-array-item.dragging {
  cursor: grabbing;
}

/* Ensure EditableArrayItem inside DraggableArrayItem doesn't break layout */
.draggable-array-item .edit-item {
  pointer-events: auto;
}
```

**Step 3: Verify styling works**

Check that the CSS is syntactically correct and the selectors match the component structure.

**Step 4: Commit**

```bash
git add frontend/src/styles/
git commit -m "style: add drag-drop visual feedback CSS"
```

---

## Task 12: Manual Testing in Browser

**Files:**
- Test: Contact detail edit page

**Description:** Test drag-to-reorder functionality manually in the browser.

**Step 1: Start dev server**

From root directory:

```bash
npm run dev
```

Both frontend (port 5173) and backend (port 3456) should start.

**Step 2: Open a contact and enter edit mode**

- Navigate to a contact detail page
- Click "Edit" button to enter edit mode
- Verify all detail sections are visible (phones, emails, etc.)

**Step 3: Test dragging phones**

- Find the Phones section
- Drag the second phone to the first position
- Verify: Phone order changes, second phone now has "primary" label, first phone label is removed
- Drag back to original position
- Verify: Order reverts, primary status moves back

**Step 4: Test dragging emails**

- Find the Email section
- Drag the third email to position 1
- Verify: Email order changes, primary status updates
- Verify visual feedback (dragging opacity, drop zone highlight)

**Step 5: Test dragging other sections**

- Test dragging in Addresses section
- Test dragging in Social Links section
- Test dragging in URLs section
- Test dragging in Related People section
- Test dragging in Categories section
- Test dragging in Instant Messages section

**Step 6: Test edge cases**

- Single item section (can't drag, should still be primary)
- Many items (verify scroll doesn't break dragging)
- Drag to same position (verify no unnecessary updates)

**Step 7: Test save and persistence**

- After reordering emails, click Save
- Go back to view mode, then re-open edit mode
- Verify: New order is persisted
- Verify: Primary status matches first item

**Step 8: Stop dev server**

```bash
kill $(lsof -ti :3456) 2>/dev/null
kill $(lsof -ti :5173) 2>/dev/null
```

**Step 9: No commit needed (manual testing)**

---

## Task 13: Final Commit & Documentation

**Files:**
- Verify: All files committed in previous steps

**Description:** Ensure all changes are committed and document completion.

**Step 1: Check git status**

```bash
git status
```

Verify all modified files are committed (should show clean working tree).

**Step 2: View final commit log**

```bash
git log --oneline -10
```

Should show commits from tasks 1-11 in order.

**Step 3: Update docs/log.md**

Add entry to `docs/log.md`:

```markdown
## 2026-03-11 15:30 — Drag-to-Reorder Contact Details

- Added `DraggableArrayItem` wrapper component for HTML5 Drag & Drop
- Added `useDragState` hook for managing drag state and reordering
- Updated all detail sections (Phone, Email, Address, Social, URL, Related People, Categories, Instant Messages) with drag support
- Auto-update `isPrimary` when item moved to first position
- Added CSS styling for dragging visual feedback (opacity, drop zone highlight)
- Tested in browser: reordering works, primary status updates, persistence on save

Resolves M-62: Drag Contact Details to change order and make primary
```

**Step 4: Commit documentation update**

```bash
git add docs/log.md
git commit -m "docs: update changelog for drag-reorder feature"
```

**Step 5: Done!**

All tasks complete. Feature is ready for review.

---

## Summary of Changes

| Section | Change |
|---------|--------|
| **New Components** | `DraggableArrayItem`, `useDragState` |
| **Updated Sections** | PhoneSection, EmailSection, LocationsSection, SocialLinksSection, UrlsSection, RelatedPeopleSection, CategoriesSection, InstantMessagesSection |
| **New Styling** | `.dragging`, `.drag-over` CSS classes |
| **Backend** | No changes (reordering is local state, persisted via existing update endpoint) |
| **Testing** | Manual browser testing of all sections |

---

## Key Points

✅ **HTML5 Drag & Drop API** — No new dependencies
✅ **Edit mode only** — Doesn't affect view mode
✅ **Auto-primary logic** — First item always primary after drop
✅ **Visual feedback** — Opacity on dragging item, highlight on drop zone
✅ **All detail types** — Phones, emails, addresses, socials, URLs, related people, categories, IMs
✅ **Persistence** — Works with existing save flow

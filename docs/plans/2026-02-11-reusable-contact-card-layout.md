# Reusable Contact Card Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the contact detail view mode layout into a reusable `ContactCardView` component and use it in both the contact detail page and the user profile page.

**Architecture:** Extract the view-mode section grid from `ContactRowExpanded` into a standalone `ContactCardView` component that accepts a common data shape. Both `ContactDetailPage` and `UserProfilePage` will use this component. The profile page maps its `UserProfile` data into the contact-compatible shape. Profile-specific features (visibility toggles, public card controls, logout) wrap around the shared card layout.

**Tech Stack:** React, TypeScript, existing section components from `ContactFormSections.tsx`

---

## Data Shape Compatibility

The section components (`PhoneSection`, `EmailSection`, etc.) accept `Contact*` types. Profile types (`ProfileEmail`, `ProfilePhone`, etc.) are structurally compatible:

| Section Component | Accepts | Profile Equivalent | Compatible? |
|---|---|---|---|
| `PhoneSection` | `ContactPhone[]` | `ProfilePhone[]` | Yes (same shape) |
| `EmailSection` | `ContactEmail[]` | `ProfileEmail[]` | Yes (same shape) |
| `LocationsSection` | `ContactAddress[]` | `ProfileAddress[]` | Yes (profile has extra optional `id`) |
| `SocialLinksSection` | `ContactSocialProfile[]` | `ProfileSocialLink[]` | No - needs mapping |
| `BirthdaySection` | `string \| null` | `string \| null` | Yes |
| `NotesSection` | `string \| null` | `string \| null` | Yes |
| `UrlsSection` | `ContactUrl[]` | N/A (profile has `website`) | Needs mapping |

Profile-specific social fields (`website`, `linkedin`, `instagram`, `whatsapp`, `otherSocialLinks`) need to be mapped into `ContactSocialProfile[]` and `ContactUrl[]` for the shared component.

---

### Task 1: Create the `ContactCardView` component

**Files:**
- Create: `frontend/src/components/ContactCardView.tsx`

This component extracts the view-mode layout from `ContactRowExpanded` (lines 327-386) into a reusable component.

**Step 1: Create the component file**

```tsx
// frontend/src/components/ContactCardView.tsx
import type { ReactNode } from 'react';
import type {
  ContactPhone,
  ContactEmail,
  ContactAddress,
  ContactSocialProfile,
  ContactUrl,
  ContactRelatedPerson,
  ContactCategory,
  ContactInstantMessage,
} from '../api/types';
import { Icon } from './Icon';
import {
  PhoneSection,
  EmailSection,
  LocationsSection,
  SocialLinksSection,
  BirthdaySection,
  CategoriesSection,
  InstantMessagesSection,
  UrlsSection,
  RelatedPeopleSection,
  NotesSection,
} from './ContactFormSections';

export interface ContactCardViewData {
  phones: ContactPhone[];
  emails: ContactEmail[];
  addresses: ContactAddress[];
  socialProfiles: ContactSocialProfile[];
  categories?: ContactCategory[];
  instantMessages?: ContactInstantMessage[];
  urls?: ContactUrl[];
  relatedPeople?: ContactRelatedPerson[];
  birthday: string | null;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ContactCardViewProps {
  data: ContactCardViewData;
  /** Optional content rendered after all sections (e.g. email history) */
  children?: ReactNode;
  /** Whether to show metadata (created/updated dates). Default true. */
  showMetadata?: boolean;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function MetadataSection({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) {
  return (
    <div className="expanded-section-view gap-lg">
      <div className="section-heading">
        <div className="section-heading-row">
          <Icon name="clock" />
          <span className="section-heading-label">Meta Data</span>
        </div>
      </div>
      <div className="metadata-row">
        <div className="metadata-pair">
          <span className="metadata-pair-label">Created </span>
          <span className="metadata-pair-value">{formatDate(createdAt)}</span>
        </div>
        <div className="metadata-pair">
          <span className="metadata-pair-label">Updated </span>
          <span className="metadata-pair-value">{formatDate(updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}

export function ContactCardView({ data, children, showMetadata = true }: ContactCardViewProps) {
  const hasPhones = data.phones.length > 0;
  const hasEmails = data.emails.length > 0;
  const hasLocations = data.addresses.length > 0;
  const hasSocial = data.socialProfiles.length > 0;
  const hasUrls = (data.urls?.length ?? 0) > 0;
  const hasRelatedPeople = (data.relatedPeople?.length ?? 0) > 0;
  const hasBirthday = !!data.birthday;

  const hasRow1 = hasPhones || hasLocations || hasSocial;
  const hasRow2 = hasEmails || hasBirthday || hasRelatedPeople || hasUrls;

  return (
    <div className="expanded-content">
      {/* Row 1: Phone | Address | Social Links */}
      {hasRow1 && (
        <div className="expanded-row">
          {hasPhones && <PhoneSection phones={data.phones} isEditMode={false} />}
          {hasLocations && <LocationsSection addresses={data.addresses} isEditMode={false} />}
          {hasSocial && <SocialLinksSection socialProfiles={data.socialProfiles} isEditMode={false} />}
        </div>
      )}

      {/* Row 2: Email | Birthday+Related | Web Links */}
      {hasRow2 && (
        <div className="expanded-row">
          {hasEmails && <EmailSection emails={data.emails} isEditMode={false} />}
          {(hasBirthday || hasRelatedPeople) && (
            <div className="expanded-column">
              {hasBirthday && <BirthdaySection birthday={data.birthday} isEditMode={false} />}
              {hasRelatedPeople && (
                <RelatedPeopleSection relatedPeople={data.relatedPeople!} isEditMode={false} />
              )}
            </div>
          )}
          {hasUrls && <UrlsSection urls={data.urls!} isEditMode={false} />}
        </div>
      )}

      {/* Slot for extra content (e.g. EmailHistorySection) */}
      {children}

      {/* Notes + Metadata */}
      {showMetadata && data.createdAt && data.updatedAt ? (
        data.notes ? (
          <div className="expanded-row expanded-row-notes">
            <NotesSection notes={data.notes} isEditMode={false} />
            <MetadataSection createdAt={data.createdAt} updatedAt={data.updatedAt} />
          </div>
        ) : (
          <MetadataSection createdAt={data.createdAt} updatedAt={data.updatedAt} />
        )
      ) : data.notes ? (
        <NotesSection notes={data.notes} isEditMode={false} />
      ) : null}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ContactCardView.tsx
git commit -m "feat: extract ContactCardView reusable component"
```

---

### Task 2: Refactor `ContactRowExpanded` to use `ContactCardView`

**Files:**
- Modify: `frontend/src/components/ContactRowExpanded.tsx`

Replace the view-mode rendering (lines 323-386) with `ContactCardView`. Keep all edit-mode logic unchanged.

**Step 1: Update imports**

Add import at top of file:
```tsx
import { ContactCardView } from './ContactCardView';
```

**Step 2: Remove duplicated `MetadataSection` and `formatDate`**

Delete `formatDate` function (lines 24-30) and `MetadataSection` component (lines 32-53) from `ContactRowExpanded.tsx` — these now live in `ContactCardView.tsx`.

**Step 3: Replace view-mode return**

Replace the view-mode return block (lines 323-386) with:

```tsx
  // ─── View Mode (Figma layout) ────────────────────────────────
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <ContactCardView
        data={{
          phones: contact.phones,
          emails: contact.emails,
          addresses: contact.addresses,
          socialProfiles: contact.socialProfiles,
          categories: contact.categories,
          instantMessages: contact.instantMessages,
          urls: contact.urls,
          relatedPeople: contact.relatedPeople,
          birthday: contact.birthday,
          notes: contact.notes,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        }}
      >
        <EmailHistorySection contactId={contact.id} hasEmails={contact.emails.length > 0} />
      </ContactCardView>

      {/* Bottom: Edit button right-aligned */}
      <div className="expanded-bottom-actions">
        <button className="edit-button-primary" onClick={handleEnterEditMode}>
          Edit
        </button>
      </div>
    </div>
  );
```

**Step 4: Verify the contact detail page still renders correctly**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add frontend/src/components/ContactRowExpanded.tsx
git commit -m "refactor: use ContactCardView in ContactRowExpanded view mode"
```

---

### Task 3: Create profile-to-contact data mapper

**Files:**
- Modify: `frontend/src/components/UserProfilePage.tsx`

Add a helper function that maps `UserProfile` data → `ContactCardViewData`.

**Step 1: Add the mapper function**

Add this inside `UserProfilePage.tsx` (before the main component):

```tsx
import type { ContactCardViewData } from './ContactCardView';
import type { ContactSocialProfile, ContactUrl } from '../api/types';

/** Map UserProfile fields to ContactCardViewData for the shared card layout */
function mapProfileToCardData(profile: UserProfile, form: FormState): ContactCardViewData {
  // Map profile social links to ContactSocialProfile format
  const socialProfiles: ContactSocialProfile[] = [];
  let socialId = 1;

  if (form.linkedin) {
    socialProfiles.push({
      id: socialId++, contactId: 0,
      platform: 'linkedin', username: form.linkedin,
      profileUrl: form.linkedin.startsWith('http') ? form.linkedin : `https://linkedin.com/in/${form.linkedin}`,
      type: null,
    });
  }
  if (form.instagram) {
    socialProfiles.push({
      id: socialId++, contactId: 0,
      platform: 'instagram', username: form.instagram,
      profileUrl: `https://instagram.com/${form.instagram}`,
      type: null,
    });
  }
  if (form.whatsapp) {
    socialProfiles.push({
      id: socialId++, contactId: 0,
      platform: 'whatsapp', username: form.whatsapp,
      profileUrl: `https://wa.me/${form.whatsapp.replace(/\D/g, '')}`,
      type: null,
    });
  }
  for (const link of form.otherSocialLinks) {
    if (link.platform.trim() && link.username.trim()) {
      socialProfiles.push({
        id: socialId++, contactId: 0,
        platform: link.platform, username: link.username,
        profileUrl: link.profileUrl,
        type: null,
      });
    }
  }

  // Map website to ContactUrl format
  const urls: ContactUrl[] = [];
  if (form.website) {
    urls.push({ id: 1, contactId: 0, url: form.website, label: 'Website', type: null });
  }

  return {
    phones: form.phones as ContactPhone[],
    emails: form.emails as ContactEmail[],
    addresses: form.addresses as ContactAddress[],
    socialProfiles,
    urls,
    birthday: form.birthday,
    notes: form.notes,
  };
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/UserProfilePage.tsx
git commit -m "feat: add profile-to-contact data mapper for shared card layout"
```

---

### Task 4: Redesign UserProfilePage to use `ContactCardView`

**Files:**
- Modify: `frontend/src/components/UserProfilePage.tsx`

Replace the custom profile form layout with:
1. `ContactCardView` for displaying the profile data (read-only view)
2. An "Edit" mode that uses the existing editable sections (like `ContactRowExpanded` does)
3. Profile-specific controls (public card toggle, visibility, logout) above/below the card

**Step 1: Restructure the linked-state return**

The new layout for the linked profile state:

```
┌─────────────────────────────────────────────────────────────┐
│ Linked Profile Header (avatar, name, unlink button)         │
├─────────────────────────────────────────────────────────────┤
│ Public Card Controls (toggle, URL, hide-all)                │
├───────────────────────────────────┬─────────────────────────┤
│                                   │                         │
│  ContactCardView (sections grid)  │  Public Card Preview    │
│  (or Edit mode: editable fields)  │  (sticky sidebar)       │
│                                   │                         │
├───────────────────────────────────┴─────────────────────────┤
│ Account section (email, logout button)                      │
└─────────────────────────────────────────────────────────────┘
```

Replace the entire "Linked state - show full profile editor" return block (currently lines ~703-1204) with a version that:

- In **view mode**: renders `ContactCardView` with the mapped data, plus an "Edit" button
- In **edit mode**: renders the editable sections in a 3-column grid (matching `ContactRowExpanded`'s edit mode pattern) with visibility toggles
- Keeps the public card preview sidebar
- Keeps the account/logout section at the bottom

Key changes to the component state:
```tsx
const [isEditMode, setIsEditMode] = useState(false);
```

**View mode rendering:**
```tsx
<ContactCardView data={mapProfileToCardData(profile, form)} showMetadata={false} />
<div className="expanded-bottom-actions">
  <button className="edit-button-primary" onClick={() => setIsEditMode(true)}>
    Edit
  </button>
</div>
```

**Edit mode rendering:**
Reuse the existing form fields (EditableField, visibility toggles) but arrange them in the same 3-column `.expanded-grid` layout that `ContactRowExpanded` uses in edit mode. Keep the visibility toggles alongside each field.

**Step 2: Remove now-unused inline profile styles**

Delete the custom profile form styles that are replaced by the shared `.expanded-*` CSS classes. Keep only profile-specific styles:
- `.linked-profile-header`, `.unlinked-profile-state`, `.public-card-controls`
- `.visibility-toggle`, `.toggle-switch`
- `.public-card-preview`, `.preview-*`
- `.account-*`, `.logout-button`

**Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add frontend/src/components/UserProfilePage.tsx
git commit -m "feat: redesign profile page to use shared ContactCardView layout"
```

---

### Task 5: Visual verification and cleanup

**Step 1: Start dev servers**

```bash
npm run dev
```

**Step 2: Verify contact detail page**

Navigate to a contact detail page. Verify:
- Section grid layout unchanged (phones, addresses, social in row 1; emails, birthday, URLs in row 2)
- Email history section still appears
- Notes + metadata row still works
- Edit mode still works (save/cancel)
- Responsive: check at mobile (640px), tablet (768px), desktop (1024px)

**Step 3: Verify profile page**

Navigate to profile page. Verify:
- Linked profile header shows correctly
- Public card controls work (toggle, URL copy)
- Profile data displays in the same grid layout as contacts
- Edit mode works with visibility toggles
- Public card preview updates live
- Logout button works
- Responsive layout works

**Step 4: Clean up dev servers**

```bash
kill $(lsof -ti :3000) 2>/dev/null
kill $(lsof -ti :5173) 2>/dev/null
```

**Step 5: Final commit (if any tweaks needed)**

```bash
git add -A
git commit -m "fix: visual tweaks for shared contact card layout"
```

---

## Summary of changes

| File | Action | Description |
|---|---|---|
| `frontend/src/components/ContactCardView.tsx` | Create | New reusable component: sections grid + metadata |
| `frontend/src/components/ContactRowExpanded.tsx` | Modify | View mode delegates to `ContactCardView`, edit mode unchanged |
| `frontend/src/components/UserProfilePage.tsx` | Modify | Profile page uses `ContactCardView` + edit/view toggle |

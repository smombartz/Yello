# Social Links Cleanup Feature Design

## Overview

Add a "Social Links" tab under Clean up with two sub-tabs for cleaning up social profile URLs:

1. **Cross-contact** - Find contacts sharing the same social URL (merge candidates)
2. **Within-contact** - Migrate social URLs from `contact_urls` to `contact_social_profiles`

## Problem

Currently contacts may have social profile URLs stored in two places:
- `contact_social_profiles` - The proper normalized table with platform/username fields
- `contact_urls` - Generic URLs table

This causes:
- Duplicate detection to miss matches (same person, different storage location)
- Data inconsistency across the application
- 535 contacts have LinkedIn in both tables
- 5,016 LinkedIn URLs in `contact_urls` that should be in `contact_social_profiles`

## Tab Structure

```
Clean up
├── Empty Contacts (existing)
├── Problematic Emails (existing)
└── Social Links (new)
    ├── Cross-contact
    └── Within-contact
```

## Supported Platforms

```typescript
const SOCIAL_PLATFORMS = {
  linkedin: /linkedin\.com\/in\//i,
  facebook: /facebook\.com\//i,
  twitter: /(twitter\.com|x\.com)\//i,
  instagram: /instagram\.com\//i,
  youtube: /youtube\.com\/(user|channel|@)/i,
  tiktok: /tiktok\.com\/@/i,
  pinterest: /pinterest\.com\//i,
  snapchat: /snapchat\.com\/add\//i,
  reddit: /reddit\.com\/(user|u)\//i,
  github: /github\.com\//i,
  threads: /threads\.net\/@/i,
};
```

## API Endpoints

### GET /api/cleanup/social-links/summary

Returns counts for both tabs.

**Response:**
```typescript
{
  crossContact: number;   // Groups of contacts sharing social URLs
  withinContact: number;  // Contacts with social URLs in contact_urls
}
```

### GET /api/cleanup/social-links/cross-contact

Returns duplicate groups of contacts sharing the same social URL.

**Query params:**
- `page` (default: 1)
- `limit` (default: 50)
- `platform` (optional filter)

**Response:**
```typescript
{
  groups: DuplicateGroup[];  // Reuses existing type
  total: number;
  page: number;
  totalPages: number;
}
```

### GET /api/cleanup/social-links/within-contact

Returns contacts with social URLs in `contact_urls`.

**Query params:**
- `page` (default: 1)
- `limit` (default: 50)

**Response:**
```typescript
{
  contacts: Array<{
    id: number;
    displayName: string;
    socialUrls: Array<{
      id: number;
      url: string;
      platform: string;
      username: string;
    }>;
  }>;
  total: number;
}
```

### POST /api/cleanup/social-links/within-contact/fix-all

Migrates all social URLs from `contact_urls` to `contact_social_profiles`.

**Response:**
```typescript
{
  migrated: number;  // URLs moved to contact_social_profiles
  deleted: number;   // URLs removed from contact_urls
}
```

## Cross-contact Detection Logic

1. Extract social URLs from both tables
2. Normalize URLs for comparison:
   - Lowercase
   - Remove trailing slashes
   - Remove `www.` prefix
   - Remove query parameters
3. Group contacts by normalized social URL
4. Return groups where `COUNT(DISTINCT contact_id) > 1`

**SQL approach:**
```sql
SELECT normalized_url, GROUP_CONCAT(contact_id) as contact_ids
FROM (
  SELECT contact_id, normalize_url(profile_url) as normalized_url
  FROM contact_social_profiles WHERE platform = ?
  UNION
  SELECT contact_id, normalize_url(url) as normalized_url
  FROM contact_urls WHERE url LIKE ?
)
GROUP BY normalized_url
HAVING COUNT(DISTINCT contact_id) > 1
```

## Within-contact Fix Logic

For each social URL in `contact_urls`:

1. Detect platform using regex patterns
2. Extract username from URL
3. Check if already exists in `contact_social_profiles` for same contact + platform
4. If not exists: Insert into `contact_social_profiles`
5. Delete from `contact_urls`

**Username extraction:**
```typescript
const USERNAME_EXTRACTORS = {
  linkedin: /linkedin\.com\/in\/([^\/\?]+)/i,
  facebook: /facebook\.com\/([^\/\?]+)/i,
  twitter: /(twitter|x)\.com\/([^\/\?]+)/i,
  instagram: /instagram\.com\/([^\/\?]+)/i,
  github: /github\.com\/([^\/\?]+)/i,
  youtube: /youtube\.com\/(user|channel|@)\/([^\/\?]+)/i,
  tiktok: /tiktok\.com\/@([^\/\?]+)/i,
  pinterest: /pinterest\.com\/([^\/\?]+)/i,
  snapchat: /snapchat\.com\/add\/([^\/\?]+)/i,
  reddit: /reddit\.com\/(user|u)\/([^\/\?]+)/i,
  threads: /threads\.net\/@([^\/\?]+)/i,
};
```

Entire operation runs in a single SQLite transaction.

## Frontend Components

### New Files

```
frontend/src/components/
├── SocialLinksCleanup.tsx       ← Container with sub-tabs
├── SocialLinksCrossContact.tsx  ← Reuses DuplicateGroupList
└── SocialLinksWithinContact.tsx ← List + Fix All button

frontend/src/api/
└── socialLinksHooks.ts          ← React Query hooks
```

### Modified Files

```
frontend/src/components/
├── CleanupView.tsx              ← Add "Social Links" mode
└── CleanupModeSelector.tsx      ← Add tab button

frontend/src/api/
└── types.ts                     ← Add types
```

### SocialLinksCleanup.tsx

```tsx
<div className="social-links-cleanup">
  <div className="social-links-tabs">
    <button className={mode === 'cross-contact' ? 'active' : ''}>
      Cross-contact ({summary.crossContact})
    </button>
    <button className={mode === 'within-contact' ? 'active' : ''}>
      Within-contact ({summary.withinContact})
    </button>
  </div>

  {mode === 'cross-contact'
    ? <SocialLinksCrossContact />
    : <SocialLinksWithinContact />
  }
</div>
```

### SocialLinksWithinContact.tsx

- Shows contact list with their misplaced social URLs
- "Fix All" button at top
- Progress indicator during operation
- Success toast showing migrated/deleted counts

### SocialLinksCrossContact.tsx

- Reuses existing `DuplicateGroupList` component
- Groups shown with `matchingField: 'social'`
- Same merge/keep-separate flow as deduplication

## Backend Files

### New Files

```
backend/src/services/
└── socialLinksCleanupService.ts

backend/src/routes/
└── socialLinksCleanup.ts (or add to cleanup.ts)
```

## Implementation Order

1. Backend: Add `socialLinksCleanupService.ts` with detection and fix logic
2. Backend: Add API routes
3. Frontend: Add types and hooks
4. Frontend: Add `SocialLinksCleanup.tsx` and sub-components
5. Frontend: Integrate into `CleanupView.tsx`

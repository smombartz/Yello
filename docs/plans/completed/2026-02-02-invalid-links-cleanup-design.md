# Invalid Links Cleanup Feature Design

## Overview

A new top-level cleanup mode that removes invalid social links and URLs from contacts. Users enter comma-separated patterns (e.g., `pages, instagram, https, profile.php`) and the system finds and removes matching records from both `contact_social_profiles` and `contact_urls` tables.

## User Interface

The cleanup mode selector will have a new "Invalid Links" option. When selected:

1. **Input field** - Text input for comma-separated patterns
2. **Search button** - Finds all matching records across both tables
3. **Results list** - Shows matches grouped by contact, displaying:
   - Contact name
   - The invalid link (platform + username, or URL)
   - Which table it's in
4. **Remove All button** - Deletes all matching records

## Backend API

### `POST /api/cleanup/invalid-links/search`

Request:
```json
{ "patterns": ["pages", "instagram", "https", "profile.php"] }
```

Response:
```json
{
  "matches": [
    {
      "contactId": 123,
      "contactName": "John Doe",
      "source": "social_profiles",
      "platform": "facebook",
      "value": "pages",
      "recordId": 456
    },
    {
      "contactId": 123,
      "contactName": "John Doe",
      "source": "urls",
      "label": "Website",
      "value": "https://facebook.com/pages/something",
      "recordId": 789
    }
  ],
  "totalCount": 2
}
```

### `POST /api/cleanup/invalid-links/remove`

Request:
```json
{ "patterns": ["pages", "instagram", "https", "profile.php"] }
```

Response:
```json
{
  "deletedCount": 2,
  "deletedFromSocialProfiles": 1,
  "deletedFromUrls": 1
}
```

## Matching Logic

### For `contact_social_profiles`:
- Match against the `username` field
- Case-insensitive comparison
- Matches if username equals or starts with the pattern (e.g., pattern `profile.php` matches `profile.php?id=123`)

### For `contact_urls`:
- Match against the `url` field
- Case-insensitive comparison
- Matches if any path segment equals the pattern (e.g., pattern `pages` matches `facebook.com/pages/something`)

## Files

### New files:
- `backend/src/services/invalidLinksCleanupService.ts` - Search and remove logic
- `backend/src/schemas/invalidLinksCleanup.ts` - Request/response schemas
- `backend/src/routes/invalidLinksCleanup.ts` - API endpoints
- `frontend/src/api/invalidLinksHooks.ts` - React Query hooks
- `frontend/src/components/InvalidLinksCleanup.tsx` - UI component

### Modified files:
- `backend/src/server.ts` - Register new routes
- `frontend/src/api/types.ts` - Add TypeScript types
- `frontend/src/components/CleanupModeSelector.tsx` - Add "Invalid Links" option
- `frontend/src/components/CleanupView.tsx` - Render new component

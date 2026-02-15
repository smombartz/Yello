# Address Cleanup: Add Geocoding Tab

**Status:** Implemented
**Date:** 2026-02-04

## Summary

Add a third "Geocoding" tab to the Address Cleanup feature (alongside Normalize and Duplicates). This tab provides visibility into geocoding status, allows fixing failed addresses inline, and offers bulk geocoding with progress tracking.

**Also:** Switch geocoding service from Nominatim to **HERE.com** for better rate limits and accuracy.

**Note:** Normalize and Duplicates tabs were already implemented. This plan adds the third tab.

---

## Tab Structure

```
Cleanup > Addresses
├── Normalize (junk removal) ✓ done
├── Duplicates (merge duplicates) ✓ done
└── Geocoding (NEW)
    ├── Filter bar: [All] [Pending] [Failed] [Geocoded]
    ├── Stats summary: "45 pending · 12 failed · 340 geocoded"
    ├── Bulk action button: "Geocode All Pending (45)"
    └── Contact cards with addresses grouped
```

### Filter Behavior

| Filter | Shows |
|--------|-------|
| **All** | All addresses (default) |
| **Pending** | Never attempted (`geocoded_at` is NULL) |
| **Failed** | Attempted but no coordinates (`geocoded_at` set, lat/lng NULL) |
| **Geocoded** | Has valid coordinates |

---

## Contact Card UI

Each card shows a contact with their addresses:

```
┌─────────────────────────────────────────────────────────┐
│ [Avatar] John Smith                        3 addresses  │
│          Acme Corp                                      │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │ 123 Main St, Boston, MA 02101        [Geocoded] │   │
│  │ 42.3601, -71.0589                    [View Map] │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 456 Oak Ave, Unknown City             [Failed]  │   │
│  │ Could not find coordinates              [Edit]  │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 789 Pine Rd, Seattle, WA             [Pending]  │   │
│  │ Not yet geocoded                [Geocode Now]   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Status Badges & Actions

| Status | Badge Color | Available Actions |
|--------|-------------|-------------------|
| **Pending** | Gray | "Geocode Now" button |
| **Failed** | Red | "Edit" button → inline edit mode |
| **Geocoded** | Green | "View Map" link (opens map centered on location) |

### Inline Edit Mode (for Failed addresses)

When user clicks "Edit" on a failed address:
- Address fields become editable (street, city, state, postal, country)
- Shows "Save & Retry" and "Cancel" buttons
- On save: updates address, immediately attempts geocoding, shows result

---

## Bulk Geocoding UI

When user clicks "Geocode All Pending (45)":

```
┌─────────────────────────────────────────────────────────┐
│  Geocoding Addresses...                                 │
│                                                         │
│  ████████████░░░░░░░░░░░░░░░░░░  23 / 45               │
│                                                         │
│  ✓ 18 successful                                        │
│  ✗ 5 failed                                             │
│                                                         │
│                                        [Cancel]         │
└─────────────────────────────────────────────────────────┘
```

**Behavior:**
- Modal overlay prevents other actions during processing
- Progress updates as each address completes (batches of 25)
- Shows running count of successes/failures
- Cancel button stops processing (keeps results so far)
- On completion: modal closes, list refreshes, toast shows final summary

---

## HERE.com Geocoding

Replaced Nominatim with HERE Geocoding API for faster, more accurate results.

**Benefits:**
- 250,000 free requests/month (vs ~30/min with Nominatim)
- No rate limiting needed for bulk operations
- Better address parsing and accuracy

**Environment variable:**
```
HERE_API_KEY=<your-api-key>
```

**API endpoint:**
```
GET https://geocode.search.hereapi.com/v1/geocode
  ?q={address}
  &apiKey={HERE_API_KEY}
```

**Response parsing:**
```typescript
response.items[0].position.lat  // latitude
response.items[0].position.lng  // longitude
```

---

## API Endpoints

**New endpoints under `/api/cleanup/addresses/geocoding/`:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/summary` | GET | Returns counts: `{ pending, failed, geocoded, total }` |
| `/` | GET | List addresses with status, supports `?filter=pending|failed|geocoded&limit=50&offset=0` |
| `/retry` | POST | Retry geocoding for specific address IDs: `{ addressIds: [1,2,3] }` |
| `/batch` | POST | Bulk geocode pending addresses: `{ limit?: 50 }` |
| `/update` | PUT | Update address fields and retry: `{ addressId, street?, city?, state?, postalCode?, country? }` |

---

## Files Modified

### Backend

1. **`backend/src/services/geocoding.ts`**
   - Replaced Nominatim API with HERE.com API
   - Removed rate limiting (HERE doesn't need it)
   - Updated response parsing for HERE format
   - Added `HERE_API_KEY` environment variable check
   - Added `isGeocodingConfigured()` export

2. **`backend/src/services/addressCleanupService.ts`**
   - Added `getGeocodingSummary()` - counts by status
   - Added `findAddressesByGeoStatus()` - list with filtering
   - Added `retryGeocoding()` - retry specific addresses
   - Added `batchGeocode()` - bulk geocode pending
   - Added `updateAddressAndGeocode()` - edit + retry
   - Added `isGeocodingAvailable()` - check if configured

3. **`backend/src/routes/addressCleanup.ts`**
   - Added `/geocoding/summary` GET route
   - Added `/geocoding` GET route with filter param
   - Added `/geocoding/retry` POST route
   - Added `/geocoding/batch` POST route
   - Added `/geocoding/update` PUT route

4. **`backend/src/schemas/addressCleanup.ts`**
   - Added `GeocodingSummaryResponseSchema`
   - Added `GeocodingContactSchema` / `GeocodingAddressSchema`
   - Added `GeocodingResponseSchema`
   - Added `GeocodingRetryRequestSchema`
   - Added `GeocodingBatchRequestSchema` / `GeocodingBatchResponseSchema`
   - Added `GeocodingUpdateRequestSchema` / `GeocodingUpdateResponseSchema`

5. **`backend/.env`** and **`backend/.env.example`**
   - Added `HERE_API_KEY` configuration

### Frontend

6. **`frontend/src/api/types.ts`**
   - Added `GeocodingStatus` type (`'pending' | 'failed' | 'geocoded'`)
   - Added `GeocodingFilter` type
   - Added `GeocodingSummary` interface
   - Added `GeocodingAddress` interface (with lat/lng/status)
   - Added `GeocodingContact` interface
   - Added `GeocodingResponse` interface
   - Added `GeocodingBatchResult` interface
   - Added `GeocodingUpdateResponse` interface

7. **`frontend/src/api/addressCleanupHooks.ts`**
   - Added `useGeocodingSummary()` hook
   - Added `useGeocodingContacts()` hook with filter param
   - Added `useRetryGeocoding()` mutation
   - Added `useBatchGeocode()` mutation
   - Added `useUpdateAndGeocode()` mutation

8. **`frontend/src/components/AddressGeocoding.tsx`** (NEW)
   - Filter buttons (All/Pending/Failed/Geocoded)
   - Stats summary display
   - "Geocode All Pending" button
   - Contact cards with address list
   - Inline edit mode for failed addresses
   - Progress modal for bulk operations

9. **`frontend/src/components/AddressCleanup.tsx`**
   - Added Geocoding tab to sub-tab selector
   - Import and render `AddressGeocoding` component

10. **`frontend/src/index.css`**
    - Geocoding filter button styles
    - Geocoding address item styles (status badges)
    - Inline edit form styles
    - Progress modal styles

---

## Setup

1. Get a HERE.com API key from https://developer.here.com/ (free tier: 250k requests/month)
2. Add to `backend/.env`:
   ```
   HERE_API_KEY=your_key_here
   ```
3. Restart the backend server

---

## Verification

1. Run `npm run dev`
2. Navigate to Clean Up → Addresses
3. Verify three tabs appear: "Normalize", "Duplicates", "Geocoding"
4. **Geocoding tab:**
   - Filter buttons work (All/Pending/Failed/Geocoded)
   - Stats summary shows correct counts
   - Contact cards display with address status badges
   - "Geocode Now" on pending address triggers geocoding
   - "Edit" on failed address shows inline edit form
   - "Save & Retry" updates address and retries geocoding
   - "View Map" on geocoded address navigates to map
   - "Geocode All Pending" shows progress modal
   - Progress bar updates during bulk operation
   - Cancel stops bulk operation
   - Toast shows results on completion

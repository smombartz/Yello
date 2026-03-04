# Change Log

## 2026-02-15 14:00 — Bulk Gmail Email History Sync in Enrich View

- Added `emailDiscoveryService.ts` — discovers which contacts user emails most recently/frequently by scanning Gmail messages
- Added `gmailEnrich.ts` route plugin at `/api/enrich/gmail` with summary, discover, and bulk-sync (SSE) endpoints
- Exported helper functions (`gmailFetch`, `fetchMessageMetadata`, `extractEmailAddresses`, `getHeader`) from `emailSyncService.ts`
- Added frontend types (`GmailSyncSummary`, `GmailDiscoveredContact`, `GmailBulkSyncProgress`, `GmailBulkSyncResult`) to `types.ts`
- Created `gmailEnrichHooks.ts` with `useGmailSyncSummary`, `useGmailDiscover`, `useGmailBulkSync` hooks
- Added "Gmail Email History" collapsible section to EnrichView with:
  - Summary stats (synced / not synced / total with email)
  - Strategy selector (most recent, most frequent, not yet synced, all)
  - Configurable scan depth and contact limit
  - Discovery step for recent/frequent strategies showing ranked contact list
  - SSE-streamed bulk sync with progress bar, cancel support
- Registered route in `server.ts`

## 2026-02-15 12:20 — Address Edit Option in Cleanup Normalize & Duplicates

- Added `PUT /api/cleanup/addresses/update` backend endpoint to update address fields without geocoding
- Extended `applyAddressFixes()` to support an optional `updatedAddress` field, applying address updates in the same transaction before removing duplicates
- Added `AddressUpdateData` / `AddressUpdateResponse` frontend types and `useUpdateAddress()` mutation hook
- Added inline edit mode to Normalize tab: pencil icon on each junk address opens editable fields (street, city, state, postalCode, country); Save updates the address and removes it from the junk list
- Added "Custom" radio option to Duplicates tab: lets users compose a custom address from editable fields pre-filled with the recommended address data; on Apply, the recommended address is updated and duplicates are removed
- Added CSS styles for `.address-edit-form`, `.address-edit-input`, `.address-edit-actions`, and normalize edit button

# Fix LinkedIn Enrichment: Polling Resilience + Dataset Recovery

## Context

During enrichment of ~1793 contacts (3 batches), a transient Apify 502 Bad Gateway during a status poll killed the entire batch. All contacts marked as failed (0 succeeded, 1793 failed), but the Apify runs completed on their side with ~350+ results. The data is orphaned — nothing fetches it.

**Root cause:** `waitForApifyRun()` throws immediately on any HTTP error during polling. One bad response kills the whole batch.

## Files to Modify

| File | Changes |
|------|---------|
| `backend/src/services/apifyEnrichmentService.ts` | Retry helper, apply to polling + dataset fetch, add `recoverFromDataset()`, log dataset IDs |
| `backend/src/routes/enrich.ts` | Add `POST /linkedin/recover` endpoint |
| `frontend/src/api/enrichHooks.ts` | Add `useLinkedInRecovery()` hook (same SSE pattern as `useLinkedInEnrichment`) |
| `frontend/src/components/EnrichView.tsx` | Add dataset recovery UI section |

## Fix 1: Retry helper for transient HTTP errors

Add a `fetchWithRetry()` helper in `apifyEnrichmentService.ts`:
- Max 3 attempts per request
- Exponential backoff: 5s, 10s, 20s between retries
- Only retry on 5xx or network errors (not 4xx)
- Log each retry attempt

Apply it to:
1. **`waitForApifyRun()`** — the status check fetch (~line 483)
2. **`getApifyResults()`** — the dataset fetch (~line 538)

## Fix 2: Log dataset IDs for recovery

In `enrichContacts()`, after `startApifyRun()` returns (~line 814), log prominently:
```
[Enrich] Batch 1/3: runId=abc, datasetId=xyz ← save this for recovery
```
Currently only `runId` is destructured; also grab `datasetId`.

## Fix 3: Add `recoverFromDataset()` service function

Export a new function that skips submit+poll and goes straight to fetching + processing:

```typescript
export async function recoverFromDataset(
  datasetId: string,
  onProgress?: (progress: EnrichmentProgress) => void
): Promise<EnrichmentComplete>
```

Implementation:
1. Call `getApifyResults(datasetId)` to fetch the orphaned results
2. Build `identifierToContacts` map from `getContactsForEnrichment(true)` (include already-enriched)
3. Run the same matching + `mapApifyToEnrichmentData()` + `storeEnrichmentData()` logic
4. Reuse the same photo download logic

This is essentially the Phase 3 portion of `enrichContacts()` extracted into its own function. Consider extracting that matching logic into a shared `processApifyResults()` helper to avoid duplication.

## Fix 4: Add recovery API endpoint

In `enrich.ts`, add `POST /linkedin/recover`:
- Body: `{ datasetId: string }`
- Same SSE streaming pattern as existing `/start` endpoint
- Calls `recoverFromDataset(datasetId, progressCallback)`

## Fix 5: Add recovery UI

**In `enrichHooks.ts`:** Add `useLinkedInRecovery()` hook — same SSE pattern as `useLinkedInEnrichment()` but POSTs to `/api/enrich/linkedin/recover` with `{ datasetId }`.

**In `EnrichView.tsx`:** Add a "Recover from Dataset" section below the main enrichment actions:
- Text input for dataset ID (paste from Apify console)
- "Recover" button that triggers `useLinkedInRecovery`
- Reuses existing progress/result display components
- Only visible when `summary.configured` is true and not currently enriching

## Fix 6: Support `/pub/` LinkedIn URLs

`extractPublicIdentifier()` (~line 422) only matches `/in/` URLs:
```typescript
const match = normalized.match(/linkedin\.com\/in\/([^/?#]+)/);
```

Older LinkedIn profiles use `/pub/name/xx/xx/xxx` format (e.g. `https://www.linkedin.com/pub/sara-plumbly/69/18/5b9`). These are valid LinkedIn URLs that Apify can scrape, but they get rejected as "invalid."

Fix: Also match `/pub/` and extract the full path as the identifier:
```typescript
const match = normalized.match(/linkedin\.com\/(?:in|pub)\/([^?#]+?)\/?\s*$/);
```

For `/in/johndoe` → identifier = `johndoe`
For `/pub/sara-plumbly/69/18/5b9` → identifier = `sara-plumbly/69/18/5b9`

The identifier is used as a map key to match Apify results back to contacts. Apify returns `publicIdentifier` which for `/pub/` profiles may differ, so the matching logic in `enrichContacts()` (~line 855) also needs to try matching by URL path, not just `publicIdentifier`.

## Verification

1. `cd backend && npx tsc --noEmit` + `cd frontend && npx tsc --noEmit`
2. Test retry: simulate by running enrichment — poll logs should show retry attempts if any 5xx hit
3. Test recovery: paste a dataset ID from Apify console into the UI, click Recover, verify contacts get populated
4. Check DB: `SELECT COUNT(*) FROM linkedin_enrichment WHERE positions IS NOT NULL`

# Background Enrichment Jobs

## Context

Currently, enrichment is tied to an SSE connection — if the user navigates away from the Enrich page, the progress display is lost. The backend keeps running (Apify polls continue), but the user has no way to see the results when they return. We need enrichment to be a fire-and-forget background job with persistent status tracking.

Key insight: `enrichContacts()` is already fully async and independent of SSE. It just needs a database-backed job layer so the frontend can poll for status.

This plan also incorporates the retry resilience and `/pub/` URL fixes from `docs/plans/2026-02-13-linkedin-enrichment-resilience.md`.

## Files to Modify

| File | Changes |
|------|---------|
| `backend/src/services/database.ts` | Add `enrichment_jobs` table |
| `backend/src/services/apifyEnrichmentService.ts` | Add job CRUD functions, `fetchWithRetry()`, `recoverFromDataset()`, `/pub/` URL support, refactor `enrichContacts()` to update job row |
| `backend/src/routes/enrich.ts` | Replace SSE `/start` with job endpoints: POST `/job`, GET `/job/:id`, GET `/jobs/active` |
| `frontend/src/api/enrichHooks.ts` | Replace SSE hook with `useStartEnrichmentJob()` mutation + `useEnrichmentJob(id)` polling query |
| `frontend/src/api/types.ts` | Add `EnrichmentJob` type |
| `frontend/src/components/EnrichView.tsx` | Poll-based UI instead of SSE, persist jobId in localStorage, dataset recovery input |

## 1. Database: `enrichment_jobs` table

Add to `database.ts` schema initialization:

```sql
CREATE TABLE IF NOT EXISTS enrichment_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','completed','failed')),
  include_already_enriched INTEGER NOT NULL DEFAULT 0,
  contact_limit INTEGER,
  total_contacts INTEGER DEFAULT 0,
  current_contact INTEGER DEFAULT 0,
  succeeded_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  current_contact_name TEXT,
  apify_dataset_ids TEXT,           -- JSON array of dataset IDs for recovery
  result TEXT,                      -- JSON: full EnrichmentComplete on finish
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

## 2. Backend: Job management functions

In `apifyEnrichmentService.ts`, add:

- `createJob(opts): string` — INSERT row, return job ID (use `crypto.randomUUID()`)
- `getJob(id): EnrichmentJob | null` — SELECT by ID
- `getActiveJob(): EnrichmentJob | null` — SELECT where status IN ('pending','running')
- `updateJobProgress(id, progress)` — UPDATE current counts + current_contact_name
- `completeJob(id, result)` / `failJob(id, error)` — UPDATE status + result/error

## 3. Backend: Refactor `enrichContacts()` to track job state

Currently `enrichContacts()` takes an `onProgress` callback. Change it to also accept a `jobId` parameter:

- On start: update job status to `'running'`, set `started_at`
- After each `startApifyRun()`: append `datasetId` to job's `apify_dataset_ids` array
- On each progress update: call `updateJobProgress(jobId, ...)` (write to DB)
- On completion: call `completeJob(jobId, result)` with full result JSON
- On error: call `failJob(jobId, errorMessage)`

The `onProgress` callback stays for backwards compat but the DB is the source of truth.

## 4. Backend: `fetchWithRetry()` helper

Add retry wrapper (from resilience plan):
- 3 attempts, exponential backoff 5s/10s/20s
- Only retry 5xx and network errors
- Apply to `waitForApifyRun()` status check and `getApifyResults()` dataset fetch

## 5. Backend: `recoverFromDataset()` function

Export function that skips submit+poll, goes straight to fetch+process from a known dataset ID. Creates a job row so the UI can track it. Reuses same result-processing logic as `enrichContacts()`.

## 6. Backend: Fix `/pub/` URL support

In `extractPublicIdentifier()`, expand regex to match both `/in/` and `/pub/` URL formats. For `/pub/` URLs, use the full path segment as identifier.

## 7. Backend: New API endpoints

Replace the SSE `POST /linkedin/start` with:

```
POST /api/enrich/linkedin/job
  Body: { includeAlreadyEnriched?, limit?, datasetId? }
  → Creates job, kicks off enrichContacts() in background (don't await), returns { jobId }
  → If datasetId provided, runs recoverFromDataset() instead

GET /api/enrich/linkedin/job/:id
  → Returns job row (status, progress counts, result if complete)

GET /api/enrich/linkedin/jobs/active
  → Returns the currently running/pending job (if any), so UI can reconnect on page load
```

The key: the POST handler calls `enrichContacts()` but does NOT `await` it — it fires and returns immediately. The enrichment runs in the background on the Node.js event loop.

Keep the old SSE `/start` endpoint working for now (can remove later).

## 8. Frontend: Types

Add to `types.ts`:
```typescript
export interface EnrichmentJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalContacts: number;
  currentContact: number;
  succeededCount: number;
  failedCount: number;
  currentContactName: string | null;
  result: LinkedInEnrichmentResult | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}
```

## 9. Frontend: Hooks

In `enrichHooks.ts`:

- `useStartEnrichmentJob()` — mutation that POSTs to `/job`, stores returned `jobId` in localStorage
- `useEnrichmentJob(jobId)` — TanStack Query with `refetchInterval: 2000` while status is `pending`/`running`, stops polling when `completed`/`failed`
- `useActiveEnrichmentJob()` — on mount, GET `/jobs/active` to reconnect to a running job (e.g. after page navigation)
- `useStartRecoveryJob(datasetId)` — mutation that POSTs to `/job` with `datasetId`

## 10. Frontend: EnrichView changes

- On mount: check for active job via `useActiveEnrichmentJob()`, also check localStorage for last `jobId`
- If active job found: show progress UI (same progress bar, just driven by polling instead of SSE)
- "Start Enrichment" button → calls `useStartEnrichmentJob()`, saves jobId
- Progress display: driven by polled `EnrichmentJob` data instead of SSE events
- On completion: show results, invalidate queries, clear localStorage
- Add "Recover from Dataset" section: text input + button (from resilience plan)

## Verification

1. `cd backend && npx tsc --noEmit` + `cd frontend && npx tsc --noEmit`
2. Start enrichment, navigate away from page, come back — should see progress continuing
3. Refresh browser during enrichment — should reconnect to active job
4. Test dataset recovery: paste Apify dataset ID, click Recover
5. Test retry: enrichment should survive transient 5xx during polling
6. Check: `SELECT * FROM enrichment_jobs ORDER BY created_at DESC LIMIT 5`

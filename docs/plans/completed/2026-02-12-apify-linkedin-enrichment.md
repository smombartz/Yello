# Replace Apollo.io with Apify LinkedIn Profile Scraper

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Apollo.io People Match API with the Apify `supreme_coder/linkedin-profile-scraper` actor for LinkedIn profile enrichment, gaining richer profile data (about/bio, education, skills, positions history) at lower cost ($0.003/profile).

**Architecture:** The current per-contact sequential Apollo API calls are replaced with batch processing via the Apify Actor REST API. All LinkedIn URLs are submitted in a single actor run (up to 1500 per batch), the backend polls for completion, then maps results back to contacts and stores them. The SSE progress streaming protocol and frontend remain largely unchanged.

**Tech Stack:** Apify REST API v2 (no new npm dependencies, uses native `fetch`), existing Fastify SSE pattern, existing SQLite `linkedin_enrichment` table.

---

## Context & Research

### Apify Actor Details
- **Actor:** `supreme_coder~linkedin-profile-scraper` (ID: `yZnhB5JewWf9xSmoM`)
- **Pricing:** $0.003/profile + $0.002/actor-start (256MB)
- **Max URLs per run:** 1500
- **Input format:** `{ urls: [{ url: "https://www.linkedin.com/in/username" }, ...] }`
- **Auth:** Bearer token via `Authorization: Bearer <token>` header
- **API endpoint:** `POST https://api.apify.com/v2/acts/supreme_coder~linkedin-profile-scraper/runs`
- **Poll status:** `GET https://api.apify.com/v2/actor-runs/{runId}?token=<token>`
- **Get results:** `GET https://api.apify.com/v2/datasets/{datasetId}/items?token=<token>`

### Apify Output Fields (mapped to our schema)
| Apify Output Field | Our `LinkedInEnrichmentData` Field |
|---|---|
| `firstName` | `linkedinFirstName` |
| `lastName` | `linkedinLastName` |
| `headline` | `headline` |
| `summary` | `about` |
| `jobTitle` (or `positions[0].title`) | `jobTitle` |
| `companyName` | `companyName` |
| `companyLinkedinUrl` | `companyLinkedinUrl` |
| `industryName` | `industry` |
| `geoCountryName` (or `countryCode`) | `country` |
| `geoLocationName` | `location` |
| `currentCompany.followerCount` | `followersCount` |
| `educations[]` → mapped to strings | `education` |
| `skills[]` | `skills` |
| `pictureUrl` | `photoLinkedin` |

### Files to Modify
1. `backend/src/services/apolloEnrichmentService.ts` → **Rename to** `apifyEnrichmentService.ts`
2. `backend/src/routes/enrich.ts` → Update import path and error messages
3. `frontend/src/components/EnrichView.tsx` → Update `APOLLO_API_KEY` → `APIFY_API_TOKEN` in UI text
4. `CLAUDE.md` → Update environment variable documentation

### Files That Stay Unchanged
- Database schema (`linkedin_enrichment` table) - same columns
- `backend/src/types/index.ts` - `LinkedInEnrichment` interface unchanged
- `frontend/src/api/types.ts` - same SSE event types
- `frontend/src/api/enrichHooks.ts` - same SSE protocol
- `frontend/src/components/ContactFormSections.tsx` - same display component
- `backend/src/routes/contacts.ts` - same enrichment data query

---

## Task 1: Create the Apify Enrichment Service

**Files:**
- Create: `backend/src/services/apifyEnrichmentService.ts`

**Step 1: Create the new service file**

Copy `apolloEnrichmentService.ts` as a starting point and rewrite the API-specific parts. Keep all the database, summary, and export interfaces identical.

```typescript
/**
 * LinkedIn Enrichment Service using Apify LinkedIn Profile Scraper
 * Actor: supreme_coder/linkedin-profile-scraper
 * Stores enriched data separately from contact data (never overwrites)
 */

import { getDatabase } from './database.js';

// Keep all existing interfaces exactly as-is:
// LinkedInEnrichmentSummary, ContactForEnrichment, LinkedInEnrichmentData,
// EnrichmentResult, EnrichmentProgress, EnrichedContactInfo, EnrichmentComplete

// Replace Apollo types with Apify types:
interface ApifyProfileResult {
  firstName?: string;
  lastName?: string;
  headline?: string;
  summary?: string;
  occupation?: string;
  jobTitle?: string;
  companyName?: string;
  companyLinkedinUrl?: string;
  companyPublicId?: string;
  industryName?: string;
  countryCode?: string;
  geoCountryName?: string;
  geoLocationName?: string;
  pictureUrl?: string;
  publicIdentifier?: string;
  positions?: Array<{
    title?: string;
    companyName?: string;
    locationName?: string;
    description?: string;
    employmentType?: string;
    timePeriod?: {
      startDate?: { month?: number; year?: number };
      endDate?: { month?: number; year?: number };
    };
  }>;
  educations?: Array<{
    degreeName?: string;
    fieldOfStudy?: string;
    schoolName?: string;
    timePeriod?: {
      startDate?: { year?: number };
      endDate?: { year?: number };
    };
  }>;
  skills?: string[];
  certifications?: Array<{ name?: string; authority?: string }>;
  languages?: Array<{ name?: string; proficiency?: string }>;
  honors?: Array<{ title?: string }>;
  currentCompany?: {
    followerCount?: number;
    name?: string;
    industries?: Array<{ name?: string }>;
  };
}

interface ApifyRunResponse {
  data: {
    id: string;
    status: string;
    defaultDatasetId: string;
  };
}

interface ApifyRunStatus {
  data: {
    id: string;
    status: string; // READY, RUNNING, SUCCEEDED, FAILED, ABORTING, ABORTED, TIMED-OUT
    defaultDatasetId: string;
  };
}

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || '';
const APIFY_ACTOR_ID = 'supreme_coder~linkedin-profile-scraper';
const APIFY_BASE_URL = 'https://api.apify.com/v2';
const MAX_URLS_PER_RUN = 1500;

// Replace isLinkedInEnrichmentConfigured:
export function isLinkedInEnrichmentConfigured(): boolean {
  return APIFY_API_TOKEN.length > 0;
}

// Keep these functions EXACTLY as-is from apolloEnrichmentService.ts:
// - getEnrichmentSummary(includeAlreadyEnriched)
// - getContactsForEnrichment(includeAlreadyEnriched)
// - normalizeLinkedInUrl(url)
// - storeEnrichmentData(contactId, data, rawResponse)
// - getEnrichmentDataForContact(contactId) [private helper]

/**
 * Extract public identifier from LinkedIn URL for matching results back to contacts
 */
function extractPublicIdentifier(url: string): string | null {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const match = urlObj.pathname.match(/\/in\/([^/]+)/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Start an Apify actor run with the given LinkedIn URLs
 */
async function startApifyRun(urls: Array<{ url: string }>): Promise<ApifyRunResponse> {
  console.log(`[Enrich] Starting Apify run with ${urls.length} URLs`);

  const response = await fetch(`${APIFY_BASE_URL}/acts/${APIFY_ACTOR_ID}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${APIFY_API_TOKEN}`,
    },
    body: JSON.stringify({ urls }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Enrich] Apify API error (${response.status}): ${errorText}`);
    throw new Error(`Apify API error (${response.status}): ${errorText}`);
  }

  const result = await response.json() as ApifyRunResponse;
  console.log(`[Enrich] Apify run started: runId=${result.data.id}, status=${result.data.status}`);
  return result;
}

/**
 * Poll Apify run status until completion
 */
async function waitForApifyRun(
  runId: string,
  onPoll?: () => void
): Promise<string> {
  const pollInterval = 5000; // 5 seconds
  const maxWaitTime = 30 * 60 * 1000; // 30 minutes
  const startTime = Date.now();

  let pollCount = 0;

  while (Date.now() - startTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const response = await fetch(
      `${APIFY_BASE_URL}/actor-runs/${runId}?token=${APIFY_API_TOKEN}`
    );

    if (!response.ok) {
      console.error(`[Enrich] Failed to check run status: ${response.status}`);
      throw new Error(`Failed to check run status: ${response.status}`);
    }

    const data = await response.json() as ApifyRunStatus;
    const status = data.data.status;
    pollCount++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Enrich] Poll #${pollCount}: runId=${runId}, status=${status}, elapsed=${elapsed}s`);

    if (onPoll) onPoll();

    if (status === 'SUCCEEDED') {
      console.log(`[Enrich] Run completed successfully after ${elapsed}s`);
      return data.data.defaultDatasetId;
    } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      console.error(`[Enrich] Run ${status.toLowerCase()} after ${elapsed}s`);
      throw new Error(`Apify run ${status.toLowerCase()}`);
    }
    // READY or RUNNING - continue polling
  }

  console.error(`[Enrich] Run timed out after 30 minutes`);
  throw new Error('Apify run timed out after 30 minutes');
}

/**
 * Retrieve dataset items from a completed Apify run
 */
async function getApifyResults(datasetId: string): Promise<ApifyProfileResult[]> {
  console.log(`[Enrich] Retrieving results from dataset ${datasetId}`);

  const response = await fetch(
    `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}&clean=true`
  );

  if (!response.ok) {
    console.error(`[Enrich] Failed to retrieve results: ${response.status}`);
    throw new Error(`Failed to retrieve results: ${response.status}`);
  }

  const results = await response.json() as ApifyProfileResult[];
  console.log(`[Enrich] Retrieved ${results.length} profile results from dataset`);
  return results;
}

/**
 * Map Apify profile result to our enrichment data format
 */
function mapApifyToEnrichmentData(profile: ApifyProfileResult): LinkedInEnrichmentData {
  // Map education to string array
  const education = profile.educations?.map(edu => {
    const parts: string[] = [];
    if (edu.degreeName) parts.push(edu.degreeName);
    if (edu.fieldOfStudy) parts.push(`in ${edu.fieldOfStudy}`);
    if (edu.schoolName) parts.push(`at ${edu.schoolName}`);
    return parts.join(' ') || null;
  }).filter((e): e is string => e !== null) || null;

  return {
    linkedinFirstName: profile.firstName || null,
    linkedinLastName: profile.lastName || null,
    headline: profile.headline || profile.occupation || null,
    about: profile.summary || null,
    jobTitle: profile.jobTitle || profile.positions?.[0]?.title || null,
    companyName: profile.companyName || profile.currentCompany?.name || null,
    companyLinkedinUrl: profile.companyLinkedinUrl ||
      (profile.companyPublicId
        ? `https://www.linkedin.com/company/${profile.companyPublicId}`
        : null),
    industry: profile.industryName || profile.currentCompany?.industries?.[0]?.name || null,
    country: profile.geoCountryName || profile.countryCode || null,
    location: profile.geoLocationName || null,
    followersCount: profile.currentCompany?.followerCount || null,
    education: education && education.length > 0 ? education : null,
    skills: profile.skills && profile.skills.length > 0 ? profile.skills : null,
    photoLinkedin: profile.pictureUrl || null,
  };
}

/**
 * Enrich multiple contacts via Apify batch processing with progress callback
 */
export async function enrichContacts(
  includeAlreadyEnriched: boolean,
  onProgress?: (progress: EnrichmentProgress) => void,
  limit?: number
): Promise<EnrichmentComplete> {
  if (!isLinkedInEnrichmentConfigured()) {
    throw new Error('APIFY_API_TOKEN not configured');
  }

  let contacts = getContactsForEnrichment(includeAlreadyEnriched);
  if (limit && limit > 0) {
    contacts = contacts.slice(0, limit);
  }

  const total = contacts.length;
  console.log(`[Enrich] Starting enrichment: ${total} contacts, includeAlreadyEnriched=${includeAlreadyEnriched}, limit=${limit ?? 'none'}`);

  if (total === 0) {
    console.log(`[Enrich] No contacts to enrich, skipping`);
    return { succeeded: 0, failed: 0, errors: [], enrichedContacts: [] };
  }

  // Phase 1: Submit batch to Apify
  if (onProgress) {
    onProgress({ current: 0, total, succeeded: 0, failed: 0, currentContact: 'Submitting profiles to scraper...' });
  }

  // Build URL list and identifier map for matching results
  const identifierToContacts = new Map<string, ContactForEnrichment[]>();
  const urlList: Array<{ url: string }> = [];

  for (const contact of contacts) {
    const normalized = normalizeLinkedInUrl(contact.linkedinUrl);
    const identifier = extractPublicIdentifier(normalized);
    if (identifier) {
      if (!identifierToContacts.has(identifier)) {
        identifierToContacts.set(identifier, []);
      }
      identifierToContacts.get(identifier)!.push(contact);
    }
    urlList.push({ url: normalized });
  }

  // Split into batches if needed (max 1500 per run)
  const batches: Array<Array<{ url: string }>> = [];
  for (let i = 0; i < urlList.length; i += MAX_URLS_PER_RUN) {
    batches.push(urlList.slice(i, i + MAX_URLS_PER_RUN));
  }

  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ contactId: number; contactName: string; reason: string }> = [];
  const enrichedContacts: EnrichedContactInfo[] = [];
  const matchedContactIds = new Set<number>();

  for (const batch of batches) {
    // Start Apify run
    const run = await startApifyRun(batch);

    // Phase 2: Poll for completion
    if (onProgress) {
      onProgress({
        current: 0, total, succeeded, failed,
        currentContact: 'Scraping LinkedIn profiles (this may take a few minutes)...',
      });
    }

    const datasetId = await waitForApifyRun(run.data.id, () => {
      if (onProgress) {
        onProgress({
          current: succeeded + failed, total, succeeded, failed,
          currentContact: 'Scraping LinkedIn profiles...',
        });
      }
    });

    // Phase 3: Retrieve and process results
    const profiles = await getApifyResults(datasetId);

    if (onProgress) {
      onProgress({
        current: succeeded + failed, total, succeeded, failed,
        currentContact: 'Processing results...',
      });
    }

    // Match results to contacts and store
    for (const profile of profiles) {
      const identifier = profile.publicIdentifier?.toLowerCase();
      if (!identifier) continue;

      const matchingContacts = identifierToContacts.get(identifier);
      if (!matchingContacts) continue;

      const enrichmentData = mapApifyToEnrichmentData(profile);

      // Check if we got meaningful data
      const hasMeaningfulData = enrichmentData.linkedinFirstName ||
        enrichmentData.headline || enrichmentData.companyName;

      for (const contact of matchingContacts) {
        if (matchedContactIds.has(contact.contactId)) continue;
        matchedContactIds.add(contact.contactId);

        if (!hasMeaningfulData) {
          failed++;
          console.log(`[Enrich] No useful data for "${contact.displayName}" (id=${contact.contactId})`);
          errors.push({
            contactId: contact.contactId,
            contactName: contact.displayName,
            reason: 'No useful profile data returned',
          });
        } else {
          storeEnrichmentData(contact.contactId, enrichmentData, JSON.stringify(profile));
          succeeded++;
          console.log(`[Enrich] Stored enrichment for "${contact.displayName}" (id=${contact.contactId}): ${enrichmentData.jobTitle ?? ''} at ${enrichmentData.companyName ?? ''}`);
          enrichedContacts.push({
            contactId: contact.contactId,
            contactName: contact.displayName,
            headline: enrichmentData.headline,
            jobTitle: enrichmentData.jobTitle,
            companyName: enrichmentData.companyName,
          });
        }

        if (onProgress) {
          onProgress({
            current: succeeded + failed, total, succeeded, failed,
            currentContact: contact.displayName,
          });
        }
      }
    }
  }

  // Mark unmatched contacts as failed
  for (const contact of contacts) {
    if (!matchedContactIds.has(contact.contactId)) {
      failed++;
      console.log(`[Enrich] No match for "${contact.displayName}" (id=${contact.contactId}, url=${contact.linkedinUrl})`);
      errors.push({
        contactId: contact.contactId,
        contactName: contact.displayName,
        reason: 'Profile not found in scraper results',
      });
      if (onProgress) {
        onProgress({
          current: succeeded + failed, total, succeeded, failed,
          currentContact: contact.displayName,
        });
      }
    }
  }

  console.log(`[Enrich] Enrichment complete: ${succeeded} succeeded, ${failed} failed, ${total} total`);
  return { succeeded, failed, errors, enrichedContacts };
}
```

**Step 2: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/services/apifyEnrichmentService.ts
git commit -m "feat: add Apify LinkedIn enrichment service"
```

---

## Task 2: Replace Apollo Service with Apify Service

**Files:**
- Delete: `backend/src/services/apolloEnrichmentService.ts`
- Modify: `backend/src/routes/enrich.ts` (lines 3-8)

**Step 1: Update the route imports**

In `backend/src/routes/enrich.ts`, change line 3-8:

```typescript
// OLD:
import {
  isLinkedInEnrichmentConfigured,
  getEnrichmentSummary,
  enrichContacts,
  EnrichmentProgress,
} from '../services/apolloEnrichmentService.js';

// NEW:
import {
  isLinkedInEnrichmentConfigured,
  getEnrichmentSummary,
  enrichContacts,
  EnrichmentProgress,
} from '../services/apifyEnrichmentService.js';
```

**Step 2: Update the error message**

In `backend/src/routes/enrich.ts`, change line 55-57:

```typescript
// OLD:
return reply.status(400).send({
  error: 'LinkedIn enrichment not configured. Set APOLLO_API_KEY environment variable.',
});

// NEW:
return reply.status(400).send({
  error: 'LinkedIn enrichment not configured. Set APIFY_API_TOKEN environment variable.',
});
```

**Step 3: Delete the old Apollo service**

```bash
rm backend/src/services/apolloEnrichmentService.ts
```

**Step 4: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add backend/src/routes/enrich.ts
git rm backend/src/services/apolloEnrichmentService.ts
git commit -m "refactor: switch enrichment route from Apollo to Apify service"
```

---

## Task 3: Update Frontend UI Text

**Files:**
- Modify: `frontend/src/components/EnrichView.tsx` (line 115)

**Step 1: Update the config warning text**

In `frontend/src/components/EnrichView.tsx`, change line 115:

```typescript
// OLD:
<p>Set the <code>APOLLO_API_KEY</code> environment variable to enable LinkedIn enrichment.</p>

// NEW:
<p>Set the <code>APIFY_API_TOKEN</code> environment variable to enable LinkedIn enrichment.</p>
```

**Step 2: Verify frontend builds**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/components/EnrichView.tsx
git commit -m "fix: update env var name in enrichment UI from Apollo to Apify"
```

---

## Task 4: Update Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the environment variable section**

In `CLAUDE.md`, replace the `APOLLO_API_KEY` line:

```markdown
# OLD:
APOLLO_API_KEY=<for LinkedIn enrichment - get from apollo.io>

# NEW:
APIFY_API_TOKEN=<for LinkedIn enrichment - get from apify.com>
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update env var from APOLLO_API_KEY to APIFY_API_TOKEN"
```

---

## Task 5: Manual Integration Test

**Step 1: Set environment variable**

```bash
export APIFY_API_TOKEN=<your-token-from-apify-console>
```

**Step 2: Start the dev servers**

```bash
npm run dev
```

**Step 3: Test the summary endpoint**

```bash
curl http://localhost:3000/api/enrich/linkedin/summary
```

Expected: `{"configured":true,"totalWithLinkedIn":N,"alreadyEnriched":N,"pendingEnrichment":N}`

**Step 4: Test enrichment with a small batch**

In the UI at `http://localhost:5173/enrich`:
1. Set "Enrich up to" to 2
2. Click "Start Enrichment"
3. Observe progress: should show "Submitting..." → "Scraping..." → individual contact progress → "Complete"
4. Verify enriched data appears in contact detail views

**Step 5: Shut down dev servers**

```bash
kill $(lsof -ti :3000) 2>/dev/null
kill $(lsof -ti :5173) 2>/dev/null
```

---

## Key Differences from Apollo Implementation

| Aspect | Apollo (old) | Apify (new) |
|---|---|---|
| Processing model | Sequential, one-at-a-time | Batch, all URLs in one run |
| Rate limiting | 7-second delay between requests | Handled by Apify internally |
| Cost per profile | Varies by Apollo plan | $0.003/profile + $0.002/start |
| Data richness | Limited (no about, education, skills) | Full profile (about, education, skills, certifications, languages) |
| Env variable | `APOLLO_API_KEY` | `APIFY_API_TOKEN` |
| API style | Direct REST call per profile | Actor run + poll + dataset retrieval |
| Max batch size | 1 | 1500 URLs per run |

## Risk Notes

- **URL matching:** Results are matched back to contacts via `publicIdentifier` extracted from LinkedIn URLs. If a URL format is unusual (e.g., not `/in/username`), the contact will show as "not found in scraper results".
- **Timeout:** The 30-minute max wait covers most batch sizes. For 1500 profiles, expect 10-20 minutes.
- **Apify downtime:** If the Apify service is down, enrichment will fail with a clear error message.

# Enrichment Stats Drilldown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make enrichment summary stats clickable to reveal contact lists, with each contact linking to its detail page. Add "Failed" and "No LinkedIn" categories alongside existing stats.

**Architecture:** Persist enrichment failures in a new DB table so they survive across sessions. Expand the summary endpoint to return all 4 category counts. Add a new paginated endpoint to fetch contacts per category. Frontend stat cards become expandable panels showing contact lists.

**Tech Stack:** SQLite (new table + migration), Fastify endpoint, React expandable panels, TanStack Query

---

### Task 1: Create linkedin_enrichment_failures table

**Files:**
- Modify: `backend/src/services/database.ts`

**Step 1: Add migration function**

In `database.ts`, find the `runLinkedInEnrichmentMigration()` function. After the existing migrations (positions, certifications, languages, honors columns), add a new migration that creates the failures table:

```sql
CREATE TABLE IF NOT EXISTS linkedin_enrichment_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  error_reason TEXT NOT NULL,
  attempted_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_linkedin_enrichment_failures_contact_id
  ON linkedin_enrichment_failures(contact_id);
```

Use the same pattern as existing migrations — check if the table exists first with a try/catch or `IF NOT EXISTS`.

**Step 2: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: passes

**Step 3: Commit**

```
feat: add linkedin_enrichment_failures table
```

---

### Task 2: Persist failures during enrichment

**Files:**
- Modify: `backend/src/services/apifyEnrichmentService.ts`

**Step 1: Add helper functions**

Add two functions near `storeEnrichmentData()`:

```typescript
function storeEnrichmentFailure(contactId: number, reason: string): void {
  const db = getDatabase();
  db.prepare(`
    INSERT OR REPLACE INTO linkedin_enrichment_failures (contact_id, error_reason, attempted_at)
    VALUES (?, ?, datetime('now'))
  `).run(contactId, reason);
}

function clearEnrichmentFailure(contactId: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM linkedin_enrichment_failures WHERE contact_id = ?').run(contactId);
}
```

**Step 2: Call storeEnrichmentFailure on failures**

In `enrichContacts()`, find the 3 places where contacts are added to `state.errors`:

1. After `"Could not extract LinkedIn identifier"` (~line 1008) — add `storeEnrichmentFailure(contact.contactId, 'Could not extract LinkedIn identifier from URL')`
2. After `"No useful profile data returned"` (~line 1037) — add `storeEnrichmentFailure(contact.contactId, 'No useful profile data returned')`
3. After `"Profile not found in scraper results"` (~line 1082) — add `storeEnrichmentFailure(contact.contactId, 'Profile not found in scraper results')`

Also find the batch failure catch block that marks all contacts as failed — add `storeEnrichmentFailure` for each.

**Step 3: Clear failure on success**

After `storeEnrichmentData()` is called (~line 1042), add:
```typescript
clearEnrichmentFailure(contact.contactId);
```

**Step 4: Same for recoverFromDataset()**

Apply the same pattern in `recoverFromDataset()` — persist failures, clear on success.

**Step 5: Verify**

Run: `cd backend && npx tsc --noEmit`

**Step 6: Commit**

```
feat: persist enrichment failures to database
```

---

### Task 3: Expand summary endpoint and add contacts-by-category endpoint

**Files:**
- Modify: `backend/src/routes/enrich.ts`
- Modify: `backend/src/services/apifyEnrichmentService.ts`

**Step 1: Update getEnrichmentSummary to return all categories**

In `apifyEnrichmentService.ts`, update `getEnrichmentSummary()` to also query:
- Total contacts (all non-archived): `SELECT COUNT(*) FROM contacts WHERE archived_at IS NULL`
- Failed count: `SELECT COUNT(*) FROM linkedin_enrichment_failures`
- Calculate `noLinkedIn = totalContacts - totalWithLinkedIn`

Return shape becomes:
```typescript
{
  configured: boolean;
  totalContacts: number;
  enriched: number;        // was alreadyEnriched
  readyToEnrich: number;   // was pendingEnrichment
  noLinkedIn: number;
  failed: number;
}
```

Keep the old field names (`alreadyEnriched`, `pendingEnrichment`) as aliases so existing code doesn't break during the transition.

**Step 2: Add contacts-by-category endpoint**

In `enrich.ts`, add a new route:

```typescript
// GET /api/enrich/linkedin/contacts?category=enriched|ready|failed|no-linkedin
fastify.get('/linkedin/contacts', async (request, reply) => {
  const { category } = request.query as { category: string };
  const db = getDatabase();

  let contacts: { id: number; displayName: string; company: string | null; linkedinUrl: string | null; errorReason?: string | null; enrichedAt?: string | null }[];

  switch (category) {
    case 'enriched':
      contacts = db.prepare(`
        SELECT c.id, c.display_name, c.company,
          (SELECT profile_url FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin' LIMIT 1) as linkedin_url,
          le.enriched_at
        FROM contacts c
        INNER JOIN linkedin_enrichment le ON le.contact_id = c.id
        WHERE c.archived_at IS NULL
        ORDER BY le.enriched_at DESC
      `).all() as any[];
      break;

    case 'ready':
      contacts = db.prepare(`
        SELECT c.id, c.display_name, c.company,
          COALESCE(
            (SELECT profile_url FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin' LIMIT 1),
            (SELECT url FROM contact_urls WHERE contact_id = c.id AND url LIKE '%linkedin.com%' LIMIT 1)
          ) as linkedin_url
        FROM contacts c
        WHERE c.archived_at IS NULL
          AND (
            EXISTS (SELECT 1 FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin')
            OR EXISTS (SELECT 1 FROM contact_urls WHERE contact_id = c.id AND url LIKE '%linkedin.com%')
          )
          AND NOT EXISTS (SELECT 1 FROM linkedin_enrichment WHERE contact_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM linkedin_enrichment_failures WHERE contact_id = c.id)
        ORDER BY c.display_name
      `).all() as any[];
      break;

    case 'failed':
      contacts = db.prepare(`
        SELECT c.id, c.display_name, c.company,
          (SELECT profile_url FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin' LIMIT 1) as linkedin_url,
          lef.error_reason, lef.attempted_at
        FROM contacts c
        INNER JOIN linkedin_enrichment_failures lef ON lef.contact_id = c.id
        WHERE c.archived_at IS NULL
        ORDER BY lef.attempted_at DESC
      `).all() as any[];
      break;

    case 'no-linkedin':
      contacts = db.prepare(`
        SELECT c.id, c.display_name, c.company, NULL as linkedin_url
        FROM contacts c
        WHERE c.archived_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM contact_social_profiles WHERE contact_id = c.id AND platform = 'linkedin')
          AND NOT EXISTS (SELECT 1 FROM contact_urls WHERE contact_id = c.id AND url LIKE '%linkedin.com%')
        ORDER BY c.display_name
      `).all() as any[];
      break;

    default:
      return reply.code(400).send({ error: 'Invalid category' });
  }

  return {
    category,
    total: contacts.length,
    contacts: contacts.map(c => ({
      id: c.id,
      displayName: c.display_name,
      company: c.company,
      linkedinUrl: c.linkedin_url,
      errorReason: c.errorReason ?? null,
      enrichedAt: c.enrichedAt ?? null,
    }))
  };
});
```

**Step 3: Verify**

Run: `cd backend && npx tsc --noEmit`

**Step 4: Commit**

```
feat: add enrichment contacts-by-category endpoint and expanded summary
```

---

### Task 4: Update frontend types and hooks

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/enrichHooks.ts`

**Step 1: Update LinkedInEnrichmentSummary type**

```typescript
export interface LinkedInEnrichmentSummary {
  configured: boolean;
  totalContacts: number;
  enriched: number;
  readyToEnrich: number;
  noLinkedIn: number;
  failed: number;
  // Keep old names for backwards compatibility during transition
  totalWithLinkedIn: number;
  alreadyEnriched: number;
  pendingEnrichment: number;
}
```

**Step 2: Add new type for category contacts**

```typescript
export interface EnrichmentCategoryContact {
  id: number;
  displayName: string;
  company: string | null;
  linkedinUrl: string | null;
  errorReason: string | null;
  enrichedAt: string | null;
}

export interface EnrichmentCategoryResponse {
  category: string;
  total: number;
  contacts: EnrichmentCategoryContact[];
}
```

**Step 3: Add useEnrichmentCategoryContacts hook**

In `enrichHooks.ts`:

```typescript
export function useEnrichmentCategoryContacts(category: string | null) {
  return useQuery({
    queryKey: ['enrichment-category', category],
    queryFn: () => fetchApi<EnrichmentCategoryResponse>(`/api/enrich/linkedin/contacts?category=${category}`),
    enabled: !!category,
  });
}
```

**Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit`

**Step 5: Commit**

```
feat: add frontend types and hooks for enrichment categories
```

---

### Task 5: Update EnrichView with clickable stat cards

**Files:**
- Modify: `frontend/src/components/EnrichView.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Add expandable category state**

Add state to EnrichView:
```typescript
const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
```

Import and use the new hook:
```typescript
const { data: categoryContacts, isLoading: categoryLoading } = useEnrichmentCategoryContacts(expandedCategory);
```

**Step 2: Replace the 3 stat cards with 4 clickable stat cards**

Replace the current summary stats section with 4 cards:

| Card | Count field | Color | Category key |
|------|------------|-------|--------------|
| Enriched | `summary.enriched` | green | `enriched` |
| Ready to Enrich | `summary.readyToEnrich` | purple (primary) | `ready` |
| Failed | `summary.failed` | red | `failed` |
| No LinkedIn | `summary.noLinkedIn` | gray | `no-linkedin` |

Each card is a `<button>` with class `enrich-stat-card` (and `expanded` modifier when active). Clicking toggles `expandedCategory` — click same card again to collapse.

Card structure:
```tsx
<button
  className={`enrich-stat-card enrich-stat-${key} ${expandedCategory === key ? 'expanded' : ''}`}
  onClick={() => setExpandedCategory(prev => prev === key ? null : key)}
>
  <div className="enrich-stat-count">{count}</div>
  <div className="enrich-stat-label">{label}</div>
</button>
```

**Step 3: Add expandable contact list panel**

Below the stat cards row, render the expanded panel when a category is selected:

```tsx
{expandedCategory && (
  <div className="enrich-category-panel">
    <div className="enrich-category-header">
      <h4>{panelTitle} ({categoryContacts?.total ?? '...'})</h4>
      <button onClick={() => setExpandedCategory(null)} className="enrich-category-close">
        <Icon name="xmark" />
      </button>
    </div>
    {categoryLoading ? (
      <div className="loading-state"><span aria-busy="true">Loading...</span></div>
    ) : (
      <div className="enrich-category-list">
        {categoryContacts?.contacts.map(contact => (
          <a
            key={contact.id}
            href={`/contacts/${contact.id}`}
            className="enrich-category-contact"
            onClick={(e) => { e.preventDefault(); navigate(`/contacts/${contact.id}`); }}
          >
            <span className="enrich-category-contact-name">{contact.displayName}</span>
            {contact.company && <span className="enrich-category-contact-company">{contact.company}</span>}
            {contact.errorReason && <span className="enrich-category-contact-error">{contact.errorReason}</span>}
            {contact.enrichedAt && <span className="enrich-category-contact-date">{new Date(contact.enrichedAt).toLocaleDateString()}</span>}
            <Icon name="chevron-right" className="enrich-category-contact-arrow" />
          </a>
        ))}
        {categoryContacts?.contacts.length === 0 && (
          <div className="enrich-category-empty">No contacts in this category</div>
        )}
      </div>
    )}
  </div>
)}
```

Add `useNavigate` import if not already present.

**Step 4: Add styles**

```css
/* Enrichment Stat Cards */
.enrich-stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.enrich-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--ds-border-color);
  background: var(--ds-bg-primary);
  cursor: pointer;
  transition: all 0.15s;
}

.enrich-stat-card:hover {
  border-color: var(--ds-text-secondary);
  background: var(--ds-bg-secondary);
}

.enrich-stat-card.expanded {
  border-color: var(--ds-color-primary);
  box-shadow: 0 0 0 1px var(--ds-color-primary);
}

.enrich-stat-count {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
}

.enrich-stat-label {
  font-size: 0.75rem;
  color: var(--ds-text-secondary);
}

.enrich-stat-enriched .enrich-stat-count { color: var(--ds-color-success); }
.enrich-stat-ready .enrich-stat-count { color: var(--ds-color-primary); }
.enrich-stat-failed .enrich-stat-count { color: var(--ds-color-error); }
.enrich-stat-no-linkedin .enrich-stat-count { color: var(--ds-text-tertiary); }

/* Category Drilldown Panel */
.enrich-category-panel {
  border: 1px solid var(--ds-border-color);
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  overflow: hidden;
}

.enrich-category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--ds-bg-secondary);
  border-bottom: 1px solid var(--ds-border-color);
}

.enrich-category-header h4 {
  margin: 0;
  font-size: 0.875rem;
}

.enrich-category-close {
  background: none;
  border: none;
  color: var(--ds-text-tertiary);
  cursor: pointer;
  padding: 0.25rem;
}

.enrich-category-close:hover {
  color: var(--ds-text-primary);
}

.enrich-category-list {
  max-height: 400px;
  overflow-y: auto;
}

.enrich-category-contact {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border-bottom: 1px solid var(--ds-border-color);
  text-decoration: none;
  color: var(--ds-text-primary);
  cursor: pointer;
  transition: background 0.1s;
}

.enrich-category-contact:last-child {
  border-bottom: none;
}

.enrich-category-contact:hover {
  background: var(--ds-bg-secondary);
}

.enrich-category-contact-name {
  font-weight: 500;
  font-size: 0.875rem;
}

.enrich-category-contact-company {
  color: var(--ds-text-secondary);
  font-size: 0.8125rem;
}

.enrich-category-contact-error {
  color: var(--ds-color-error);
  font-size: 0.75rem;
  margin-left: auto;
}

.enrich-category-contact-date {
  color: var(--ds-text-tertiary);
  font-size: 0.75rem;
  margin-left: auto;
}

.enrich-category-contact-arrow {
  color: var(--ds-text-tertiary);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.enrich-category-empty {
  padding: 2rem;
  text-align: center;
  color: var(--ds-text-tertiary);
  font-size: 0.875rem;
}

@media (max-width: 640px) {
  .enrich-stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

**Step 5: Verify**

Run: `cd frontend && npx tsc --noEmit`

**Step 6: Commit**

```
feat: clickable enrichment stat cards with contact drilldown
```

---

### Task 6: Update readyToEnrich count to exclude failures

**Files:**
- Modify: `backend/src/services/apifyEnrichmentService.ts`

**Step 1: Adjust readyToEnrich calculation**

In `getEnrichmentSummary()`, the `readyToEnrich` count should exclude contacts that have failed. Currently it's `totalWithLinkedIn - alreadyEnriched`. It should be `totalWithLinkedIn - alreadyEnriched - failed`.

This ensures the 4 categories are mutually exclusive and the counts make sense:
- `enriched + readyToEnrich + failed = totalWithLinkedIn`
- `totalWithLinkedIn + noLinkedIn = totalContacts`

**Step 2: Verify**

Run: `cd backend && npx tsc --noEmit`

**Step 3: Commit**

```
fix: exclude failed contacts from readyToEnrich count
```

---

### Task 7: Clear failures when re-enriching

**Files:**
- Modify: `backend/src/services/apifyEnrichmentService.ts`

**Step 1: Clear all failures at start of enrichment run**

At the beginning of `enrichContacts()`, before building the URL list, clear existing failures for contacts that will be re-attempted. If `includeAlreadyEnriched` is true, clear all failures. Otherwise, only clear failures for contacts that will be in this batch.

Simplest approach — clear failures for each contact as they are processed (either succeed → `clearEnrichmentFailure` already added in Task 2, or fail → `storeEnrichmentFailure` replaces via INSERT OR REPLACE).

No additional code needed if Task 2 was done correctly — failures are replaced on retry and cleared on success.

**Step 2: Verify manually**

Start the app, run enrichment, check that:
- Failed contacts show in "Failed" stat
- Re-running enrichment with same contacts clears/updates their failure records
- Successfully enriched contacts don't appear in "Failed"

**Step 3: Commit (if any changes needed)**

```
fix: clear enrichment failures on successful re-enrichment
```

---

### Task 8: Invalidate category queries after enrichment

**Files:**
- Modify: `frontend/src/api/enrichHooks.ts`

**Step 1: Invalidate enrichment-category queries on completion**

In `useLinkedInEnrichment()` and `useLinkedInRecovery()`, where `queryClient.invalidateQueries` is called after completion, add:

```typescript
queryClient.invalidateQueries({ queryKey: ['enrichment-category'] });
```

This ensures the drilldown lists refresh after an enrichment run completes.

**Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`

**Step 3: Commit**

```
feat: invalidate category queries after enrichment
```

---

## Verification Checklist

After all tasks:
1. `cd backend && npx tsc --noEmit` — passes
2. `cd frontend && npx tsc --noEmit` — passes
3. Navigate to Enrich page — 4 stat cards visible with correct counts
4. Click "Enriched" card — panel expands showing enriched contacts, each clickable to detail page
5. Click "Failed" card — shows failed contacts with error reasons
6. Click "No LinkedIn" card — shows contacts without LinkedIn URLs
7. Click "Ready to Enrich" card — shows contacts ready for enrichment
8. Run enrichment — stats update, failures persist across page reload
9. Click contact in any list — navigates to `/contacts/:id`

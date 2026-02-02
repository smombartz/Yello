# Invalid Links Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a top-level "Invalid Links" cleanup mode that removes invalid social links and URLs matching user-specified patterns.

**Architecture:** New cleanup mode alongside existing Empty/Problematic/Social Links. Backend service searches both `contact_social_profiles` and `contact_urls` tables for matching patterns, returns matches for preview, and deletes on confirmation.

**Tech Stack:** Fastify + better-sqlite3 + TypeScript (backend), React + TanStack Query (frontend)

---

### Task 1: Backend Service

**Files:**
- Create: `backend/src/services/invalidLinksCleanupService.ts`

**Step 1: Create the service file**

```typescript
import { getDatabase } from './database.js';
import { getPhotoUrl } from './photoProcessor.js';

// ============================================================
// Types
// ============================================================

export interface InvalidLinkMatch {
  contactId: number;
  contactName: string;
  source: 'social_profiles' | 'urls';
  platform: string | null;
  value: string;
  recordId: number;
}

export interface InvalidLinksSearchResult {
  matches: InvalidLinkMatch[];
  totalCount: number;
}

export interface InvalidLinksRemoveResult {
  deletedCount: number;
  deletedFromSocialProfiles: number;
  deletedFromUrls: number;
}

// ============================================================
// Search Functions
// ============================================================

/**
 * Search for invalid links matching the given patterns
 */
export function searchInvalidLinks(patterns: string[]): InvalidLinksSearchResult {
  if (patterns.length === 0) {
    return { matches: [], totalCount: 0 };
  }

  const db = getDatabase();
  const matches: InvalidLinkMatch[] = [];

  // Normalize patterns: lowercase, trim
  const normalizedPatterns = patterns.map(p => p.toLowerCase().trim()).filter(p => p.length > 0);

  if (normalizedPatterns.length === 0) {
    return { matches: [], totalCount: 0 };
  }

  // Search contact_social_profiles
  // Match if username equals or starts with pattern (for cases like profile.php?id=123)
  const socialProfiles = db.prepare(`
    SELECT
      sp.id as recordId,
      sp.contact_id as contactId,
      sp.platform,
      sp.username as value,
      c.display_name as contactName
    FROM contact_social_profiles sp
    JOIN contacts c ON sp.contact_id = c.id
    WHERE c.archived_at IS NULL
      AND sp.username IS NOT NULL
      AND sp.username != ''
  `).all() as Array<{
    recordId: number;
    contactId: number;
    platform: string;
    value: string;
    contactName: string;
  }>;

  for (const sp of socialProfiles) {
    const usernameLower = sp.value.toLowerCase();
    for (const pattern of normalizedPatterns) {
      if (usernameLower === pattern || usernameLower.startsWith(pattern)) {
        matches.push({
          contactId: sp.contactId,
          contactName: sp.contactName,
          source: 'social_profiles',
          platform: sp.platform,
          value: sp.value,
          recordId: sp.recordId,
        });
        break; // Only add once per record
      }
    }
  }

  // Search contact_urls
  // Match if any path segment equals the pattern
  const urls = db.prepare(`
    SELECT
      cu.id as recordId,
      cu.contact_id as contactId,
      cu.url as value,
      cu.label,
      c.display_name as contactName
    FROM contact_urls cu
    JOIN contacts c ON cu.contact_id = c.id
    WHERE c.archived_at IS NULL
      AND cu.url IS NOT NULL
      AND cu.url != ''
  `).all() as Array<{
    recordId: number;
    contactId: number;
    value: string;
    label: string | null;
    contactName: string;
  }>;

  for (const url of urls) {
    const urlLower = url.value.toLowerCase();
    // Extract path segments from URL
    const pathSegments = extractPathSegments(urlLower);

    for (const pattern of normalizedPatterns) {
      if (pathSegments.includes(pattern)) {
        matches.push({
          contactId: url.contactId,
          contactName: url.contactName,
          source: 'urls',
          platform: null,
          value: url.value,
          recordId: url.recordId,
        });
        break; // Only add once per record
      }
    }
  }

  // Sort by contact name
  matches.sort((a, b) => a.contactName.localeCompare(b.contactName));

  return {
    matches,
    totalCount: matches.length,
  };
}

/**
 * Extract path segments from a URL for matching
 */
function extractPathSegments(url: string): string[] {
  try {
    // Remove protocol
    let path = url.replace(/^https?:\/\//, '');
    // Remove domain
    const slashIndex = path.indexOf('/');
    if (slashIndex === -1) return [];
    path = path.substring(slashIndex);
    // Remove query string and hash
    path = path.split('?')[0].split('#')[0];
    // Split into segments and filter empty
    return path.split('/').filter(s => s.length > 0);
  } catch {
    return [];
  }
}

// ============================================================
// Remove Functions
// ============================================================

/**
 * Remove all invalid links matching the given patterns
 */
export function removeInvalidLinks(patterns: string[]): InvalidLinksRemoveResult {
  if (patterns.length === 0) {
    return { deletedCount: 0, deletedFromSocialProfiles: 0, deletedFromUrls: 0 };
  }

  const db = getDatabase();

  // First, find all matching records
  const { matches } = searchInvalidLinks(patterns);

  if (matches.length === 0) {
    return { deletedCount: 0, deletedFromSocialProfiles: 0, deletedFromUrls: 0 };
  }

  // Separate by source
  const socialProfileIds = matches
    .filter(m => m.source === 'social_profiles')
    .map(m => m.recordId);
  const urlIds = matches
    .filter(m => m.source === 'urls')
    .map(m => m.recordId);

  let deletedFromSocialProfiles = 0;
  let deletedFromUrls = 0;

  const transaction = db.transaction(() => {
    // Delete from contact_social_profiles
    if (socialProfileIds.length > 0) {
      const placeholders = socialProfileIds.map(() => '?').join(',');
      const result = db.prepare(`
        DELETE FROM contact_social_profiles WHERE id IN (${placeholders})
      `).run(...socialProfileIds);
      deletedFromSocialProfiles = result.changes;
    }

    // Delete from contact_urls
    if (urlIds.length > 0) {
      const placeholders = urlIds.map(() => '?').join(',');
      const result = db.prepare(`
        DELETE FROM contact_urls WHERE id IN (${placeholders})
      `).run(...urlIds);
      deletedFromUrls = result.changes;
    }
  });

  transaction();

  return {
    deletedCount: deletedFromSocialProfiles + deletedFromUrls,
    deletedFromSocialProfiles,
    deletedFromUrls,
  };
}
```

**Step 2: Verify file created**

Run: `ls -la backend/src/services/invalidLinksCleanupService.ts`
Expected: File exists

**Step 3: Commit**

```bash
git add backend/src/services/invalidLinksCleanupService.ts
git commit -m "feat: add invalid links cleanup service"
```

---

### Task 2: Backend Schema

**Files:**
- Create: `backend/src/schemas/invalidLinksCleanup.ts`

**Step 1: Create the schema file**

```typescript
import { Type, Static } from '@sinclair/typebox';

// ============================================================
// Request Schemas
// ============================================================

export const InvalidLinksSearchRequestSchema = Type.Object({
  patterns: Type.Array(Type.String(), { minItems: 1 })
});

export type InvalidLinksSearchRequest = Static<typeof InvalidLinksSearchRequestSchema>;

export const InvalidLinksRemoveRequestSchema = Type.Object({
  patterns: Type.Array(Type.String(), { minItems: 1 })
});

export type InvalidLinksRemoveRequest = Static<typeof InvalidLinksRemoveRequestSchema>;

// ============================================================
// Response Schemas
// ============================================================

export const InvalidLinkMatchSchema = Type.Object({
  contactId: Type.Number(),
  contactName: Type.String(),
  source: Type.Union([Type.Literal('social_profiles'), Type.Literal('urls')]),
  platform: Type.Union([Type.String(), Type.Null()]),
  value: Type.String(),
  recordId: Type.Number()
});

export const InvalidLinksSearchResponseSchema = Type.Object({
  matches: Type.Array(InvalidLinkMatchSchema),
  totalCount: Type.Number()
});

export type InvalidLinksSearchResponse = Static<typeof InvalidLinksSearchResponseSchema>;

export const InvalidLinksRemoveResponseSchema = Type.Object({
  deletedCount: Type.Number(),
  deletedFromSocialProfiles: Type.Number(),
  deletedFromUrls: Type.Number()
});

export type InvalidLinksRemoveResponse = Static<typeof InvalidLinksRemoveResponseSchema>;

export const InvalidLinksErrorSchema = Type.Object({
  error: Type.String()
});
```

**Step 2: Commit**

```bash
git add backend/src/schemas/invalidLinksCleanup.ts
git commit -m "feat: add invalid links cleanup schemas"
```

---

### Task 3: Backend Routes

**Files:**
- Create: `backend/src/routes/invalidLinksCleanup.ts`
- Modify: `backend/src/server.ts`

**Step 1: Create the routes file**

```typescript
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import {
  searchInvalidLinks,
  removeInvalidLinks
} from '../services/invalidLinksCleanupService.js';
import {
  InvalidLinksSearchRequestSchema,
  InvalidLinksSearchRequest,
  InvalidLinksRemoveRequestSchema,
  InvalidLinksRemoveRequest,
  InvalidLinksSearchResponseSchema,
  InvalidLinksRemoveResponseSchema,
  InvalidLinksErrorSchema
} from '../schemas/invalidLinksCleanup.js';

export default async function invalidLinksCleanupRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // POST /api/cleanup/invalid-links/search
  fastify.post<{ Body: InvalidLinksSearchRequest }>('/search', {
    schema: {
      body: InvalidLinksSearchRequestSchema,
      response: {
        200: InvalidLinksSearchResponseSchema,
        400: InvalidLinksErrorSchema
      }
    }
  }, async (request, reply) => {
    const { patterns } = request.body;

    if (!patterns || patterns.length === 0) {
      return reply.status(400).send({ error: 'At least one pattern is required' });
    }

    const result = searchInvalidLinks(patterns);
    return result;
  });

  // POST /api/cleanup/invalid-links/remove
  fastify.post<{ Body: InvalidLinksRemoveRequest }>('/remove', {
    schema: {
      body: InvalidLinksRemoveRequestSchema,
      response: {
        200: InvalidLinksRemoveResponseSchema,
        400: InvalidLinksErrorSchema,
        500: InvalidLinksErrorSchema
      }
    }
  }, async (request, reply) => {
    const { patterns } = request.body;

    if (!patterns || patterns.length === 0) {
      return reply.status(400).send({ error: 'At least one pattern is required' });
    }

    try {
      const result = removeInvalidLinks(patterns);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });
}
```

**Step 2: Register routes in server.ts**

Add import at line 22 (after socialLinksCleanupRoutes):
```typescript
import invalidLinksCleanupRoutes from './routes/invalidLinksCleanup.js';
```

Add route registration at line 95 (after socialLinksCleanupRoutes):
```typescript
await app.register(invalidLinksCleanupRoutes, { prefix: '/api/cleanup/invalid-links' });
```

**Step 3: Commit**

```bash
git add backend/src/routes/invalidLinksCleanup.ts backend/src/server.ts
git commit -m "feat: add invalid links cleanup API routes"
```

---

### Task 4: Frontend Types

**Files:**
- Modify: `frontend/src/api/types.ts`

**Step 1: Add types at the end of the file (after line 379)**

```typescript

// Invalid Links Cleanup types
export interface InvalidLinkMatch {
  contactId: number;
  contactName: string;
  source: 'social_profiles' | 'urls';
  platform: string | null;
  value: string;
  recordId: number;
}

export interface InvalidLinksSearchResponse {
  matches: InvalidLinkMatch[];
  totalCount: number;
}

export interface InvalidLinksRemoveResponse {
  deletedCount: number;
  deletedFromSocialProfiles: number;
  deletedFromUrls: number;
}
```

**Step 2: Update CleanupMode type at line 174**

Change from:
```typescript
export type CleanupMode = 'empty' | 'problematic' | 'social-links';
```

To:
```typescript
export type CleanupMode = 'empty' | 'problematic' | 'social-links' | 'invalid-links';
```

**Step 3: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat: add invalid links cleanup types"
```

---

### Task 5: Frontend API Hooks

**Files:**
- Create: `frontend/src/api/invalidLinksHooks.ts`

**Step 1: Create the hooks file**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type {
  InvalidLinksSearchResponse,
  InvalidLinksRemoveResponse
} from './types';

export function useSearchInvalidLinks() {
  return useMutation({
    mutationFn: (patterns: string[]) =>
      fetchApi<InvalidLinksSearchResponse>('/api/cleanup/invalid-links/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patterns }),
      }),
  });
}

export function useRemoveInvalidLinks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patterns: string[]) =>
      fetchApi<InvalidLinksRemoveResponse>('/api/cleanup/invalid-links/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patterns }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['socialLinks'] });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
    },
  });
}
```

**Step 2: Commit**

```bash
git add frontend/src/api/invalidLinksHooks.ts
git commit -m "feat: add invalid links cleanup hooks"
```

---

### Task 6: Frontend Component

**Files:**
- Create: `frontend/src/components/InvalidLinksCleanup.tsx`

**Step 1: Create the component file**

```typescript
import { useState } from 'react';
import { useSearchInvalidLinks, useRemoveInvalidLinks } from '../api/invalidLinksHooks';
import type { InvalidLinkMatch } from '../api/types';

export function InvalidLinksCleanup() {
  const [inputValue, setInputValue] = useState('');
  const [searchedPatterns, setSearchedPatterns] = useState<string[]>([]);
  const [matches, setMatches] = useState<InvalidLinkMatch[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const searchMutation = useSearchInvalidLinks();
  const removeMutation = useRemoveInvalidLinks();

  const handleSearch = () => {
    const patterns = inputValue
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (patterns.length === 0) return;

    setSearchedPatterns(patterns);
    searchMutation.mutate(patterns, {
      onSuccess: (data) => {
        setMatches(data.matches);
        setHasSearched(true);
      },
    });
  };

  const handleRemoveAll = () => {
    if (searchedPatterns.length === 0) return;

    removeMutation.mutate(searchedPatterns, {
      onSuccess: (data) => {
        setMatches([]);
        setHasSearched(false);
        setInputValue('');
        setSearchedPatterns([]);
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !searchMutation.isPending) {
      handleSearch();
    }
  };

  // Group matches by contact
  const groupedMatches = matches.reduce((acc, match) => {
    if (!acc[match.contactId]) {
      acc[match.contactId] = {
        contactId: match.contactId,
        contactName: match.contactName,
        items: [],
      };
    }
    acc[match.contactId].items.push(match);
    return acc;
  }, {} as Record<number, { contactId: number; contactName: string; items: InvalidLinkMatch[] }>);

  const groupedList = Object.values(groupedMatches);

  return (
    <div className="invalid-links-cleanup">
      <div className="invalid-links-search">
        <div className="search-input-row">
          <input
            type="text"
            placeholder="Enter patterns separated by commas (e.g., pages, instagram, https, profile.php)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={searchMutation.isPending || removeMutation.isPending}
            className="patterns-input"
          />
          <button
            onClick={handleSearch}
            disabled={searchMutation.isPending || removeMutation.isPending || !inputValue.trim()}
            className="search-button"
          >
            {searchMutation.isPending ? (
              <>
                <span className="material-symbols-outlined spinning">sync</span>
                Searching...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">search</span>
                Search
              </>
            )}
          </button>
        </div>

        {hasSearched && (
          <div className="search-results-header">
            <span className="results-count">
              {matches.length} invalid link{matches.length !== 1 ? 's' : ''} found
              {matches.length > 0 && ` across ${groupedList.length} contact${groupedList.length !== 1 ? 's' : ''}`}
            </span>
            {matches.length > 0 && (
              <button
                onClick={handleRemoveAll}
                disabled={removeMutation.isPending}
                className="remove-all-button"
              >
                {removeMutation.isPending ? (
                  <>
                    <span className="material-symbols-outlined spinning">sync</span>
                    Removing...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">delete</span>
                    Remove All ({matches.length})
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {hasSearched && matches.length === 0 && (
        <div className="no-matches">
          <span className="material-symbols-outlined">check_circle</span>
          <p>No invalid links found matching the patterns.</p>
        </div>
      )}

      {groupedList.length > 0 && (
        <div className="matches-list">
          {groupedList.map((group) => (
            <div key={group.contactId} className="match-group">
              <div className="match-contact-name">{group.contactName}</div>
              <div className="match-items">
                {group.items.map((item) => (
                  <div key={`${item.source}-${item.recordId}`} className="match-item">
                    <span className="match-source">
                      {item.source === 'social_profiles' ? (
                        <>
                          <span className="material-symbols-outlined">person</span>
                          {item.platform}
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined">link</span>
                          URL
                        </>
                      )}
                    </span>
                    <span className="match-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {removeMutation.isSuccess && (
        <div className="success-message">
          <span className="material-symbols-outlined">check_circle</span>
          Removed {removeMutation.data.deletedCount} invalid link{removeMutation.data.deletedCount !== 1 ? 's' : ''}.
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/InvalidLinksCleanup.tsx
git commit -m "feat: add invalid links cleanup component"
```

---

### Task 7: Integrate into CleanupView

**Files:**
- Modify: `frontend/src/components/CleanupModeSelector.tsx`
- Modify: `frontend/src/components/CleanupView.tsx`

**Step 1: Update CleanupModeSelector.tsx MODE_CONFIG (line 11-15)**

Change from:
```typescript
const MODE_CONFIG: { mode: CleanupMode; label: string; icon: string }[] = [
  { mode: 'empty', label: 'Empty Contacts', icon: 'person_off' },
  { mode: 'problematic', label: 'Problematic Emails', icon: 'warning' },
  { mode: 'social-links', label: 'Social Links', icon: 'share' },
];
```

To:
```typescript
const MODE_CONFIG: { mode: CleanupMode; label: string; icon: string }[] = [
  { mode: 'empty', label: 'Empty Contacts', icon: 'person_off' },
  { mode: 'problematic', label: 'Problematic Emails', icon: 'warning' },
  { mode: 'social-links', label: 'Social Links', icon: 'share' },
  { mode: 'invalid-links', label: 'Invalid Links', icon: 'link_off' },
];
```

**Step 2: Update getCount function in CleanupModeSelector.tsx (line 24-31)**

Change from:
```typescript
  const getCount = (mode: CleanupMode): number => {
    if (mode === 'social-links') {
      if (!socialLinksSummary) return 0;
      return socialLinksSummary.crossContact + socialLinksSummary.withinContact;
    }
    if (!summary) return 0;
    return mode === 'empty' ? summary.empty.total : summary.problematic.total;
  };
```

To:
```typescript
  const getCount = (mode: CleanupMode): number | null => {
    if (mode === 'social-links') {
      if (!socialLinksSummary) return 0;
      return socialLinksSummary.crossContact + socialLinksSummary.withinContact;
    }
    if (mode === 'invalid-links') {
      return null; // No count for invalid links - it's pattern-based
    }
    if (!summary) return 0;
    return mode === 'empty' ? summary.empty.total : summary.problematic.total;
  };
```

**Step 3: Update the count display in CleanupModeSelector.tsx (line 46)**

Change from:
```typescript
            <span className="cleanup-mode-count">{count}</span>
```

To:
```typescript
            {count !== null && <span className="cleanup-mode-count">{count}</span>}
```

**Step 4: Add import in CleanupView.tsx (after line 6)**

```typescript
import { InvalidLinksCleanup } from './InvalidLinksCleanup';
```

**Step 5: Update shouldFetchContacts in CleanupView.tsx (line 46)**

Change from:
```typescript
  const shouldFetchContacts = selectedMode !== 'social-links';
```

To:
```typescript
  const shouldFetchContacts = selectedMode !== 'social-links' && selectedMode !== 'invalid-links';
```

**Step 6: Update the controls section in CleanupView.tsx (line 214)**

Change from:
```typescript
        {selectedMode !== 'social-links' && (
```

To:
```typescript
        {selectedMode !== 'social-links' && selectedMode !== 'invalid-links' && (
```

**Step 7: Update the content section in CleanupView.tsx (line 269-270)**

Change from:
```typescript
        {selectedMode === 'social-links' ? (
          <SocialLinksCleanup />
```

To:
```typescript
        {selectedMode === 'social-links' ? (
          <SocialLinksCleanup />
        ) : selectedMode === 'invalid-links' ? (
          <InvalidLinksCleanup />
```

**Step 8: Commit**

```bash
git add frontend/src/components/CleanupModeSelector.tsx frontend/src/components/CleanupView.tsx
git commit -m "feat: integrate invalid links cleanup into CleanupView"
```

---

### Task 8: Add CSS Styles

**Files:**
- Modify: `frontend/src/index.css`

**Step 1: Add styles at the end of the file**

```css

/* Invalid Links Cleanup */
.invalid-links-cleanup {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.invalid-links-search {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-input-row {
  display: flex;
  gap: 8px;
}

.patterns-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--input-bg, #fff);
  color: var(--text-color, #1a202c);
}

.patterns-input:focus {
  outline: none;
  border-color: var(--primary-color, #3182ce);
  box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.1);
}

.patterns-input:disabled {
  background: var(--disabled-bg, #f7fafc);
  cursor: not-allowed;
}

.search-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: var(--primary-color, #3182ce);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.search-button:hover:not(:disabled) {
  background: var(--primary-hover, #2c5282);
}

.search-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.search-results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.results-count {
  font-size: 14px;
  color: var(--text-muted, #718096);
}

.remove-all-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--danger-color, #e53e3e);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.remove-all-button:hover:not(:disabled) {
  background: var(--danger-hover, #c53030);
}

.remove-all-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.no-matches {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--text-muted, #718096);
}

.no-matches .material-symbols-outlined {
  font-size: 48px;
  color: var(--success-color, #38a169);
}

.matches-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.match-group {
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
}

.match-contact-name {
  padding: 10px 14px;
  font-weight: 500;
  background: var(--subtle-bg, #f7fafc);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.match-items {
  display: flex;
  flex-direction: column;
}

.match-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.match-item:last-child {
  border-bottom: none;
}

.match-source {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 100px;
  font-size: 12px;
  color: var(--text-muted, #718096);
  text-transform: capitalize;
}

.match-source .material-symbols-outlined {
  font-size: 16px;
}

.match-value {
  flex: 1;
  font-size: 13px;
  color: var(--text-color, #1a202c);
  word-break: break-all;
}

.success-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--success-bg, #f0fff4);
  color: var(--success-color, #38a169);
  border-radius: 8px;
  font-size: 14px;
}

.success-message .material-symbols-outlined {
  font-size: 20px;
}
```

**Step 2: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add invalid links cleanup styles"
```

---

### Task 9: Test End-to-End

**Step 1: Start backend**

Run: `cd backend && npm run dev`
Expected: Server starts on port 3000

**Step 2: Start frontend (in separate terminal)**

Run: `cd frontend && npm run dev`
Expected: Dev server starts on port 5173

**Step 3: Test in browser**

1. Navigate to http://localhost:5173
2. Go to Cleanup section
3. Click "Invalid Links" tab
4. Enter patterns: `pages, instagram, https, profile.php`
5. Click Search
6. Verify matches are displayed grouped by contact
7. Click "Remove All"
8. Verify success message and matches cleared

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete invalid links cleanup feature"
```

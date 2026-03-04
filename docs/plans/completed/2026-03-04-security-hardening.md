# Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Lock down the entire API so that every data endpoint requires authentication, error messages don't leak internals, photos are served through auth, and production secrets are validated on startup.

**Architecture:** Add a global `requireAuth` hook in `server.ts` that protects all `/api/*` routes by default, with an explicit allowlist for public paths (`/health`, `/api/auth/*`). Remove the per-route custom `getUserIdFromSession` helpers in favor of the centralized middleware. Sanitize all remaining raw error messages. Serve photos through an authenticated route instead of static files.

**Tech Stack:** Fastify 5, better-sqlite3, TypeScript

---

### Task 1: Add Global Authentication Hook

**Files:**
- Modify: `backend/src/server.ts`

**Step 1: Add the global auth hook**

In `backend/src/server.ts`, add this import at the top with the other imports:

```typescript
import { requireAuth } from './middleware/auth.js';
```

Then add a global `onRequest` hook immediately after the cookie plugin registration (after line 44) and before the photos path setup (before line 52):

```typescript
// Global auth: protect all /api/* routes except auth endpoints
app.addHook('onRequest', async (request, reply) => {
  // Public routes that don't need auth
  if (
    request.url === '/health' ||
    request.url.startsWith('/api/auth/') ||
    request.url.startsWith('/photos/')
  ) {
    return;
  }

  // All other /api/* routes require auth
  if (request.url.startsWith('/api/') || request.url.startsWith('/api?')) {
    return requireAuth(request, reply);
  }
});
```

**Step 2: Build and verify**

Run: `cd backend && npm run build`
Expected: Clean compilation, no errors.

**Step 3: Commit**

```bash
git add backend/src/server.ts
git commit -m "security: add global requireAuth hook for all /api routes"
```

---

### Task 2: Remove Per-Route Auth That Is Now Redundant

Since the global hook covers everything, remove the per-route `requireAuth` calls to avoid double-checking. Keep the code clean and consistent.

**Files:**
- Modify: `backend/src/routes/import.ts`
- Modify: `backend/src/routes/stats.ts`
- Modify: `backend/src/routes/emailSync.ts`
- Modify: `backend/src/routes/gmailEnrich.ts`

**Step 1: Clean up import.ts**

In `backend/src/routes/import.ts`, remove the `requireAuth` import (line 3) and remove `onRequest: [requireAuth]` from the route options (line 10). Change:

```typescript
app.post('/import', { onRequest: [requireAuth] }, async (request, reply) => {
```

to:

```typescript
app.post('/import', async (request, reply) => {
```

**Step 2: Clean up stats.ts**

In `backend/src/routes/stats.ts`, remove the `requireAuth` import (line 3) and remove `{ onRequest: [requireAuth] }` from the route options (line 249). The global hook now handles this.

**Step 3: Clean up emailSync.ts**

In `backend/src/routes/emailSync.ts`, remove the `requireAuth` import (line 2) and the `fastify.addHook('preHandler', requireAuth)` call (line 12).

**Step 4: Clean up gmailEnrich.ts**

In `backend/src/routes/gmailEnrich.ts`, remove the `requireAuth` import (line 3) and the `fastify.addHook('preHandler', requireAuth)` call (line 16).

**Step 5: Build and verify**

Run: `cd backend && npm run build`
Expected: Clean compilation.

**Step 6: Commit**

```bash
git add backend/src/routes/import.ts backend/src/routes/stats.ts backend/src/routes/emailSync.ts backend/src/routes/gmailEnrich.ts
git commit -m "security: remove redundant per-route auth (global hook handles it)"
```

---

### Task 3: Replace Custom getUserIdFromSession With request.user

Three route files (settings.ts, profileImages.ts, profile.ts) implement their own `getUserIdFromSession` helper instead of using the middleware. Since the global hook now runs `requireAuth` and populates `request.user`, replace all custom helpers.

**Files:**
- Modify: `backend/src/routes/settings.ts`
- Modify: `backend/src/routes/profileImages.ts`
- Modify: `backend/src/routes/profile.ts`

**Step 1: Fix settings.ts**

Delete the `getUserIdFromSession` function (lines 10-22). Replace every occurrence of:

```typescript
const userId = getUserIdFromSession(request);
if (!userId) {
  return reply.status(401).send({ error: 'Not authenticated. Please log in with Google first.' });
}
```

with:

```typescript
const userId = request.user!.id;
```

The `!` is safe because `requireAuth` already ran via the global hook and would have returned 401.

**Step 2: Fix profileImages.ts**

Same pattern — delete the `getUserIdFromSession` function and replace all usages with `request.user!.id`.

**Step 3: Fix profile.ts**

Same pattern — delete the `getUserIdFromSession` function (around line 99) and replace all usages with `request.user!.id`.

**Step 4: Build and verify**

Run: `cd backend && npm run build`
Expected: Clean compilation.

**Step 5: Commit**

```bash
git add backend/src/routes/settings.ts backend/src/routes/profileImages.ts backend/src/routes/profile.ts
git commit -m "security: replace custom session helpers with request.user from global auth"
```

---

### Task 4: Serve Photos Through Authenticated Route

Currently photos are served as unauthenticated static files with predictable MD5-based URLs. Replace with an authenticated route.

**Files:**
- Modify: `backend/src/server.ts`

**Step 1: Remove static photo serving and add authenticated route**

In `backend/src/server.ts`, in the production block (lines 73-78), remove the second `fastifyStatic` registration for photos:

```typescript
// DELETE these lines:
await app.register(fastifyStatic, {
  root: photosPath,
  prefix: '/photos/',
  decorateReply: false
});
```

In the development block (lines 89-92), also remove the static photo registration:

```typescript
// DELETE these lines:
await app.register(fastifyStatic, {
  root: photosPath,
  prefix: '/photos/',
});
```

Add `path` to the existing imports if not there (it already is). Then add this route after the static file setup and before the API route registrations (before line 96):

```typescript
// Serve photos through authenticated route
app.get('/photos/*', async (request, reply) => {
  // Auth is handled by global hook (allowlisted above), so check manually here
  await requireAuth(request, reply);
  if (reply.sent) return;

  const url = request.url.replace(/\?.*$/, ''); // strip query params
  const filePath = path.join(photosPath, url.replace('/photos/', ''));

  // Prevent path traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(photosPath))) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  if (!fs.existsSync(resolved)) {
    return reply.status(404).send({ error: 'Not found' });
  }

  return reply.sendFile(path.relative(photosPath, resolved));
});
```

Wait — since we allowlisted `/photos/` in the global hook, we need to update the global hook to NOT allowlist photos, or handle auth in the route itself. The simplest approach: **remove `/photos/` from the global hook allowlist** so the global hook handles auth for photos too.

Update the global hook from Task 1 — remove the `request.url.startsWith('/photos/')` line:

```typescript
app.addHook('onRequest', async (request, reply) => {
  if (
    request.url === '/health' ||
    request.url.startsWith('/api/auth/')
  ) {
    return;
  }

  if (
    request.url.startsWith('/api/') ||
    request.url.startsWith('/photos/')
  ) {
    return requireAuth(request, reply);
  }
});
```

Now we still need a route to actually serve the photo files. Since we removed the static plugin for photos, register a simple one that uses `reply.type()` and streams the file:

```typescript
import { createReadStream } from 'fs';

// Authenticated photo serving
app.get('/photos/*', async (request, reply) => {
  const url = request.url.replace(/\?.*$/, '');
  const relativePath = url.replace('/photos/', '');
  const filePath = path.join(photosPath, relativePath);

  // Prevent path traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(photosPath))) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  if (!fs.existsSync(resolved)) {
    return reply.status(404).send({ error: 'Not found' });
  }

  const ext = path.extname(resolved).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };

  reply.type(mimeTypes[ext] || 'application/octet-stream');
  reply.header('Cache-Control', 'private, max-age=86400');
  return reply.send(createReadStream(resolved));
});
```

**Step 2: Build and verify**

Run: `cd backend && npm run build`
Expected: Clean compilation.

**Step 3: Commit**

```bash
git add backend/src/server.ts
git commit -m "security: serve photos through authenticated route with path traversal protection"
```

---

### Task 5: Remove Contact Count From Health Endpoint

The health endpoint currently leaks the total contact count to unauthenticated users.

**Files:**
- Modify: `backend/src/routes/health.ts`

**Step 1: Simplify health endpoint**

Replace the entire file content:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { getDatabase } from '../services/database.js';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    // Verify DB is accessible without leaking data
    getDatabase().prepare('SELECT 1').get();
    return { status: 'ok' };
  });
};

export default healthRoutes;
```

**Step 2: Build and verify**

Run: `cd backend && npm run build`
Expected: Clean compilation.

**Step 3: Commit**

```bash
git add backend/src/routes/health.ts
git commit -m "security: remove contact count from public health endpoint"
```

---

### Task 6: Validate SESSION_SECRET on Startup

**Files:**
- Modify: `backend/src/server.ts`

**Step 1: Add production validation**

Add this check right after the `const app = Fastify(...)` line (after line 32), before any plugin registrations:

```typescript
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable is required in production');
  process.exit(1);
}
```

**Step 2: Build and verify**

Run: `cd backend && npm run build`
Expected: Clean compilation.

**Step 3: Commit**

```bash
git add backend/src/server.ts
git commit -m "security: require SESSION_SECRET in production"
```

---

### Task 7: Sanitize All Remaining Error Messages

Every `catch` block that forwards `error.message` to the client must be replaced with a generic message. The raw error is logged server-side with `fastify.log.error()`.

**Files:**
- Modify: `backend/src/routes/contacts.ts`
- Modify: `backend/src/routes/duplicates.ts`
- Modify: `backend/src/routes/cleanup.ts`
- Modify: `backend/src/routes/archive.ts`
- Modify: `backend/src/routes/settings.ts`
- Modify: `backend/src/routes/enrich.ts`
- Modify: `backend/src/routes/emailSync.ts`
- Modify: `backend/src/routes/addressCleanup.ts`
- Modify: `backend/src/routes/socialLinksCleanup.ts`
- Modify: `backend/src/routes/invalidLinksCleanup.ts`

**Step 1: Apply the pattern to each file**

In every file, find all instances of this pattern:

```typescript
} catch (error) {
  const message = error instanceof Error ? error.message : 'Some fallback';
  return reply.status(500).send({ error: message });
}
```

Replace with:

```typescript
} catch (error) {
  fastify.log.error(error, 'Description of what failed');
  return reply.status(500).send({ error: 'Operation failed. Please try again.' });
}
```

For SSE endpoints that use `sendEvent('error', ...)`, replace:

```typescript
} catch (error) {
  const message = error instanceof Error ? error.message : 'Fallback';
  sendEvent('error', { error: message });
}
```

with:

```typescript
} catch (error) {
  fastify.log.error(error, 'Description of what failed');
  sendEvent('error', { error: 'Operation failed. Please try again.' });
}
```

**Specific replacements needed (from grep results):**

| File | Line | Generic message |
|------|------|-----------------|
| `contacts.ts` | 1364 | `'Contact merge failed. Please try again.'` |
| `contacts.ts` | 1414 | `'Contact update failed. Please try again.'` |
| `duplicates.ts` | 90 | `'Duplicate detection failed. Please try again.'` |
| `cleanup.ts` | 141 | `'Cleanup operation failed. Please try again.'` |
| `archive.ts` | 47, 100, 121 | `'Archive operation failed. Please try again.'` |
| `settings.ts` | 55 | `'Photo fetch failed. Please try again.'` |
| `settings.ts` | 88 | `'Photo fetch failed. Please try again.'` |
| `settings.ts` | 130 | `'LinkedIn import failed. Please try again.'` |
| `enrich.ts` | 91 | `'Enrichment failed. Please try again.'` |
| `enrich.ts` | 233 | `'Recovery failed. Please try again.'` |
| `emailSync.ts` | 45 | `'Email sync failed. Please try again.'` |
| `emailSync.ts` | 79 | `'Email refresh failed. Please try again.'` |
| `emailSync.ts` | 136 | `'Bulk refresh failed. Please try again.'` |
| `addressCleanup.ts` | 117, 176, 202, 267, 318, 341, 371 | `'Address operation failed. Please try again.'` |
| `socialLinksCleanup.ts` | 105 | `'Social links cleanup failed. Please try again.'` |
| `invalidLinksCleanup.ts` | 61 | `'Link validation failed. Please try again.'` |

**Step 2: Build and verify**

Run: `cd backend && npm run build`
Expected: Clean compilation.

**Step 3: Commit**

```bash
git add backend/src/routes/
git commit -m "security: sanitize all error messages returned to client (CWE-209)"
```

---

### Task 8: Run Full Test Suite

**Step 1: Run tests**

Run: `cd backend && npm test`
Expected: All tests pass. If any tests assert on specific error messages, update them to match the new generic messages.

**Step 2: Commit test fixes if needed**

```bash
git add backend/src/routes/__tests__/
git commit -m "test: update expected error messages after sanitization"
```

---

### Task 9: Manual Smoke Test

**Step 1: Start the dev server**

Run: `cd /Users/trarara/Dropbox/+Projects/2601\ Yello\ CRM/yello && npm run dev`

**Step 2: Verify unauthenticated requests are blocked**

Test these with curl (no cookies):

```bash
# Should return 401
curl -s http://localhost:3000/api/contacts | head -1
curl -s http://localhost:3000/api/contacts/1 | head -1
curl -s http://localhost:3000/api/contacts/export/vcf | head -1
curl -s http://localhost:3000/api/duplicates/summary | head -1
curl -s http://localhost:3000/api/cleanup/summary | head -1
curl -s http://localhost:3000/api/archive | head -1
curl -s http://localhost:3000/api/map | head -1
curl -s http://localhost:3000/api/enrich/linkedin/summary | head -1
curl -s http://localhost:3000/photos/thumbnail/c4/c4ca4238a0b923820dcc509a6f75849b.jpg -o /dev/null -w "%{http_code}"

# Should still return 200
curl -s http://localhost:3000/health
```

Expected: All `/api/*` and `/photos/*` return `{"error":"Unauthorized - no session"}`. Health returns `{"status":"ok"}`.

**Step 3: Verify authenticated requests still work**

Log in through the browser at `http://localhost:5173`, then verify the app works normally — contacts load, photos appear, etc.

**Step 4: Stop dev servers**

```bash
kill $(lsof -ti :3000) 2>/dev/null
kill $(lsof -ti :5173) 2>/dev/null
```

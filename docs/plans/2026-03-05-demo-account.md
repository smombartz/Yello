# Demo Account Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let anyone try Yello instantly via a "Try Demo" button — each visitor gets an isolated, temporary demo with 20 pre-populated contacts that auto-expires in 2 hours.

**Architecture:** Runtime seed approach — on each "Try Demo" click, create a temporary demo user in auth.db (flagged `is_demo=1`), create their per-user contacts.db, seed 20 contacts + LinkedIn enrichment via SQL, issue a 2-hour session cookie. Lazy cleanup deletes expired demo data on each new demo creation.

**Tech Stack:** Fastify, better-sqlite3, React, TanStack Query, existing multi-tenant architecture.

**Design doc:** `docs/plans/2026-03-05-demo-account-design.md`

---

### Task 1: Add `is_demo` Column to Auth Database

**Files:**
- Modify: `backend/src/services/authDatabase.ts:29-68`
- Modify: `backend/src/services/__tests__/authDatabase.test.ts`

**Step 1: Write the failing test**

Add to `backend/src/services/__tests__/authDatabase.test.ts`:

```typescript
it('should have is_demo column on users table', () => {
  const db = getAuthDatabase();
  const columns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const columnNames = columns.map((c) => c.name);
  expect(columnNames).toContain('is_demo');
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/__tests__/authDatabase.test.ts -t "should have is_demo column"`
Expected: FAIL

**Step 3: Add `is_demo` column to users table**

In `backend/src/services/authDatabase.ts`, modify the `CREATE TABLE IF NOT EXISTS users` statement to add after `updated_at`:

```sql
is_demo INTEGER DEFAULT 0
```

Also add an index for demo user queries:

```sql
CREATE INDEX IF NOT EXISTS idx_users_is_demo ON users(is_demo);
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/__tests__/authDatabase.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/services/authDatabase.ts backend/src/services/__tests__/authDatabase.test.ts
git commit -m "feat(demo): add is_demo column to auth database users table"
```

---

### Task 2: Create Demo Service — Seed Data & Cleanup

**Files:**
- Create: `backend/src/services/demoService.ts`
- Create: `backend/src/services/__tests__/demoService.test.ts`

**Step 1: Write the failing tests**

Create `backend/src/services/__tests__/demoService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getAuthDatabase, closeAuthDatabase } from '../authDatabase.js';
import { getUserDatabase, closeAllUserDatabases } from '../userDatabase.js';
import { createDemoUser, cleanupExpiredDemoUsers, DEMO_CONTACT_COUNT } from '../demoService.js';

describe('demoService', () => {
  let tmpDir: string;
  const originalAuthDbPath = process.env.AUTH_DATABASE_PATH;
  const originalUserDataPath = process.env.USER_DATA_PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-test-'));
    process.env.AUTH_DATABASE_PATH = path.join(tmpDir, 'auth.db');
    process.env.USER_DATA_PATH = path.join(tmpDir, 'users');
  });

  afterEach(() => {
    closeAllUserDatabases();
    closeAuthDatabase();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    if (originalAuthDbPath !== undefined) {
      process.env.AUTH_DATABASE_PATH = originalAuthDbPath;
    } else {
      delete process.env.AUTH_DATABASE_PATH;
    }
    if (originalUserDataPath !== undefined) {
      process.env.USER_DATA_PATH = originalUserDataPath;
    } else {
      delete process.env.USER_DATA_PATH;
    }
  });

  it('should create a demo user in auth.db with is_demo=1', () => {
    const result = createDemoUser();
    const db = getAuthDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.userId) as any;
    expect(user.is_demo).toBe(1);
    expect(user.google_id).toMatch(/^demo-/);
    expect(user.email).toMatch(/@demo\.yello\.app$/);
  });

  it('should create a session that expires in ~2 hours', () => {
    const result = createDemoUser();
    const db = getAuthDatabase();
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.sessionId) as any;
    const expiresAt = new Date(session.expires_at).getTime();
    const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;
    // Allow 10 seconds tolerance
    expect(Math.abs(expiresAt - twoHoursFromNow)).toBeLessThan(10000);
  });

  it('should seed the demo user contacts.db with DEMO_CONTACT_COUNT contacts', () => {
    const result = createDemoUser();
    const userDb = getUserDatabase(result.userId);
    const count = userDb.prepare('SELECT COUNT(*) as count FROM contacts').get() as any;
    expect(count.count).toBe(DEMO_CONTACT_COUNT);
  });

  it('should seed contacts with emails, phones, and addresses', () => {
    const result = createDemoUser();
    const userDb = getUserDatabase(result.userId);
    const emails = userDb.prepare('SELECT COUNT(*) as count FROM contact_emails').get() as any;
    const phones = userDb.prepare('SELECT COUNT(*) as count FROM contact_phones').get() as any;
    const addresses = userDb.prepare('SELECT COUNT(*) as count FROM contact_addresses').get() as any;
    expect(emails.count).toBeGreaterThan(0);
    expect(phones.count).toBeGreaterThan(0);
    expect(addresses.count).toBeGreaterThan(0);
  });

  it('should seed some contacts with LinkedIn enrichment data', () => {
    const result = createDemoUser();
    const userDb = getUserDatabase(result.userId);
    const enriched = userDb.prepare('SELECT COUNT(*) as count FROM linkedin_enrichment').get() as any;
    expect(enriched.count).toBeGreaterThanOrEqual(10);
  });

  it('should clean up expired demo users', () => {
    // Create a demo user
    const result = createDemoUser();
    const db = getAuthDatabase();

    // Manually expire the session
    db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 hour') WHERE id = ?").run(result.sessionId);

    // Run cleanup
    cleanupExpiredDemoUsers();

    // User should be deleted
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.userId);
    expect(user).toBeUndefined();

    // User data directory should be deleted
    const userDir = path.join(tmpDir, 'users', String(result.userId));
    expect(fs.existsSync(userDir)).toBe(false);
  });

  it('should NOT clean up non-expired demo users', () => {
    const result = createDemoUser();
    cleanupExpiredDemoUsers();

    const db = getAuthDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.userId);
    expect(user).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/services/__tests__/demoService.test.ts`
Expected: FAIL (module not found)

**Step 3: Create `backend/src/services/demoService.ts`**

This file contains:
- `DEMO_CONTACT_COUNT = 20` constant
- `DEMO_SESSION_DURATION_MS = 2 * 60 * 60 * 1000` constant
- `createDemoUser()` function that:
  1. Generates UUID-based demo credentials
  2. Inserts demo user into auth.db with `is_demo = 1`
  3. Creates a 2-hour session
  4. Calls `getUserDatabase(userId)` to initialize the per-user DB
  5. Calls `seedDemoContacts(userDb)` to insert 20 contacts
  6. Returns `{ userId, sessionId }`
- `seedDemoContacts(db)` function that inserts all 20 contacts with:
  - contacts table: first_name, last_name, display_name, company, title, notes, birthday
  - contact_emails: 1-2 per contact
  - contact_phones: 1 per contact (E.164 format)
  - contact_addresses: 1 per contact with city/state/country
  - contact_categories: varied categories
  - linkedin_enrichment: ~10 contacts with headline, about, job_title, company_name, skills, positions, location
  - contacts_unified_fts: searchable text entries for each contact
- `cleanupExpiredDemoUsers()` function that:
  1. Queries auth.db for demo users whose ALL sessions are expired
  2. Closes their user databases via `closeUserDatabase(userId)`
  3. Deletes their `data/users/{id}/` directories
  4. Deletes their user and session rows from auth.db

The 20 contacts data (from the design doc table) should be defined as a typed array at the top of the file. Each contact needs realistic but fabricated:
- Email(s): `firstname@company-domain.com` pattern
- Phone: US E.164 format like `+1415XXXXXXX`
- Address: Real US cities with plausible street addresses
- Notes: Brief professional context (1-2 sentences)
- Categories: Mix of "Business", "Personal", "VIP", etc.

For LinkedIn enrichment (~10 contacts), include:
- headline, about (2-3 sentences), job_title, company_name, industry, location, skills (JSON array of 3-5 skills), positions (JSON array with 1-2 positions)

**Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/__tests__/demoService.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/services/demoService.ts backend/src/services/__tests__/demoService.test.ts
git commit -m "feat(demo): create demo service with seed data and cleanup"
```

---

### Task 3: Add Demo Auth Endpoint

**Files:**
- Modify: `backend/src/routes/auth.ts:170-480`

**Step 1: Add `POST /demo` route to `authRoutes` function**

At the end of the `authRoutes` function (before the closing `}`), add:

```typescript
import { createDemoUser, cleanupExpiredDemoUsers } from '../services/demoService.js';

// ... inside authRoutes function:

// Demo account - create temporary demo user
fastify.post('/demo', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (_request, reply) => {
  // Clean up expired demo users first
  cleanupExpiredDemoUsers();

  // Create new demo user with seeded data
  const { userId, sessionId } = createDemoUser();

  // Set session cookie (2-hour expiry)
  const DEMO_SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
  reply.setCookie('session_id', sessionId, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: DEMO_SESSION_DURATION_MS / 1000,
  });

  return { success: true, isDemo: true };
});
```

Note: The import for `createDemoUser` and `cleanupExpiredDemoUsers` goes at the top of the file with other imports.

**Step 2: Run existing auth tests to ensure nothing breaks**

Run: `cd backend && npx vitest run`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add backend/src/routes/auth.ts
git commit -m "feat(demo): add POST /api/auth/demo endpoint"
```

---

### Task 4: Add `is_demo` to Auth Middleware & `/me` Response

**Files:**
- Modify: `backend/src/middleware/auth.ts:22-33` (FastifyRequest user type)
- Modify: `backend/src/middleware/auth.ts:68-76` (requireAuth user attachment)
- Modify: `backend/src/middleware/auth.ts:109-117` (optionalAuth user attachment)
- Modify: `backend/src/routes/auth.ts:417-460` (`/me` route response)
- Modify: `backend/src/schemas/auth.ts` (add `isDemo` to schema)

**Step 1: Add `isDemo` to FastifyRequest user type**

In `backend/src/middleware/auth.ts`, update the `FastifyRequest` declaration:

```typescript
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: number;
      googleId: string;
      email: string;
      name: string | null;
      avatarUrl: string | null;
      isDemo: boolean;
      createdAt: string;
      updatedAt: string;
    };
  }
}
```

**Step 2: Read `is_demo` from DB and attach to `request.user`**

In `requireAuth` function, update the user attachment (line ~68):

```typescript
request.user = {
  id: user.id,
  googleId: user.google_id,
  email: user.email,
  name: user.name,
  avatarUrl: user.avatar_url,
  isDemo: !!(user as any).is_demo,
  createdAt: user.created_at,
  updatedAt: user.updated_at,
};
```

Do the same in `optionalAuth` (line ~109).

Also update `UserRow` interface to include `is_demo: number;`.

**Step 3: Update `/me` route to include `isDemo` in response**

In `backend/src/routes/auth.ts`, update the `/me` route's return value to include:

```typescript
user: {
  id: user.id,
  googleId: user.google_id,
  email: user.email,
  name: user.name,
  avatarUrl: user.avatar_url,
  isDemo: !!(user as any).is_demo,
  profileImages: profileImages.map(...),
  createdAt: user.created_at,
  updatedAt: user.updated_at,
},
```

Also update the `UserRow` interface in `auth.ts` to include `is_demo: number;`.

**Step 4: Update auth schema**

In `backend/src/schemas/auth.ts`, add `isDemo` to `UserSchema`:

```typescript
export const UserSchema = Type.Object({
  id: Type.Number(),
  googleId: Type.String(),
  email: Type.String(),
  name: Type.Union([Type.String(), Type.Null()]),
  avatarUrl: Type.Union([Type.String(), Type.Null()]),
  isDemo: Type.Optional(Type.Boolean()),
  profileImages: Type.Array(ProfileImageSchema),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
```

**Step 5: Run tests**

Run: `cd backend && npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add backend/src/middleware/auth.ts backend/src/routes/auth.ts backend/src/schemas/auth.ts
git commit -m "feat(demo): add isDemo flag to auth middleware and /me response"
```

---

### Task 5: Add Demo Restrictions to Protected Routes

**Files:**
- Modify: `backend/src/routes/import.ts:10-11`
- Modify: `backend/src/routes/enrich.ts:12-15`
- Modify: `backend/src/routes/emailSync.ts:11`
- Modify: `backend/src/routes/gmailEnrich.ts:14`

**Step 1: Add demo guard to each restricted route**

For each route file, add a check at the start of the handler functions that should be restricted:

```typescript
if (request.user?.isDemo) {
  return reply.status(403).send({ error: 'This feature is not available in demo mode. Sign in with Google to unlock all features.' });
}
```

**Routes to restrict:**
- `import.ts` — `POST /import` handler (after `const data = await request.file()` would be too late; add before)
- `enrich.ts` — `POST /enrich` and `POST /enrich/recover` handlers
- `emailSync.ts` — `POST /:id/email-sync` and `POST /:id/email-sync/incremental` handlers
- `gmailEnrich.ts` — `POST /discover`, `POST /:id/sync`, `POST /:id/sync/incremental` handlers

Admin routes are already protected by `requireAdmin` which checks email, so demo users are already blocked.

**Step 2: Run tests**

Run: `cd backend && npx vitest run`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add backend/src/routes/import.ts backend/src/routes/enrich.ts backend/src/routes/emailSync.ts backend/src/routes/gmailEnrich.ts
git commit -m "feat(demo): add demo mode restrictions to import, enrich, and email sync routes"
```

---

### Task 6: Add "Try Demo" Button to Login Page

**Files:**
- Modify: `frontend/src/components/LoginPage.tsx`
- Modify: `frontend/src/api/client.ts`

**Step 1: Add `startDemo` function to `client.ts`**

In `frontend/src/api/client.ts`, add:

```typescript
export async function startDemo(): Promise<{ success: boolean; isDemo: boolean }> {
  const response = await fetch(`${API_BASE}/api/auth/demo`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to start demo');
  }
  return response.json();
}
```

**Step 2: Add "Try Demo" button to `LoginPage.tsx`**

Update `LoginPage.tsx` to import `startDemo` and add a second button below the Google button:

```tsx
import { useAuth } from '../hooks/useAuth';
import { startDemo } from '../api/client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import logoSvg from '../assets/logo.svg';

export function LoginPage() {
  const { login, isLoading } = useAuth();
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleDemo = async () => {
    setIsDemoLoading(true);
    try {
      await startDemo();
      // Invalidate auth query to pick up the new session
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    } catch {
      setIsDemoLoading(false);
    }
  };

  // ... existing return, add after the google-login-btn:
  <div className="login-divider">
    <span>or</span>
  </div>

  <button
    className="demo-btn"
    onClick={handleDemo}
    disabled={isDemoLoading}
  >
    {isDemoLoading ? 'Setting up demo...' : 'Try Demo'}
  </button>
```

Add styles for the divider and demo button (within the existing `<style>` tag):

```css
.login-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0;
  color: var(--ds-text-muted);
  font-size: 13px;
}

.login-divider::before,
.login-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--ds-border-color);
}

.demo-btn {
  width: 100%;
  padding: 14px 24px;
  background: linear-gradient(46deg, #7C3AED 7.03%, #273DE3 94.08%);
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

.demo-btn:hover:not(:disabled) {
  opacity: 0.9;
  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);
}

.demo-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

**Step 3: Verify visually**

Run: `cd frontend && npm run dev` (and backend with `cd backend && npm run dev`)
Visit `http://localhost:5173/login` — should see "Sign in with Google", divider, "Try Demo" button.

**Step 4: Commit**

```bash
git add frontend/src/components/LoginPage.tsx frontend/src/api/client.ts
git commit -m "feat(demo): add Try Demo button to login page"
```

---

### Task 7: Add `isDemo` to Frontend Auth Context

**Files:**
- Modify: `frontend/src/api/authHooks.ts:12-21` (User interface)
- Modify: `frontend/src/contexts/authContextValue.ts:4-12` (AuthContextType)
- Modify: `frontend/src/contexts/AuthContext.tsx`

**Step 1: Add `isDemo` to User interface**

In `frontend/src/api/authHooks.ts`, add to the `User` interface:

```typescript
export interface User {
  id: number;
  googleId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isDemo?: boolean;
  profileImages: ProfileImage[];
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Add `isDemo` to AuthContextType**

In `frontend/src/contexts/authContextValue.ts`:

```typescript
export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isDemo: boolean;
  isLoading: boolean;
  error: Error | null;
  login: () => void;
  logout: () => void;
  isLoggingOut: boolean;
}
```

**Step 3: Update AuthProvider to pass `isDemo`**

In `frontend/src/contexts/AuthContext.tsx`, update the value:

```typescript
const value: AuthContextType = {
  user: data?.user ?? null,
  isAuthenticated: data?.isAuthenticated ?? false,
  isDemo: data?.user?.isDemo ?? false,
  isLoading,
  error: error as Error | null,
  login,
  logout,
  isLoggingOut: logoutMutation.isPending,
};
```

Also: skip the auto-refresh email history call for demo users:

```typescript
useEffect(() => {
  if (data?.isAuthenticated && !data?.user?.isDemo && !hasRefreshedEmails.current) {
    hasRefreshedEmails.current = true;
    fetch('/api/contacts/refresh-all', { method: 'POST', credentials: 'include' })
      .catch(() => { /* silent failure */ });
  }
}, [data?.isAuthenticated, data?.user?.isDemo]);
```

**Step 4: Commit**

```bash
git add frontend/src/api/authHooks.ts frontend/src/contexts/authContextValue.ts frontend/src/contexts/AuthContext.tsx
git commit -m "feat(demo): add isDemo flag to frontend auth context"
```

---

### Task 8: Add Demo Prompt Modal

**Files:**
- Create: `frontend/src/components/DemoPromptModal.tsx`
- Modify: `frontend/src/App.tsx` (or whichever component wraps the authenticated layout)

**Step 1: Find where to mount the modal**

Check `frontend/src/App.tsx` to see where the authenticated layout is rendered. The modal should render inside the authenticated app shell, after the user has been in the app for 3 minutes.

**Step 2: Create `DemoPromptModal.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

const DEMO_PROMPT_DELAY_MS = 3 * 60 * 1000; // 3 minutes

export function DemoPromptModal() {
  const { isDemo, login } = useAuth();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isDemo || dismissed) return;

    const timer = setTimeout(() => setShow(true), DEMO_PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isDemo, dismissed]);

  if (!show || dismissed) return null;

  return (
    <div className="demo-prompt-overlay">
      <div className="demo-prompt-modal">
        <h3>Enjoying Yello?</h3>
        <p>Sign in with Google to keep your contacts and unlock all features.</p>
        <div className="demo-prompt-actions">
          <button className="demo-prompt-primary" onClick={login}>
            Sign in with Google
          </button>
          <button className="demo-prompt-secondary" onClick={() => setDismissed(true)}>
            Maybe later
          </button>
        </div>
      </div>
      <style>{`
        .demo-prompt-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .demo-prompt-modal {
          background: white;
          border-radius: 12px;
          padding: 32px;
          max-width: 400px;
          width: 90%;
          text-align: center;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .demo-prompt-modal h3 {
          margin: 0 0 8px;
          font-size: 20px;
        }
        .demo-prompt-modal p {
          margin: 0 0 24px;
          color: var(--ds-text-secondary);
          font-size: 14px;
        }
        .demo-prompt-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .demo-prompt-primary {
          padding: 12px;
          background: linear-gradient(46deg, #7C3AED 7.03%, #273DE3 94.08%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
        }
        .demo-prompt-primary:hover { opacity: 0.9; }
        .demo-prompt-secondary {
          padding: 12px;
          background: none;
          border: none;
          color: var(--ds-text-muted);
          font-size: 14px;
          cursor: pointer;
        }
        .demo-prompt-secondary:hover { color: var(--ds-text-primary); }
      `}</style>
    </div>
  );
}
```

**Step 3: Mount `DemoPromptModal` in the app**

Find the component that wraps the authenticated routes (likely in `App.tsx` or a layout component). Add `<DemoPromptModal />` inside the authenticated area so it renders on any page after 3 minutes.

**Step 4: Verify visually**

Run frontend dev server. Click "Try Demo". After 3 minutes (or temporarily set to 5 seconds for testing), the modal should appear. Clicking "Maybe later" should dismiss it permanently for the session.

**Step 5: Commit**

```bash
git add frontend/src/components/DemoPromptModal.tsx frontend/src/App.tsx
git commit -m "feat(demo): add demo prompt modal after 3 minutes of use"
```

---

### Task 9: Integration Test & Final Verification

**Files:**
- All modified files

**Step 1: Run full backend test suite**

Run: `cd backend && npx vitest run`
Expected: ALL PASS

**Step 2: Run frontend type check and lint**

Run: `cd frontend && npm run build`
Expected: No type errors

**Step 3: Manual end-to-end test**

Start both servers: `npm run dev` (from root)

1. Visit `http://localhost:5173/login`
2. Click "Try Demo" — should redirect to dashboard with 20 contacts
3. Browse contacts, search, click into details — should work
4. Check LinkedIn enrichment tab on enriched contacts — should show data
5. Try importing a file — should see "not available in demo mode" error
6. Wait 3 minutes (or temporarily shorten) — modal should appear
7. Click "Maybe later" — modal dismissed, doesn't reappear
8. Logout — session cleared

**Step 4: Commit any fixes**

**Step 5: Final commit**

```bash
git commit -m "feat(demo): complete demo account feature with seed data, restrictions, and prompt modal"
```

---

### Summary of All Files Changed

**Backend — New:**
- `backend/src/services/demoService.ts` — Core demo logic (seed, cleanup)
- `backend/src/services/__tests__/demoService.test.ts` — Tests

**Backend — Modified:**
- `backend/src/services/authDatabase.ts` — `is_demo` column
- `backend/src/services/__tests__/authDatabase.test.ts` — Test for new column
- `backend/src/routes/auth.ts` — `POST /demo` endpoint, `isDemo` in `/me` response
- `backend/src/middleware/auth.ts` — `isDemo` on `request.user`
- `backend/src/schemas/auth.ts` — `isDemo` in UserSchema
- `backend/src/routes/import.ts` — Demo restriction
- `backend/src/routes/enrich.ts` — Demo restriction
- `backend/src/routes/emailSync.ts` — Demo restriction
- `backend/src/routes/gmailEnrich.ts` — Demo restriction

**Frontend — New:**
- `frontend/src/components/DemoPromptModal.tsx` — Prompt modal

**Frontend — Modified:**
- `frontend/src/components/LoginPage.tsx` — "Try Demo" button
- `frontend/src/api/client.ts` — `startDemo()` function
- `frontend/src/api/authHooks.ts` — `isDemo` on User interface
- `frontend/src/contexts/authContextValue.ts` — `isDemo` on AuthContextType
- `frontend/src/contexts/AuthContext.tsx` — `isDemo` value, skip email refresh for demo
- `frontend/src/App.tsx` — Mount DemoPromptModal

# Onboarding Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dedicated `/onboarding` route that guides new users through profile setup, VCF import, and LinkedIn import via accordion-style collapsible sections.

**Architecture:** New `/onboarding` frontend route with a single `OnboardingView` component containing three `<details>` accordion sections. Backend gets a `has_onboarded` column, a `PATCH /api/auth/onboarded` endpoint, and a `POST /api/profile-images/upload` endpoint. OAuth callback and frontend catch-all redirect to `/onboarding` when the flag is false.

**Tech Stack:** React 19, Pico CSS `<details>`, TanStack Query, Fastify multipart, Sharp image processing, existing VCF/LinkedIn import hooks.

**Design doc:** `docs/plans/2026-03-06-onboarding-flow-design.md`

---

### Task 1: Add `has_onboarded` column to users table

**Files:**
- Modify: `backend/src/services/authDatabase.ts:72-77` (migration section)

**Step 1: Write the failing test**

Add to `backend/src/services/__tests__/authDatabase.test.ts`:

```typescript
it('should add has_onboarded column via migration', () => {
  const db = getAuthDatabase();
  const columns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  expect(columns.some(c => c.name === 'has_onboarded')).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/__tests__/authDatabase.test.ts -t "has_onboarded"`
Expected: FAIL — column doesn't exist yet.

**Step 3: Add the migration**

In `backend/src/services/authDatabase.ts`, after the `is_demo` migration block (line 77), add:

```typescript
  // Migration: add has_onboarded column for existing databases
  if (!columns.some(c => c.name === 'has_onboarded')) {
    db.exec('ALTER TABLE users ADD COLUMN has_onboarded INTEGER DEFAULT 0');
  }
```

Also add `has_onboarded INTEGER DEFAULT 0` to the CREATE TABLE statement (after `is_demo` at line 41) so new databases get it from the start.

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/__tests__/authDatabase.test.ts -t "has_onboarded"`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/authDatabase.ts backend/src/services/__tests__/authDatabase.test.ts
git commit -m "feat: add has_onboarded column to users table"
```

---

### Task 2: Add `PATCH /api/auth/onboarded` endpoint

**Files:**
- Modify: `backend/src/routes/auth.ts` (add new endpoint after the `/me` handler ~line 463)

**Step 1: Write the failing test**

Create `backend/src/routes/__tests__/authOnboarding.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import authRoutes from '../auth.js';
import { getAuthDatabase, closeAuthDatabase } from '../../services/authDatabase.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('PATCH /api/auth/onboarded', () => {
  let app: ReturnType<typeof Fastify>;
  let tmpDir: string;
  let testUserId: number;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-onboarding-test-'));
    process.env.AUTH_DATABASE_PATH = path.join(tmpDir, 'auth.db');
    process.env.SESSION_SECRET = 'test-secret';
    process.env.GOOGLE_CLIENT_ID = 'test-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';

    app = Fastify();
    await app.register(cookie);

    // Create test user and session
    const db = getAuthDatabase();
    const result = db.prepare(
      `INSERT INTO users (google_id, email, name) VALUES ('g123', 'test@test.com', 'Test User')`
    ).run();
    testUserId = Number(result.lastInsertRowid);
    db.prepare(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES ('test-session', ?, datetime('now', '+1 day'))`
    ).run(testUserId);

    // Mock auth middleware
    app.addHook('onRequest', async (request) => {
      if (request.cookies.session_id === 'test-session') {
        (request as any).user = { id: testUserId };
      }
    });

    // Register only the PATCH endpoint (we'll add it to auth routes)
    // For now, test the DB operation directly
  });

  afterAll(() => {
    closeAuthDatabase();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should set has_onboarded to 1 for user', () => {
    const db = getAuthDatabase();

    // Verify starts as 0
    const before = db.prepare('SELECT has_onboarded FROM users WHERE id = ?').get(testUserId) as any;
    expect(before.has_onboarded).toBe(0);

    // Simulate the endpoint logic
    db.prepare('UPDATE users SET has_onboarded = 1 WHERE id = ?').run(testUserId);

    const after = db.prepare('SELECT has_onboarded FROM users WHERE id = ?').get(testUserId) as any;
    expect(after.has_onboarded).toBe(1);
  });
});
```

**Step 2: Run test to verify it passes** (this tests the DB logic, which exists from Task 1)

Run: `cd backend && npx vitest run src/routes/__tests__/authOnboarding.test.ts`
Expected: PASS (DB column already exists from Task 1)

**Step 3: Add the endpoint to auth routes**

In `backend/src/routes/auth.ts`, after the `/me` handler (around line 463), add:

```typescript
  // Mark onboarding as complete
  fastify.patch('/onboarded', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.cookies.session_id;
    if (!sessionId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const user = getUserFromSession(sessionId);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid session' });
    }

    const db = getAuthDatabase();
    db.prepare('UPDATE users SET has_onboarded = 1 WHERE id = ?').run(user.id);

    return { success: true };
  });
```

**Step 4: Include `has_onboarded` in the `/me` response**

In the `/me` handler (line 444-462), add `hasOnboarded: !!user.has_onboarded` to the returned user object. Also update `AuthMeResponseSchema` if it exists as a TypeBox schema — add `hasOnboarded: Type.Boolean()`.

**Step 5: Run all auth tests**

Run: `cd backend && npx vitest run src/routes/__tests__/authOnboarding.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/routes/__tests__/authOnboarding.test.ts
git commit -m "feat: add PATCH /api/auth/onboarded endpoint and hasOnboarded in /me response"
```

---

### Task 3: Add `POST /api/profile-images/upload` endpoint

**Files:**
- Modify: `backend/src/services/profileImageService.ts` (add `processUploadedImage` function)
- Modify: `backend/src/routes/profileImages.ts` (add upload endpoint)

**Step 1: Write the failing test**

Add to `backend/src/services/__tests__/profileImageService.test.ts`:

```typescript
import { processUploadedImage } from '../profileImageService.js';

describe('processUploadedImage', () => {
  it('should process an uploaded image buffer and return a hash', async () => {
    // Create a minimal valid JPEG buffer (1x1 red pixel)
    const { default: sharp } = await import('sharp');
    const testBuffer = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } }
    }).jpeg().toBuffer();

    const hash = await processUploadedImage(testBuffer, 'test-user-upload-1');
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
    expect(hash!.length).toBe(32); // md5 hex length
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/__tests__/profileImageService.test.ts -t "processUploadedImage"`
Expected: FAIL — function doesn't exist yet.

**Step 3: Add `processUploadedImage` to profileImageService.ts**

After the `downloadAndProcessImage` function (line 187), add:

```typescript
export async function processUploadedImage(
  buffer: Buffer,
  identifier: string
): Promise<string | null> {
  try {
    const hash = crypto.createHash('md5').update(identifier).digest('hex');
    const prefix = hash.substring(0, 2);
    const photosPath = getPhotosPath();

    for (const size of SIZES) {
      const dirPath = path.join(photosPath, size.name, prefix);
      await fs.mkdir(dirPath, { recursive: true });

      await sharp(buffer)
        .rotate()
        .resize(size.width, size.height, {
          fit: 'cover',
          position: 'attention',
        })
        .jpeg({
          quality: size.quality,
          mozjpeg: true,
          progressive: true,
        })
        .toFile(path.join(dirPath, `${hash}.jpg`));
    }

    return hash;
  } catch (error) {
    console.error('Error processing uploaded image:', error);
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/__tests__/profileImageService.test.ts -t "processUploadedImage"`
Expected: PASS

**Step 5: Add the upload route**

In `backend/src/routes/profileImages.ts`, add the upload endpoint. This requires `@fastify/multipart` — check if it's already registered. If not, add it.

```typescript
import { processUploadedImage, upsertProfileImage, getProfileImageUrl, getProfileImages } from '../services/profileImageService.js';

// POST /api/profile-images/upload
fastify.post('/upload', async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = request.user!.id;
  const data = await request.file();

  if (!data) {
    return reply.status(400).send({ error: 'No file uploaded' });
  }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimes.includes(data.mimetype)) {
    return reply.status(400).send({ error: 'Invalid file type. Use JPEG, PNG, or WebP.' });
  }

  const buffer = await data.toBuffer();

  // 10MB limit
  if (buffer.length > 10 * 1024 * 1024) {
    return reply.status(400).send({ error: 'File too large. Maximum 10MB.' });
  }

  const identifier = `user-uploaded-${userId}-${Date.now()}`;
  const hash = await processUploadedImage(buffer, identifier);

  if (!hash) {
    return reply.status(500).send({ error: 'Failed to process image' });
  }

  upsertProfileImage(userId, 'user_uploaded', null, hash);

  // Set as primary
  const images = getProfileImages(userId);
  const uploaded = images.find(img => img.source === 'user_uploaded');
  if (uploaded) {
    const { setPrimaryImage } = await import('../services/profileImageService.js');
    setPrimaryImage(userId, uploaded.id);
  }

  return {
    success: true,
    url: getProfileImageUrl(hash),
    hash,
  };
});
```

**Step 6: Ensure `@fastify/multipart` is registered**

Check `backend/src/routes/import.ts` or the main server file to see how multipart is registered. The import route already handles file uploads, so multipart should already be registered at the app level. If it's registered per-route, register it on the profileImages plugin too.

**Step 7: Run tests**

Run: `cd backend && npx vitest run src/services/__tests__/profileImageService.test.ts`
Expected: PASS

**Step 8: Commit**

```bash
git add backend/src/services/profileImageService.ts backend/src/routes/profileImages.ts backend/src/services/__tests__/profileImageService.test.ts
git commit -m "feat: add profile image upload endpoint"
```

---

### Task 4: Update frontend User type and auth hooks

**Files:**
- Modify: `frontend/src/api/authHooks.ts` (add `hasOnboarded` to User interface)
- Modify: `frontend/src/api/hooks.ts` (add `useUploadProfileImage` mutation)

**Step 1: Add `hasOnboarded` to User interface**

In `frontend/src/api/authHooks.ts`, add to the `User` interface (after `isDemo` at line 18):

```typescript
  hasOnboarded?: boolean;
```

**Step 2: Add `useUploadProfileImage` hook**

In `frontend/src/api/hooks.ts`, add:

```typescript
export function useUploadProfileImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadFile('/api/profile-images/upload', file) as Promise<{ success: boolean; url: string; hash: string }>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}
```

**Step 3: Add `useCompleteOnboarding` hook**

In `frontend/src/api/authHooks.ts`, add:

```typescript
export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => fetchApi<{ success: boolean }>('/api/auth/onboarded', { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}
```

(Import `fetchApi` from `./client` and `useMutation`/`useQueryClient` from `@tanstack/react-query` if not already imported.)

**Step 4: Commit**

```bash
git add frontend/src/api/authHooks.ts frontend/src/api/hooks.ts
git commit -m "feat: add hasOnboarded to User type and onboarding hooks"
```

---

### Task 5: Create `OnboardingView` component — shell and accordion

**Files:**
- Create: `frontend/src/components/OnboardingView.tsx`
- Create: `frontend/src/components/OnboardingView.css`

**Step 1: Create the component shell with accordion behavior**

`frontend/src/components/OnboardingView.tsx`:

```tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { useAuth } from '../hooks/useAuth';
import { useCompleteOnboarding } from '../api/authHooks';
import './OnboardingView.css';

type Section = 'profile' | 'vcf' | 'linkedin' | null;

export default function OnboardingView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const completeOnboarding = useCompleteOnboarding();

  const [openSection, setOpenSection] = useState<Section>('profile');
  const [completed, setCompleted] = useState<Record<string, boolean>>({
    profile: false,
    vcf: false,
    linkedin: false,
  });

  const profileRef = useRef<HTMLDetailsElement>(null);
  const vcfRef = useRef<HTMLDetailsElement>(null);
  const linkedinRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    setHeaderConfig({ title: 'Get Started' });
  }, [setHeaderConfig]);

  const handleToggle = useCallback((section: Section) => {
    return (e: React.ToggleEvent<HTMLDetailsElement>) => {
      if (e.newState === 'open') {
        setOpenSection(section);
        // Close others
        if (section !== 'profile') profileRef.current?.removeAttribute('open');
        if (section !== 'vcf') vcfRef.current?.removeAttribute('open');
        if (section !== 'linkedin') linkedinRef.current?.removeAttribute('open');
      } else if (openSection === section) {
        setOpenSection(null);
      }
    };
  }, [openSection]);

  const advanceToNext = useCallback((current: Section) => {
    const order: Section[] = ['profile', 'vcf', 'linkedin'];
    const idx = order.indexOf(current);
    const next = order[idx + 1];
    if (next) {
      setOpenSection(next);
      const refs = { profile: profileRef, vcf: vcfRef, linkedin: linkedinRef };
      // Close current, open next
      if (current) refs[current]?.current?.removeAttribute('open');
      setTimeout(() => {
        refs[next]?.current?.setAttribute('open', '');
      }, 100);
    }
  }, []);

  const markComplete = useCallback((section: string) => {
    setCompleted(prev => ({ ...prev, [section]: true }));
  }, []);

  const handleFinish = useCallback(async () => {
    await completeOnboarding.mutateAsync();
    navigate('/dashboard');
  }, [completeOnboarding, navigate]);

  const allComplete = completed.profile && completed.vcf && completed.linkedin;

  // Auto-complete if all sections done
  useEffect(() => {
    if (allComplete) {
      const timer = setTimeout(() => handleFinish(), 1500);
      return () => clearTimeout(timer);
    }
  }, [allComplete, handleFinish]);

  return (
    <div className="onboarding-container">
      <div className="onboarding-header">
        <h2>Welcome to Yello{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h2>
        <p>Get started by setting up your profile and importing your contacts.</p>
        <a className="skip-link" onClick={handleFinish}>
          Skip to Dashboard &rarr;
        </a>
      </div>

      {allComplete && (
        <p className="onboarding-success">You're all set! Redirecting to dashboard...</p>
      )}

      <details ref={profileRef} open onToggle={handleToggle('profile')}>
        <summary>
          {completed.profile ? '\u2705' : '1.'} Set up your profile
        </summary>
        <div className="onboarding-section">
          {/* Profile section content — Task 6 */}
          <p>Profile setup placeholder</p>
        </div>
      </details>

      <details ref={vcfRef} onToggle={handleToggle('vcf')}>
        <summary>
          {completed.vcf ? '\u2705' : '2.'} Import from Contacts (VCF)
        </summary>
        <div className="onboarding-section">
          {/* VCF section content — Task 7 */}
          <p>VCF import placeholder</p>
        </div>
      </details>

      <details ref={linkedinRef} onToggle={handleToggle('linkedin')}>
        <summary>
          {completed.linkedin ? '\u2705' : '3.'} Import from LinkedIn
        </summary>
        <div className="onboarding-section">
          {/* LinkedIn section content — Task 8 */}
          <p>LinkedIn import placeholder</p>
        </div>
      </details>

      <div className="onboarding-footer">
        <button onClick={handleFinish} disabled={completeOnboarding.isPending}>
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Create basic CSS**

`frontend/src/components/OnboardingView.css`:

```css
.onboarding-container {
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.onboarding-header {
  text-align: center;
  margin-bottom: 2rem;
  position: relative;
}

.onboarding-header h2 {
  margin-bottom: 0.5rem;
}

.onboarding-header p {
  color: var(--pico-muted-color);
  margin-bottom: 0;
}

.skip-link {
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--pico-muted-color);
}

.skip-link:hover {
  color: var(--pico-primary);
}

.onboarding-section {
  padding: 1rem 0;
}

.onboarding-success {
  text-align: center;
  color: var(--pico-primary);
  font-weight: 600;
  margin-bottom: 1rem;
}

.onboarding-footer {
  text-align: center;
  margin-top: 2rem;
}

.onboarding-footer button {
  min-width: 200px;
}
```

**Step 3: Verify it renders** (manual check — start dev server, navigate to `/onboarding`)

**Step 4: Commit**

```bash
git add frontend/src/components/OnboardingView.tsx frontend/src/components/OnboardingView.css
git commit -m "feat: add OnboardingView component shell with accordion"
```

---

### Task 6: Profile section content

**Files:**
- Modify: `frontend/src/components/OnboardingView.tsx` (replace profile placeholder)

**Step 1: Implement the profile section**

Replace the profile placeholder in `OnboardingView.tsx`:

```tsx
import Avatar from './Avatar';
import { useUploadProfileImage } from '../api/hooks';

// Inside the component:
const uploadImage = useUploadProfileImage();
const fileInputRef = useRef<HTMLInputElement>(null);

const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    await uploadImage.mutateAsync(file);
    markComplete('profile');
    advanceToNext('profile');
  } catch {
    // Error handled by mutation state
  }
}, [uploadImage, markComplete, advanceToNext]);

// In the profile <details> section:
<div className="onboarding-section onboarding-profile">
  <div className="profile-preview">
    <Avatar
      photoUrl={user?.profileImages?.find(img => img.isPrimary)?.url || user?.avatarUrl || null}
      name={user?.name || user?.email || 'User'}
      size={120}
    />
    <div className="profile-info">
      <strong>{user?.name || 'Your Name'}</strong>
      <span>{user?.email}</span>
    </div>
  </div>
  <input
    ref={fileInputRef}
    type="file"
    accept="image/jpeg,image/png,image/webp"
    onChange={handleFileSelect}
    style={{ display: 'none' }}
  />
  <button
    className="outline"
    onClick={() => fileInputRef.current?.click()}
    disabled={uploadImage.isPending}
  >
    {uploadImage.isPending ? 'Uploading...' : 'Upload Photo'}
  </button>
  {uploadImage.isError && (
    <p className="error-text">Failed to upload photo. Try again.</p>
  )}
</div>
```

**Step 2: Add CSS for profile section**

Append to `OnboardingView.css`:

```css
.onboarding-profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.profile-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.profile-info {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.profile-info strong {
  font-size: 1.1rem;
}

.profile-info span {
  color: var(--pico-muted-color);
  font-size: 0.875rem;
}

.error-text {
  color: var(--pico-del-color);
  font-size: 0.875rem;
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/OnboardingView.tsx frontend/src/components/OnboardingView.css
git commit -m "feat: add profile photo upload section to onboarding"
```

---

### Task 7: VCF import section content

**Files:**
- Modify: `frontend/src/components/OnboardingView.tsx` (replace VCF placeholder)

**Step 1: Implement the VCF section**

Replace the VCF placeholder:

```tsx
import { useImportVcf } from '../api/hooks';

// Inside the component:
const importVcf = useImportVcf();
const vcfInputRef = useRef<HTMLInputElement>(null);
const [vcfResult, setVcfResult] = useState<{ imported: number; photosProcessed: number; failed: number } | null>(null);

const handleVcfSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const result = await importVcf.mutateAsync(file);
    setVcfResult(result);
    markComplete('vcf');
    advanceToNext('vcf');
  } catch {
    // Error handled by mutation state
  }
}, [importVcf, markComplete, advanceToNext]);

// In the VCF <details> section:
<div className="onboarding-section">
  <p>Import contacts from your phone or email client.</p>

  <details className="onboarding-instructions">
    <summary>How to export your contacts</summary>
    <ul>
      <li><strong>iPhone / iCloud:</strong> Go to <a href="https://www.icloud.com/contacts/" target="_blank" rel="noopener">icloud.com/contacts</a> &rarr; Select All (Cmd+A) &rarr; Export vCard</li>
      <li><strong>Google Contacts:</strong> Go to <a href="https://contacts.google.com/" target="_blank" rel="noopener">contacts.google.com</a> &rarr; Export &rarr; vCard format</li>
      <li><strong>Outlook:</strong> File &rarr; Open &amp; Export &rarr; Export to a file &rarr; choose CSV or vCard</li>
    </ul>
  </details>

  {vcfResult ? (
    <div className="import-result">
      <p>Imported <strong>{vcfResult.imported}</strong> contacts{vcfResult.photosProcessed > 0 && <>, processed <strong>{vcfResult.photosProcessed}</strong> photos</>}.</p>
    </div>
  ) : (
    <>
      <input
        ref={vcfInputRef}
        type="file"
        accept=".vcf,.vcard"
        onChange={handleVcfSelect}
        style={{ display: 'none' }}
      />
      <button
        className="outline"
        onClick={() => vcfInputRef.current?.click()}
        disabled={importVcf.isPending}
      >
        {importVcf.isPending ? 'Importing...' : 'Choose VCF File'}
      </button>
      {importVcf.isPending && <p className="muted-text">This may take a moment for large files.</p>}
      {importVcf.isError && <p className="error-text">Import failed. Please try again.</p>}
    </>
  )}
</div>
```

**Step 2: Add instructions CSS**

Append to `OnboardingView.css`:

```css
.onboarding-instructions {
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.onboarding-instructions ul {
  margin-top: 0.5rem;
}

.import-result {
  padding: 0.75rem;
  background: var(--pico-card-background-color);
  border-radius: var(--pico-border-radius);
  text-align: center;
}

.muted-text {
  color: var(--pico-muted-color);
  font-size: 0.875rem;
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/OnboardingView.tsx frontend/src/components/OnboardingView.css
git commit -m "feat: add VCF import section to onboarding"
```

---

### Task 8: LinkedIn import section content

**Files:**
- Modify: `frontend/src/components/OnboardingView.tsx` (replace LinkedIn placeholder)

**Step 1: Implement the LinkedIn section**

Replace the LinkedIn placeholder:

```tsx
import { useImportLinkedInStream, parseLinkedInCsv } from '../api/settingsHooks';

// Inside the component:
const { isImporting: isLinkedInImporting, progress: linkedInProgress, importResult: linkedInResult, error: linkedInError, startImport: startLinkedInImport } = useImportLinkedInStream();
const linkedInInputRef = useRef<HTMLInputElement>(null);

const handleLinkedInSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const content = await file.text();
    const contacts = parseLinkedInCsv(content);
    if (contacts.length === 0) {
      return; // Could show an error
    }
    startLinkedInImport(contacts, () => {
      markComplete('linkedin');
    });
  } catch {
    // Error handled by hook state
  }
}, [startLinkedInImport, markComplete]);

// In the LinkedIn <details> section:
<div className="onboarding-section">
  <p>Import your LinkedIn connections.</p>

  <details className="onboarding-instructions">
    <summary>How to export from LinkedIn</summary>
    <ol>
      <li>Go to <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noopener">linkedin.com</a> &rarr; Click your profile icon &rarr; <strong>Settings &amp; Privacy</strong></li>
      <li>Select <strong>Data privacy</strong> &rarr; <strong>Get a copy of your data</strong></li>
      <li>Select <strong>Connections</strong> only (faster than the full archive)</li>
      <li>Click <strong>Request archive</strong> — LinkedIn will email you a download link (can take minutes to hours)</li>
      <li>Download the ZIP file, extract it, and find <code>Connections.csv</code></li>
      <li>Upload that CSV file below</li>
    </ol>
  </details>

  {linkedInResult ? (
    <div className="import-result">
      <p>Created <strong>{linkedInResult.created}</strong> / Updated <strong>{linkedInResult.updated}</strong> / Skipped <strong>{linkedInResult.skipped}</strong></p>
    </div>
  ) : isLinkedInImporting && linkedInProgress ? (
    <div className="import-progress">
      <p>Importing... Created: {linkedInProgress.created} / Updated: {linkedInProgress.updated} / Skipped: {linkedInProgress.skipped}</p>
      <progress value={linkedInProgress.processed} max={linkedInProgress.total} />
    </div>
  ) : (
    <>
      <input
        ref={linkedInInputRef}
        type="file"
        accept=".csv"
        onChange={handleLinkedInSelect}
        style={{ display: 'none' }}
      />
      <button
        className="outline"
        onClick={() => linkedInInputRef.current?.click()}
        disabled={isLinkedInImporting}
      >
        Choose CSV File
      </button>
      {linkedInError && <p className="error-text">{linkedInError}</p>}
    </>
  )}
</div>
```

**Step 2: Add progress CSS**

Append to `OnboardingView.css`:

```css
.import-progress {
  text-align: center;
}

.import-progress progress {
  width: 100%;
  margin-top: 0.5rem;
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/OnboardingView.tsx frontend/src/components/OnboardingView.css
git commit -m "feat: add LinkedIn import section to onboarding"
```

---

### Task 9: Wire up routing and redirect logic

**Files:**
- Modify: `frontend/src/App.tsx` (add `/onboarding` route and redirect logic)

**Step 1: Add the onboarding route**

In `frontend/src/App.tsx`, import the component and add the route inside the protected Layout routes (after line 156 — the `profile` route):

```tsx
import OnboardingView from './components/OnboardingView';

// Inside the Layout routes:
<Route path="onboarding" element={<OnboardingView />} />
```

**Step 2: Update `ProtectedRoute` to redirect to onboarding**

Modify the `ProtectedRoute` component (lines 23-72) to check `hasOnboarded`. After the loading check and the `!isAuthenticated` redirect, add:

```tsx
// After the isAuthenticated check, before rendering children:
if (isAuthenticated && user && user.hasOnboarded === false && location.pathname !== '/onboarding') {
  return <Navigate to="/onboarding" replace />;
}
```

This redirects unauthenticated-onboarding users to `/onboarding` from any route (including the `/dashboard` catch-all), but allows them to stay on `/onboarding` itself.

**Step 3: Test manually**

Start the dev server, create a new user (or reset `has_onboarded` to 0 in the DB). Verify:
- First login → redirects to `/onboarding`
- Can click "Skip to Dashboard" → goes to `/dashboard`, subsequent loads go to `/dashboard`
- `/onboarding` is still manually accessible after skipping

**Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire up onboarding route and redirect logic"
```

---

### Task 10: Update OAuth callback redirect

**Files:**
- Modify: `backend/src/routes/auth.ts:367` (redirect after login)

**Step 1: Change the redirect**

The OAuth callback at line 367 currently does `return reply.redirect('/')`. This works as-is because the frontend `ProtectedRoute` now checks `hasOnboarded` and redirects accordingly. No backend change is actually needed — the frontend handles it.

However, for a cleaner UX (avoiding a flash of dashboard), update the redirect to check `has_onboarded`:

```typescript
// Replace: return reply.redirect('/');
const redirectUrl = user.has_onboarded ? '/dashboard' : '/onboarding';
return reply.redirect(redirectUrl);
```

Apply this to both the normal login flow (line 367) and the Gmail re-auth flow redirect (line 301) if applicable.

Note: `user` here is the result of `upsertUser()` which returns the user row. Check that the returned object includes `has_onboarded`. If `upsertUser` uses `RETURNING *` or a subsequent SELECT, it should. If not, add `has_onboarded` to the returned fields.

**Step 2: Commit**

```bash
git add backend/src/routes/auth.ts
git commit -m "feat: redirect to /onboarding for new users after OAuth"
```

---

### Task 11: Final integration testing and cleanup

**Step 1: Manual end-to-end test**

Start dev servers: `npm run dev`

Test the complete flow:
1. Clear your session (delete `session_id` cookie) or use incognito
2. Log in with Google → should land on `/onboarding`
3. Profile section is open, shows your Google avatar
4. Upload a new photo → checkmark appears, VCF section opens
5. Upload a VCF file → import runs, checkmark appears, LinkedIn section opens
6. Upload a LinkedIn CSV → progress streams, checkmark appears
7. "You're all set!" appears, auto-redirects to `/dashboard`
8. Refresh → goes directly to `/dashboard` (not back to onboarding)
9. Navigate to `/onboarding` manually → still works, can re-import

Also test:
- Click "Skip to Dashboard" at step 1 → goes to dashboard, never sees onboarding again
- Click "Go to Dashboard" after partial completion → works correctly

**Step 2: Run all tests**

```bash
cd backend && npx vitest run
```

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: onboarding integration fixes"
```

**Step 4: Update change log**

Append to `docs/log.md`:

```markdown
## 2026-03-06 HH:MM — Onboarding Flow

- Added `/onboarding` route with accordion-style guided setup
- Profile photo upload via `POST /api/profile-images/upload`
- VCF import section with export instructions for iPhone, Google, Outlook
- LinkedIn CSV import section with step-by-step export guide
- `has_onboarded` flag on users table, `PATCH /api/auth/onboarded` endpoint
- Auto-redirect to onboarding for new users, skippable at any time
- Auto-completion detection with redirect after all steps done
```

**Step 5: Final commit**

```bash
git add docs/log.md
git commit -m "docs: add onboarding flow to change log"
```

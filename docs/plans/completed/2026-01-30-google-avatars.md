# Google Avatars - Multi-Image Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a multi-image profile system that fetches and stores avatars from Google (own profile + contacts) and Gravatar as additional sources.

**Architecture:** Add a `profile_images` table to store multiple images per user with source labeling. Create a `profileImageService` to handle fetching from Google People API and Gravatar, downloading images locally (like contact photos), and managing primary/secondary images. Update OAuth to request `contacts.other.readonly` scope.

**Tech Stack:** SQLite, Fastify, Sharp (image processing), Google People API, Gravatar API, TypeBox schemas

---

## Task 1: Add OAuth Scope for Contacts

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/routes/auth.ts:153`

**Step 1: Update OAuth scope array**

Change line 153 from:
```typescript
scope: ['profile', 'email'],
```

To:
```typescript
scope: ['profile', 'email', 'https://www.googleapis.com/auth/contacts.other.readonly'],
```

**Step 2: Verify the change**

Run: `grep -n "contacts.other.readonly" backend/src/routes/auth.ts`
Expected: Line 153 shows the new scope

**Step 3: Commit**

```bash
git add backend/src/routes/auth.ts
git commit -m "feat: add contacts.other.readonly scope for Google OAuth

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create ProfileImage Database Schema

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/services/database.ts`

**Step 1: Add profile_images table creation**

After line 205 (after `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);`), add:

```typescript
    -- Profile images table for multi-source avatar support
    CREATE TABLE IF NOT EXISTS profile_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('user_uploaded', 'google', 'google_contacts', 'gravatar')),
      original_url TEXT,
      local_hash TEXT,
      is_primary INTEGER DEFAULT 0,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_profile_images_user_id ON profile_images(user_id);
    CREATE INDEX IF NOT EXISTS idx_profile_images_source ON profile_images(source);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_images_user_source ON profile_images(user_id, source);
```

**Step 2: Verify syntax**

Run: `cd backend && npm run build`
Expected: Build succeeds without errors

**Step 3: Commit**

```bash
git add backend/src/services/database.ts
git commit -m "feat: add profile_images table for multi-source avatar support

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create ProfileImage TypeBox Schema

**Files:**
- Create: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/schemas/profileImage.ts`

**Step 1: Create the schema file**

```typescript
import { Type, Static } from '@sinclair/typebox';

export const ProfileImageSourceEnum = Type.Union([
  Type.Literal('user_uploaded'),
  Type.Literal('google'),
  Type.Literal('google_contacts'),
  Type.Literal('gravatar'),
]);

export type ProfileImageSource = Static<typeof ProfileImageSourceEnum>;

export const ProfileImageSchema = Type.Object({
  id: Type.Number(),
  userId: Type.Number(),
  source: ProfileImageSourceEnum,
  originalUrl: Type.Union([Type.String(), Type.Null()]),
  localHash: Type.Union([Type.String(), Type.Null()]),
  isPrimary: Type.Boolean(),
  fetchedAt: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export type ProfileImage = Static<typeof ProfileImageSchema>;

export const ProfileImageListSchema = Type.Array(ProfileImageSchema);

export const ProfileImageWithUrlSchema = Type.Object({
  id: Type.Number(),
  userId: Type.Number(),
  source: ProfileImageSourceEnum,
  originalUrl: Type.Union([Type.String(), Type.Null()]),
  url: Type.Union([Type.String(), Type.Null()]),
  isPrimary: Type.Boolean(),
  fetchedAt: Type.String(),
});

export type ProfileImageWithUrl = Static<typeof ProfileImageWithUrlSchema>;
```

**Step 2: Verify syntax**

Run: `cd backend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add backend/src/schemas/profileImage.ts
git commit -m "feat: add ProfileImage TypeBox schema

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create ProfileImage Service - Core Functions

**Files:**
- Create: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/services/profileImageService.ts`
- Test: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/services/__tests__/profileImageService.test.ts`

**Step 1: Write the failing test**

Create test file:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDatabase, closeDatabase } from '../database.js';
import {
  getProfileImages,
  getPrimaryProfileImage,
  upsertProfileImage,
  setPrimaryImage,
  getProfileImageUrl,
} from '../profileImageService.js';
import fs from 'fs/promises';

const TEST_DB_PATH = './test-data/profile-images-test.db';
const TEST_PHOTOS_PATH = './test-data/profile-photos';

describe('profileImageService', () => {
  let userId: number;

  beforeAll(async () => {
    process.env.DATABASE_PATH = TEST_DB_PATH;
    process.env.PHOTOS_PATH = TEST_PHOTOS_PATH;
    await fs.mkdir('./test-data', { recursive: true });

    const db = getDatabase();
    // Create test user
    const result = db.prepare(`
      INSERT INTO users (google_id, email, name, avatar_url)
      VALUES ('test-google-id', 'test@example.com', 'Test User', NULL)
    `).run();
    userId = Number(result.lastInsertRowid);
  });

  afterAll(async () => {
    closeDatabase();
    await fs.rm('./test-data', { recursive: true, force: true });
  });

  beforeEach(() => {
    const db = getDatabase();
    db.prepare('DELETE FROM profile_images').run();
  });

  it('should return empty array when no images exist', () => {
    const images = getProfileImages(userId);
    expect(images).toEqual([]);
  });

  it('should upsert a profile image', () => {
    const image = upsertProfileImage(userId, 'google', 'https://example.com/photo.jpg', 'abc123');
    expect(image.userId).toBe(userId);
    expect(image.source).toBe('google');
    expect(image.originalUrl).toBe('https://example.com/photo.jpg');
    expect(image.localHash).toBe('abc123');
  });

  it('should update existing image on upsert with same source', () => {
    upsertProfileImage(userId, 'google', 'https://old.com/photo.jpg', 'old123');
    const updated = upsertProfileImage(userId, 'google', 'https://new.com/photo.jpg', 'new456');

    const images = getProfileImages(userId);
    expect(images).toHaveLength(1);
    expect(images[0].originalUrl).toBe('https://new.com/photo.jpg');
    expect(images[0].localHash).toBe('new456');
  });

  it('should set first image as primary by default', () => {
    upsertProfileImage(userId, 'google', 'https://example.com/photo.jpg', 'abc123');
    const primary = getPrimaryProfileImage(userId);
    expect(primary).not.toBeNull();
    expect(primary!.isPrimary).toBe(true);
  });

  it('should allow changing primary image', () => {
    upsertProfileImage(userId, 'google', 'https://google.com/photo.jpg', 'google123');
    const gravatar = upsertProfileImage(userId, 'gravatar', 'https://gravatar.com/photo.jpg', 'gravatar456');

    setPrimaryImage(userId, gravatar.id);

    const images = getProfileImages(userId);
    const googleImage = images.find(i => i.source === 'google');
    const gravatarImage = images.find(i => i.source === 'gravatar');

    expect(googleImage!.isPrimary).toBe(false);
    expect(gravatarImage!.isPrimary).toBe(true);
  });

  it('should generate correct URL from local hash', () => {
    const url = getProfileImageUrl('abc123def456');
    expect(url).toBe('/photos/medium/ab/abc123def456.jpg');
  });

  it('should return null URL for null hash', () => {
    const url = getProfileImageUrl(null);
    expect(url).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- --run profileImageService`
Expected: FAIL - module not found

**Step 3: Create the service with core functions**

```typescript
import { getDatabase } from './database.js';

export interface ProfileImageRow {
  id: number;
  user_id: number;
  source: 'user_uploaded' | 'google' | 'google_contacts' | 'gravatar';
  original_url: string | null;
  local_hash: string | null;
  is_primary: number;
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProfileImage {
  id: number;
  userId: number;
  source: 'user_uploaded' | 'google' | 'google_contacts' | 'gravatar';
  originalUrl: string | null;
  localHash: string | null;
  isPrimary: boolean;
  fetchedAt: string;
  createdAt: string;
  updatedAt: string;
}

function rowToProfileImage(row: ProfileImageRow): ProfileImage {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    originalUrl: row.original_url,
    localHash: row.local_hash,
    isPrimary: row.is_primary === 1,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getProfileImages(userId: number): ProfileImage[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM profile_images
    WHERE user_id = ?
    ORDER BY is_primary DESC, created_at ASC
  `).all(userId) as ProfileImageRow[];

  return rows.map(rowToProfileImage);
}

export function getPrimaryProfileImage(userId: number): ProfileImage | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT * FROM profile_images
    WHERE user_id = ? AND is_primary = 1
  `).get(userId) as ProfileImageRow | undefined;

  return row ? rowToProfileImage(row) : null;
}

export function upsertProfileImage(
  userId: number,
  source: ProfileImage['source'],
  originalUrl: string | null,
  localHash: string | null
): ProfileImage {
  const db = getDatabase();

  // Check if this is the first image for the user
  const existingCount = db.prepare(
    'SELECT COUNT(*) as count FROM profile_images WHERE user_id = ?'
  ).get(userId) as { count: number };

  const isPrimary = existingCount.count === 0 ? 1 : 0;

  // Upsert: insert or update based on user_id + source
  db.prepare(`
    INSERT INTO profile_images (user_id, source, original_url, local_hash, is_primary, fetched_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, source) DO UPDATE SET
      original_url = excluded.original_url,
      local_hash = excluded.local_hash,
      fetched_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, source, originalUrl, localHash, isPrimary);

  // Get the upserted row
  const row = db.prepare(`
    SELECT * FROM profile_images WHERE user_id = ? AND source = ?
  `).get(userId, source) as ProfileImageRow;

  return rowToProfileImage(row);
}

export function setPrimaryImage(userId: number, imageId: number): void {
  const db = getDatabase();

  db.transaction(() => {
    // Remove primary from all user's images
    db.prepare('UPDATE profile_images SET is_primary = 0 WHERE user_id = ?').run(userId);
    // Set new primary
    db.prepare('UPDATE profile_images SET is_primary = 1 WHERE id = ? AND user_id = ?').run(imageId, userId);
  })();
}

export function getProfileImageUrl(localHash: string | null, size: 'thumbnail' | 'small' | 'medium' | 'large' = 'medium'): string | null {
  if (!localHash) return null;
  const prefix = localHash.substring(0, 2);
  return `/photos/${size}/${prefix}/${localHash}.jpg`;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- --run profileImageService`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/src/services/profileImageService.ts backend/src/services/__tests__/profileImageService.test.ts
git commit -m "feat: add profileImageService with core CRUD functions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Add Gravatar Hash Function

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/services/profileImageService.ts`
- Test: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/services/__tests__/profileImageService.test.ts`

**Step 1: Write the failing test**

Add to test file:

```typescript
import { getGravatarHash, getGravatarUrl } from '../profileImageService.js';

describe('gravatar functions', () => {
  it('should generate correct SHA256 hash for email', () => {
    // Known test case from Gravatar docs
    const hash = getGravatarHash('  MyEmail@Example.COM  ');
    // Should normalize to 'myemail@example.com' then hash
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate consistent hash for same email', () => {
    const hash1 = getGravatarHash('test@example.com');
    const hash2 = getGravatarHash('TEST@EXAMPLE.COM');
    expect(hash1).toBe(hash2);
  });

  it('should generate correct Gravatar URL', () => {
    const url = getGravatarUrl('test@example.com');
    expect(url).toMatch(/^https:\/\/gravatar\.com\/avatar\/[a-f0-9]{64}\?d=404$/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- --run profileImageService`
Expected: FAIL - getGravatarHash not found

**Step 3: Add Gravatar functions**

Add to profileImageService.ts:

```typescript
import crypto from 'crypto';

export function getGravatarHash(email: string): string {
  const normalized = email.trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function getGravatarUrl(email: string): string {
  const hash = getGravatarHash(email);
  return `https://gravatar.com/avatar/${hash}?d=404`;
}
```

**Step 4: Run tests**

Run: `cd backend && npm test -- --run profileImageService`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/src/services/profileImageService.ts backend/src/services/__tests__/profileImageService.test.ts
git commit -m "feat: add Gravatar hash and URL functions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Add Image Download and Processing Function

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/services/profileImageService.ts`
- Test: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/services/__tests__/profileImageService.test.ts`

**Step 1: Write the failing test**

Add to test file:

```typescript
import { downloadAndProcessImage } from '../profileImageService.js';

describe('downloadAndProcessImage', () => {
  it('should return null for non-existent URL', async () => {
    const hash = await downloadAndProcessImage('https://httpbin.org/status/404', 'test-user');
    expect(hash).toBeNull();
  });

  // Note: We can't easily test successful download without mocking
  // The function will be integration tested via OAuth flow
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- --run profileImageService`
Expected: FAIL - downloadAndProcessImage not found

**Step 3: Add download and process function**

Add to profileImageService.ts:

```typescript
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

const SIZES = [
  { name: 'thumbnail', width: 48, height: 48, quality: 80 },
  { name: 'small', width: 96, height: 96, quality: 82 },
  { name: 'medium', width: 200, height: 200, quality: 85 },
  { name: 'large', width: 400, height: 400, quality: 88 },
] as const;

function getPhotosPath(): string {
  return process.env.PHOTOS_PATH || './data/photos';
}

export async function downloadAndProcessImage(
  imageUrl: string,
  identifier: string
): Promise<string | null> {
  try {
    // Fetch the image
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'ElloCRM/1.0',
      },
    });

    if (!response.ok) {
      console.log(`Failed to fetch image from ${imageUrl}: ${response.status}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Generate hash based on identifier (user email or id)
    const hash = crypto.createHash('md5').update(identifier).digest('hex');
    const prefix = hash.substring(0, 2);
    const photosPath = getPhotosPath();

    // Process and save all sizes
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
    console.error(`Error downloading/processing image from ${imageUrl}:`, error);
    return null;
  }
}
```

**Step 4: Run tests**

Run: `cd backend && npm test -- --run profileImageService`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/src/services/profileImageService.ts backend/src/services/__tests__/profileImageService.test.ts
git commit -m "feat: add downloadAndProcessImage for fetching external avatars

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Add fetchAndStoreGoogleAvatar Function

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/services/profileImageService.ts`

**Step 1: Add the function**

Add to profileImageService.ts:

```typescript
export async function fetchAndStoreGoogleAvatar(
  userId: number,
  googlePictureUrl: string | null,
  userEmail: string
): Promise<ProfileImage | null> {
  if (!googlePictureUrl) {
    return null;
  }

  try {
    const localHash = await downloadAndProcessImage(googlePictureUrl, `google-${userEmail}`);

    if (!localHash) {
      return null;
    }

    return upsertProfileImage(userId, 'google', googlePictureUrl, localHash);
  } catch (error) {
    console.error('Error fetching Google avatar:', error);
    return null;
  }
}
```

**Step 2: Verify build**

Run: `cd backend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add backend/src/services/profileImageService.ts
git commit -m "feat: add fetchAndStoreGoogleAvatar function

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Add fetchAndStoreGravatar Function

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/services/profileImageService.ts`

**Step 1: Add the function**

Add to profileImageService.ts:

```typescript
export async function fetchAndStoreGravatar(
  userId: number,
  email: string
): Promise<ProfileImage | null> {
  try {
    const gravatarUrl = getGravatarUrl(email);
    const localHash = await downloadAndProcessImage(gravatarUrl, `gravatar-${email}`);

    if (!localHash) {
      // No Gravatar exists for this email (404)
      return null;
    }

    return upsertProfileImage(userId, 'gravatar', gravatarUrl, localHash);
  } catch (error) {
    console.error('Error fetching Gravatar:', error);
    return null;
  }
}
```

**Step 2: Verify build**

Run: `cd backend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add backend/src/services/profileImageService.ts
git commit -m "feat: add fetchAndStoreGravatar function

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Update Auth Callback to Fetch Avatars

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/routes/auth.ts`

**Step 1: Add import**

At top of auth.ts, add:

```typescript
import { fetchAndStoreGoogleAvatar, fetchAndStoreGravatar, getPrimaryProfileImage, getProfileImageUrl } from '../services/profileImageService.js';
```

**Step 2: Update OAuth callback to fetch avatars after user upsert**

After line 194 (`userInfo.picture || null`), add:

```typescript
        // Fetch and store profile images in background (don't block the response)
        (async () => {
          try {
            // Fetch Google avatar
            await fetchAndStoreGoogleAvatar(user.id, userInfo.picture || null, userInfo.email);

            // Fetch Gravatar as additional source
            await fetchAndStoreGravatar(user.id, userInfo.email);
          } catch (error) {
            fastify.log.error(error, 'Error fetching profile images');
          }
        })();
```

**Step 3: Verify build**

Run: `cd backend && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add backend/src/routes/auth.ts
git commit -m "feat: fetch Google and Gravatar avatars on OAuth login

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Update /auth/me to Return Profile Images

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/routes/auth.ts`
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/schemas/auth.ts`

**Step 1: Update schema to include profileImages**

In auth.ts schema file, update UserSchema:

```typescript
import { Type, Static } from '@sinclair/typebox';

export const ProfileImageSchema = Type.Object({
  id: Type.Number(),
  source: Type.Union([
    Type.Literal('user_uploaded'),
    Type.Literal('google'),
    Type.Literal('google_contacts'),
    Type.Literal('gravatar'),
  ]),
  url: Type.Union([Type.String(), Type.Null()]),
  isPrimary: Type.Boolean(),
});

export const UserSchema = Type.Object({
  id: Type.Number(),
  googleId: Type.String(),
  email: Type.String(),
  name: Type.Union([Type.String(), Type.Null()]),
  avatarUrl: Type.Union([Type.String(), Type.Null()]),
  profileImages: Type.Array(ProfileImageSchema),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export type User = Static<typeof UserSchema>;

export const AuthMeResponseSchema = Type.Object({
  user: Type.Union([UserSchema, Type.Null()]),
  isAuthenticated: Type.Boolean(),
});

export type AuthMeResponse = Static<typeof AuthMeResponseSchema>;

export const AuthErrorSchema = Type.Object({
  error: Type.String(),
});

export type AuthError = Static<typeof AuthErrorSchema>;
```

**Step 2: Update /auth/me route in auth.ts**

Add import at top:
```typescript
import { getProfileImages, getProfileImageUrl } from '../services/profileImageService.js';
```

Update the /auth/me handler (around line 242-253):

```typescript
    // Get profile images
    const profileImages = getProfileImages(user.id);

    return {
      user: {
        id: user.id,
        googleId: user.google_id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        profileImages: profileImages.map(img => ({
          id: img.id,
          source: img.source,
          url: getProfileImageUrl(img.localHash),
          isPrimary: img.isPrimary,
        })),
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      isAuthenticated: true,
    };
```

**Step 3: Verify build**

Run: `cd backend && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/schemas/auth.ts
git commit -m "feat: return profileImages array in /auth/me response

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Create Profile Images API Routes

**Files:**
- Create: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/routes/profileImages.ts`

**Step 1: Create the routes file**

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  getProfileImages,
  setPrimaryImage,
  getProfileImageUrl,
} from '../services/profileImageService.js';

// Get user from session helper (same logic as auth.ts)
function getUserIdFromSession(request: FastifyRequest): number | null {
  const sessionId = request.cookies.session_id;
  if (!sessionId) return null;

  const { getDatabase } = require('../services/database.js');
  const db = getDatabase();

  const session = db.prepare(`
    SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')
  `).get(sessionId) as { user_id: number } | undefined;

  return session?.user_id || null;
}

export default async function profileImagesRoutes(fastify: FastifyInstance) {
  // Get all profile images for current user
  fastify.get('/', {
    schema: {
      response: {
        200: Type.Array(Type.Object({
          id: Type.Number(),
          source: Type.String(),
          url: Type.Union([Type.String(), Type.Null()]),
          isPrimary: Type.Boolean(),
        })),
        401: Type.Object({ error: Type.String() }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const images = getProfileImages(userId);
    return images.map(img => ({
      id: img.id,
      source: img.source,
      url: getProfileImageUrl(img.localHash),
      isPrimary: img.isPrimary,
    }));
  });

  // Set primary image
  fastify.post('/:imageId/primary', {
    schema: {
      params: Type.Object({
        imageId: Type.String(),
      }),
      response: {
        200: Type.Object({ success: Type.Boolean() }),
        401: Type.Object({ error: Type.String() }),
        404: Type.Object({ error: Type.String() }),
      },
    },
  }, async (request: FastifyRequest<{ Params: { imageId: string } }>, reply: FastifyReply) => {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const imageId = parseInt(request.params.imageId, 10);
    if (isNaN(imageId)) {
      return reply.status(404).send({ error: 'Invalid image ID' });
    }

    // Verify the image belongs to this user
    const images = getProfileImages(userId);
    const image = images.find(img => img.id === imageId);
    if (!image) {
      return reply.status(404).send({ error: 'Image not found' });
    }

    setPrimaryImage(userId, imageId);
    return { success: true };
  });
}
```

**Step 2: Register the route in server.ts**

Find server.ts and add:

```typescript
import profileImagesRoutes from './routes/profileImages.js';

// Inside the server setup, after other route registrations:
await fastify.register(profileImagesRoutes, { prefix: '/api/profile-images' });
```

**Step 3: Verify build**

Run: `cd backend && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add backend/src/routes/profileImages.ts backend/src/server.ts
git commit -m "feat: add profile images API routes

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Update Frontend User Type

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/frontend/src/api/authHooks.ts`

**Step 1: Update User interface**

```typescript
export interface ProfileImage {
  id: number;
  source: 'user_uploaded' | 'google' | 'google_contacts' | 'gravatar';
  url: string | null;
  isPrimary: boolean;
}

export interface User {
  id: number;
  googleId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  profileImages: ProfileImage[];
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/api/authHooks.ts
git commit -m "feat: add ProfileImage type to frontend User interface

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 13: Update Sidebar to Use Primary Profile Image

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/frontend/src/components/Sidebar.tsx`

**Step 1: Update avatar logic**

Change line 50 from:
```typescript
const avatarUrl = user?.avatarUrl;
```

To:
```typescript
// Use primary profile image if available, fall back to legacy avatarUrl
const primaryImage = user?.profileImages?.find(img => img.isPrimary);
const avatarUrl = primaryImage?.url || user?.avatarUrl;
```

**Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: use primary profile image in Sidebar avatar

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 14: Add Google People API Service for Contacts

**Files:**
- Create: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/services/googlePeopleService.ts`

**Step 1: Create the service**

```typescript
interface GoogleContact {
  email: string;
  photoUrl: string | null;
}

interface OtherContactsResponse {
  otherContacts?: Array<{
    resourceName: string;
    emailAddresses?: Array<{ value: string }>;
    photos?: Array<{ url: string; metadata?: { primary?: boolean } }>;
  }>;
  nextPageToken?: string;
}

export async function fetchGoogleContactsPhotos(accessToken: string): Promise<GoogleContact[]> {
  const contacts: GoogleContact[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const url = new URL('https://people.googleapis.com/v1/otherContacts');
      url.searchParams.set('readMask', 'emailAddresses,photos');
      url.searchParams.set('pageSize', '1000');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          console.log('User has not granted contacts permission');
          return [];
        }
        throw new Error(`Google People API error: ${response.status}`);
      }

      const data = (await response.json()) as OtherContactsResponse;

      if (data.otherContacts) {
        for (const contact of data.otherContacts) {
          const email = contact.emailAddresses?.[0]?.value;
          const photo = contact.photos?.find(p => p.metadata?.primary)?.url || contact.photos?.[0]?.url;

          if (email && photo) {
            contacts.push({ email: email.toLowerCase(), photoUrl: photo });
          }
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return contacts;
  } catch (error) {
    console.error('Error fetching Google contacts:', error);
    return [];
  }
}
```

**Step 2: Verify build**

Run: `cd backend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add backend/src/services/googlePeopleService.ts
git commit -m "feat: add Google People API service for contacts photos

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 15: Add Function to Enrich Other Users from Contacts

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/services/profileImageService.ts`

**Step 1: Add the enrichment function**

Add to profileImageService.ts:

```typescript
import { fetchGoogleContactsPhotos } from './googlePeopleService.js';

export async function enrichUsersFromGoogleContacts(accessToken: string): Promise<number> {
  const db = getDatabase();
  let enrichedCount = 0;

  try {
    // Fetch contacts with photos
    const contacts = await fetchGoogleContactsPhotos(accessToken);

    if (contacts.length === 0) {
      return 0;
    }

    // Find matching users in our database
    for (const contact of contacts) {
      const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(contact.email) as { id: number; email: string } | undefined;

      if (user && contact.photoUrl) {
        // Check if we already have a google_contacts image for this user
        const existing = db.prepare(
          'SELECT id FROM profile_images WHERE user_id = ? AND source = ?'
        ).get(user.id, 'google_contacts') as { id: number } | undefined;

        if (!existing) {
          // Download and store the contact photo
          const localHash = await downloadAndProcessImage(contact.photoUrl, `google-contacts-${user.email}`);

          if (localHash) {
            upsertProfileImage(user.id, 'google_contacts', contact.photoUrl, localHash);
            enrichedCount++;
          }
        }
      }
    }

    return enrichedCount;
  } catch (error) {
    console.error('Error enriching users from Google contacts:', error);
    return 0;
  }
}
```

**Step 2: Verify build**

Run: `cd backend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add backend/src/services/profileImageService.ts
git commit -m "feat: add enrichUsersFromGoogleContacts function

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 16: Add Contacts Sync to OAuth Callback

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/routes/auth.ts`

**Step 1: Update import**

Update the import to include enrichUsersFromGoogleContacts:

```typescript
import {
  fetchAndStoreGoogleAvatar,
  fetchAndStoreGravatar,
  getProfileImages,
  getProfileImageUrl,
  enrichUsersFromGoogleContacts
} from '../services/profileImageService.js';
```

**Step 2: Add contacts sync to the background task**

Update the async block after user upsert (around line 195):

```typescript
        // Fetch and store profile images in background (don't block the response)
        (async () => {
          try {
            // Fetch Google avatar
            await fetchAndStoreGoogleAvatar(user.id, userInfo.picture || null, userInfo.email);

            // Fetch Gravatar as additional source
            await fetchAndStoreGravatar(user.id, userInfo.email);

            // Enrich other users from this user's Google contacts
            const enrichedCount = await enrichUsersFromGoogleContacts(accessToken);
            if (enrichedCount > 0) {
              fastify.log.info(`Enriched ${enrichedCount} users from Google contacts`);
            }
          } catch (error) {
            fastify.log.error(error, 'Error fetching profile images');
          }
        })();
```

**Step 3: Verify build**

Run: `cd backend && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add backend/src/routes/auth.ts
git commit -m "feat: sync Google contacts photos on OAuth login

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 17: Add Migration for Existing avatar_url

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/services/database.ts`

**Step 1: Add migration after profile_images table creation**

After the existing migrations in database.ts (around line 615), add:

```typescript
  // Migration: Populate profile_images from existing avatar_url
  const profileImagesMigrationNeeded = (() => {
    const usersWithAvatars = db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE avatar_url IS NOT NULL
    `).get() as { count: number };

    const existingProfileImages = db.prepare(`
      SELECT COUNT(*) as count FROM profile_images WHERE source = 'google'
    `).get() as { count: number };

    return usersWithAvatars.count > 0 && existingProfileImages.count === 0;
  })();

  if (profileImagesMigrationNeeded) {
    console.log('Migrating existing avatar_url to profile_images table...');

    const users = db.prepare(`
      SELECT id, email, avatar_url FROM users WHERE avatar_url IS NOT NULL
    `).all() as Array<{ id: number; email: string; avatar_url: string }>;

    for (const user of users) {
      try {
        db.prepare(`
          INSERT INTO profile_images (user_id, source, original_url, is_primary)
          VALUES (?, 'google', ?, 1)
        `).run(user.id, user.avatar_url);
      } catch (e) {
        // Ignore duplicate key errors
      }
    }

    console.log(`Migrated ${users.length} existing avatars to profile_images`);
  }
```

**Step 2: Verify build**

Run: `cd backend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add backend/src/services/database.ts
git commit -m "feat: add migration to populate profile_images from avatar_url

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 18: Run Full Test Suite

**Step 1: Run backend tests**

Run: `cd backend && npm test`
Expected: All tests pass

**Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Test the development server**

Run: `npm run dev` (in root)
Expected: Both servers start without errors

---

## Task 19: Manual Testing Checklist

**Step 1: Test OAuth login flow**

1. Clear session/cookies
2. Click "Sign in with Google"
3. Verify consent screen shows "contacts.other.readonly" permission
4. Complete login
5. Check browser network tab for profile_images in /auth/me response

**Step 2: Test avatar display**

1. After login, verify avatar appears in sidebar
2. If you have a Gravatar, check the response includes both Google and Gravatar images

**Step 3: Test set primary API**

1. Call POST /api/profile-images/:imageId/primary
2. Refresh and verify new primary is used

---

## Summary

This plan implements:

1. **OAuth Scope Update** - Added `contacts.other.readonly` for Google People API access
2. **Database Schema** - New `profile_images` table with source tracking
3. **Profile Image Service** - Core CRUD, Gravatar hashing, image download/processing
4. **Auth Integration** - Fetch Google + Gravatar avatars on login
5. **Contacts Enrichment** - Cross-reference Google contacts to enrich other users
6. **API Routes** - New `/api/profile-images` endpoints for managing images
7. **Frontend Updates** - Updated types and Sidebar to use profileImages array
8. **Migration** - Existing avatar_url data migrated to new structure

All images are stored locally using Sharp (same as contact photos), with multiple size variants. The system stores ALL images from all sources, not using Gravatar as fallback.

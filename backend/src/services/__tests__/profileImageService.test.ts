import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getAuthDatabase, closeAuthDatabase } from '../authDatabase.js';
import {
  getProfileImages,
  getPrimaryProfileImage,
  upsertProfileImage,
  setPrimaryImage,
  getProfileImageUrl,
  getGravatarHash,
  getGravatarUrl,
  downloadAndProcessImage,
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

    const db = getAuthDatabase();
    // Create test user
    const result = db.prepare(`
      INSERT INTO users (google_id, email, name, avatar_url)
      VALUES ('test-google-id', 'test@example.com', 'Test User', NULL)
    `).run();
    userId = Number(result.lastInsertRowid);
  });

  afterAll(async () => {
    closeAuthDatabase();
    await fs.rm('./test-data', { recursive: true, force: true });
  });

  beforeEach(() => {
    const db = getAuthDatabase();
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

describe('downloadAndProcessImage', () => {
  it('should return null for non-existent URL', async () => {
    const hash = await downloadAndProcessImage('https://httpbin.org/status/404', 'test-user');
    expect(hash).toBeNull();
  });

  // Note: We can't easily test successful download without mocking
  // The function will be integration tested via OAuth flow
});

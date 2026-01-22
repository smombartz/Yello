import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { processPhoto, getPhotoUrl } from '../photoProcessor.js';
import fs from 'fs/promises';
import path from 'path';

const TEST_PHOTOS_PATH = './test-data/photos';

// 1x1 red pixel JPEG as base64
const TINY_JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEQT8AVYCf/9k=';

describe('photoProcessor', () => {
  beforeAll(async () => {
    process.env.PHOTOS_PATH = TEST_PHOTOS_PATH;
    await fs.mkdir(TEST_PHOTOS_PATH, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_PHOTOS_PATH, { recursive: true, force: true });
  });

  it('should process photo and return hash', async () => {
    const hash = await processPhoto(TINY_JPEG, 123);
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it('should create all size variants', async () => {
    const hash = await processPhoto(TINY_JPEG, 456);
    const sizes = ['thumbnail', 'small', 'medium', 'large'];

    for (const size of sizes) {
      const filePath = path.join(TEST_PHOTOS_PATH, size, hash.slice(0, 2), `${hash}.jpg`);
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }
  });

  it('should generate correct photo URL', () => {
    const url = getPhotoUrl('abc123def456', 'thumbnail');
    expect(url).toBe('/photos/thumbnail/ab/abc123def456.jpg');
  });
});

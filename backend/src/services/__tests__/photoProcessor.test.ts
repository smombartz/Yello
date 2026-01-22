import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { processPhoto, getPhotoUrl } from '../photoProcessor.js';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const TEST_PHOTOS_PATH = './test-data/photos';

// Generate a valid test image using Sharp
async function createTestImage(): Promise<string> {
  const buffer = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  })
    .jpeg()
    .toBuffer();
  return buffer.toString('base64');
}

let testImageBase64: string;

describe('photoProcessor', () => {
  beforeAll(async () => {
    process.env.PHOTOS_PATH = TEST_PHOTOS_PATH;
    await fs.mkdir(TEST_PHOTOS_PATH, { recursive: true });
    testImageBase64 = await createTestImage();
  });

  afterAll(async () => {
    await fs.rm(TEST_PHOTOS_PATH, { recursive: true, force: true });
  });

  it('should process photo and return hash', async () => {
    const hash = await processPhoto(testImageBase64, 123);
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it('should create all size variants', async () => {
    const hash = await processPhoto(testImageBase64, 456);
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

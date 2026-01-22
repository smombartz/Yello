import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const SIZES = [
  { name: 'thumbnail', width: 48, height: 48, quality: 80 },
  { name: 'small', width: 96, height: 96, quality: 82 },
  { name: 'medium', width: 200, height: 200, quality: 85 },
  { name: 'large', width: 400, height: 400, quality: 88 }
] as const;

function getPhotosPath(): string {
  return process.env.PHOTOS_PATH || './data/photos';
}

export async function processPhoto(base64Data: string, contactId: number): Promise<string> {
  const buffer = Buffer.from(base64Data, 'base64');
  const hash = crypto.createHash('md5').update(contactId.toString()).digest('hex');
  const prefix = hash.substring(0, 2);
  const photosPath = getPhotosPath();

  for (const size of SIZES) {
    const dirPath = path.join(photosPath, size.name, prefix);
    await fs.mkdir(dirPath, { recursive: true });

    await sharp(buffer)
      .rotate()
      .resize(size.width, size.height, {
        fit: 'cover',
        position: 'attention'
      })
      .jpeg({
        quality: size.quality,
        mozjpeg: true,
        progressive: true
      })
      .toFile(path.join(dirPath, `${hash}.jpg`));
  }

  return hash;
}

export function getPhotoUrl(
  hash: string | null,
  size: 'thumbnail' | 'small' | 'medium' | 'large' = 'thumbnail'
): string | null {
  if (!hash) return null;
  const prefix = hash.substring(0, 2);
  return `/photos/${size}/${prefix}/${hash}.jpg`;
}

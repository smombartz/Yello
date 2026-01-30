import { getDatabase } from './database.js';
import crypto from 'crypto';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

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

export function getGravatarHash(email: string): string {
  const normalized = email.trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function getGravatarUrl(email: string): string {
  const hash = getGravatarHash(email);
  return `https://gravatar.com/avatar/${hash}?d=404`;
}

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

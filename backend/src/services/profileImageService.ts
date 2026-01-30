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

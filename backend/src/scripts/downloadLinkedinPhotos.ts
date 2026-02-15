/**
 * One-time script to download LinkedIn photos for enriched contacts
 * that don't yet have a contact_photos entry with source='linkedin'.
 *
 * Run with: cd backend && npx tsx src/scripts/downloadLinkedinPhotos.ts
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || './data/contacts.db';
const photosPath = process.env.PHOTOS_PATH || './data/photos';

console.log(`Opening database at: ${path.resolve(dbPath)}`);
console.log(`Photos path: ${path.resolve(photosPath)}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ensure contact_photos table exists
const tableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='contact_photos'
`).get();

if (!tableExists) {
  console.log('Creating contact_photos table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('vcard', 'google', 'gravatar', 'linkedin')),
      original_url TEXT,
      local_hash TEXT,
      is_primary INTEGER DEFAULT 0,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_contact_photos_contact_id ON contact_photos(contact_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_photos_contact_source ON contact_photos(contact_id, source);
  `);
}

// Find enriched contacts with a LinkedIn photo URL but no contact_photos entry
const contacts = db.prepare(`
  SELECT le.contact_id, le.photo_linkedin, c.display_name, c.photo_hash
  FROM linkedin_enrichment le
  JOIN contacts c ON c.id = le.contact_id
  WHERE le.photo_linkedin IS NOT NULL
    AND le.photo_linkedin != ''
    AND NOT EXISTS (
      SELECT 1 FROM contact_photos cp
      WHERE cp.contact_id = le.contact_id AND cp.source = 'linkedin'
    )
  ORDER BY le.contact_id
`).all() as Array<{
  contact_id: number;
  photo_linkedin: string;
  display_name: string;
  photo_hash: string | null;
}>;

console.log(`Found ${contacts.length} contacts with LinkedIn photos to download\n`);

if (contacts.length === 0) {
  console.log('Nothing to do.');
  db.close();
  process.exit(0);
}

const SIZES = [
  { name: 'thumbnail', width: 48, height: 48, quality: 80 },
  { name: 'small', width: 96, height: 96, quality: 82 },
  { name: 'medium', width: 200, height: 200, quality: 85 },
  { name: 'large', width: 400, height: 400, quality: 88 },
] as const;

async function downloadAndProcess(imageUrl: string, identifier: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: { 'User-Agent': 'ElloCRM/1.0' },
    });

    if (!response.ok) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const hash = crypto.createHash('md5').update(identifier).digest('hex');
    const prefix = hash.substring(0, 2);

    for (const size of SIZES) {
      const dirPath = path.join(photosPath, size.name, prefix);
      await fs.mkdir(dirPath, { recursive: true });

      await sharp(buffer)
        .rotate()
        .resize(size.width, size.height, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: size.quality, mozjpeg: true, progressive: true })
        .toFile(path.join(dirPath, `${hash}.jpg`));
    }

    return hash;
  } catch {
    return null;
  }
}

let downloaded = 0;
let failed = 0;
let skipped = 0;

for (const contact of contacts) {
  const { contact_id, photo_linkedin, display_name, photo_hash } = contact;

  process.stdout.write(`  [${downloaded + failed + skipped + 1}/${contacts.length}] ${display_name}... `);

  const hash = await downloadAndProcess(photo_linkedin, `linkedin-contact-${contact_id}`);

  if (!hash) {
    console.log('FAILED');
    failed++;
    continue;
  }

  // Upsert into contact_photos
  const isPrimary = photo_hash === null ? 1 : (photo_hash === hash ? 1 : 0);
  db.prepare(`
    INSERT INTO contact_photos (contact_id, source, original_url, local_hash, is_primary)
    VALUES (?, 'linkedin', ?, ?, ?)
    ON CONFLICT(contact_id, source) DO UPDATE SET
      original_url = excluded.original_url,
      local_hash = excluded.local_hash,
      fetched_at = CURRENT_TIMESTAMP
  `).run(contact_id, photo_linkedin, hash, isPrimary);

  // If contact has no photo, set this as primary
  if (!photo_hash) {
    db.prepare(`UPDATE contacts SET photo_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, contact_id);
    console.log(`OK (set as primary)`);
  } else {
    console.log(`OK`);
  }

  downloaded++;
}

console.log(`\n=== Complete ===`);
console.log(`  Downloaded: ${downloaded}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total: ${contacts.length}`);

db.close();

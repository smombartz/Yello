import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { Database as DatabaseType } from 'better-sqlite3';
import { ARCHIVE_CONTACT_ID_PROPERTY } from './vcardParser.js';

/**
 * One-time retirement of contacts.raw_vcard. Every property of an imported
 * card is now modeled in the database (see docs/database.md, "vCard
 * coverage"), so the stored originals are no longer read. They are still the
 * only record of what a contact looked like before edits and cleanups, so
 * they are written to a gzipped VCF in the user's archive directory first,
 * and the column is dropped only once that file has been read back and
 * verified. If anything about the archive fails, the database is left as it was.
 */
export function retireRawVcards(db: DatabaseType, archiveDir: string): void {
  const settings = db.prepare(
    'SELECT raw_vcards_archived_at FROM user_settings WHERE id = 1'
  ).get() as { raw_vcards_archived_at: string | null } | undefined;
  if (settings?.raw_vcards_archived_at) return;

  if (hasRawVcardColumn(db)) {
    const cards = db.prepare(`
      SELECT id, raw_vcard FROM contacts
      WHERE raw_vcard IS NOT NULL AND raw_vcard != ''
      ORDER BY id
    `).all() as Array<{ id: number; raw_vcard: string }>;

    if (cards.length > 0 && !writeVerifiedArchive(cards, archiveDir)) return;

    try {
      db.transaction(() => {
        db.exec('UPDATE contacts SET raw_vcard = NULL');
        db.exec('ALTER TABLE contacts DROP COLUMN raw_vcard');
      })();
    } catch (error) {
      // Rolled back: the column stays, and the next open tries again
      console.error('[raw_vcard] dropping the column failed; left in place:', error);
      return;
    }
  }

  db.prepare(`UPDATE user_settings SET raw_vcards_archived_at = datetime('now') WHERE id = 1`).run();
  try {
    // The originals were most of the file; give the space back
    db.exec('VACUUM');
  } catch (error) {
    console.error('[raw_vcard] VACUUM failed; space is reclaimed on a later VACUUM:', error);
  }
}

export function hasRawVcardColumn(db: DatabaseType): boolean {
  return (db.prepare('PRAGMA table_info(contacts)').all() as Array<{ name: string }>)
    .some(column => column.name === 'raw_vcard');
}

/**
 * Writes the cards to `original-cards-<date>.vcf.gz`, each tagged with its
 * contact id, and reads the file back to check every card arrived. The file
 * is written under a temporary name and renamed, so a crash never leaves a
 * truncated archive under the real name. Returns false (and logs) on failure.
 */
function writeVerifiedArchive(cards: Array<{ id: number; raw_vcard: string }>, archiveDir: string): boolean {
  const date = new Date().toISOString().slice(0, 10);
  let archivePath = path.join(archiveDir, `original-cards-${date}.vcf.gz`);
  for (let n = 2; fs.existsSync(archivePath); n++) {
    archivePath = path.join(archiveDir, `original-cards-${date}-${n}.vcf.gz`);
  }
  const tempPath = `${archivePath}.tmp`;

  try {
    fs.mkdirSync(archiveDir, { recursive: true });

    const text = cards
      .map(card => card.raw_vcard.trim().replace(/^BEGIN:VCARD\r?\n/i, `BEGIN:VCARD\r\n${ARCHIVE_CONTACT_ID_PROPERTY}:${card.id}\r\n`))
      .join('\r\n') + '\r\n';
    const fd = fs.openSync(tempPath, 'w');
    try {
      fs.writeSync(fd, zlib.gzipSync(text));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    const readBack = zlib.gunzipSync(fs.readFileSync(tempPath)).toString('utf-8');
    const ids = [...readBack.matchAll(/^X-YELLO-CONTACT-ID:(\d+)\r?$/gm)].map(match => Number(match[1]));
    const begins = readBack.match(/^BEGIN:VCARD\r?$/gim)?.length ?? 0;
    if (readBack !== text || begins !== cards.length || ids.length !== cards.length) {
      throw new Error(`archive holds ${begins} cards and ${ids.length} ids, expected ${cards.length}`);
    }

    fs.renameSync(tempPath, archivePath);
    console.log(`[raw_vcard] archived ${cards.length} original cards to ${archivePath}`);
    return true;
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch { /* nothing was written */ }
    console.error('[raw_vcard] archive failed; raw_vcard left in place:', error);
    return false;
  }
}

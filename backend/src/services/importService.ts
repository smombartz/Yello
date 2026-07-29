import fs from 'fs';
import readline from 'readline';
import { rebuildContactSearch } from './database.js';
import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import { parseSingleVcard, unfoldLines, type ParsedContact } from './vcardParser.js';
import { processPhoto } from './photoProcessor.js';
import { getUserDatabase } from './userDatabase.js';
import {
  getImportJob,
  startJob,
  updateJobProgress,
  completeJob,
  failJob,
  type ImportJobResult
} from './importJobService.js';

/**
 * Cards per database transaction. better-sqlite3 is synchronous, so a batch
 * blocks the event loop for as long as it takes to commit — 50 keeps that in
 * the low-milliseconds range while still amortising the fsync that used to
 * happen on every single INSERT.
 */
const BATCH_SIZE = 50;

/** A malformed 37 MB file could otherwise produce a multi-megabyte JSON blob. */
const MAX_STORED_ERRORS = 100;

interface RunningTotals {
  cardsProcessed: number;
  imported: number;
  skipped: number;
  failed: number;
  photosProcessed: number;
}

interface PendingPhoto {
  contactId: number;
  photoBase64: string;
}

/**
 * Yields to the event loop so the server keeps answering requests during a
 * long import.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Streams a VCF file and yields one raw vCard block at a time. Nothing larger
 * than a single card is ever held in memory, so peak usage is independent of
 * file size.
 */
async function* streamVcardBlocks(filePath: string): AsyncGenerator<string> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let current: string[] | null = null;

  try {
    for await (const line of lines) {
      if (/^BEGIN:VCARD/i.test(line)) {
        // A missing END:VCARD would otherwise swallow the following card.
        current = [line];
        continue;
      }

      if (current === null) continue;
      current.push(line);

      if (/^END:VCARD/i.test(line)) {
        yield current.join('\n');
        current = null;
      }
    }
  } finally {
    lines.close();
    stream.destroy();
  }
}

/**
 * Cheap first pass so the UI has an accurate denominator from the start.
 */
async function countVcards(filePath: string): Promise<number> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let count = 0;
  try {
    for await (const line of lines) {
      if (/^BEGIN:VCARD/i.test(line)) count++;
    }
  } finally {
    lines.close();
    stream.destroy();
  }

  return count;
}

type ImportStatement = Statement<unknown[]>;

interface ImportStatements {
  findByUid: ImportStatement;
  insertContact: ImportStatement;
  insertEmail: ImportStatement;
  insertPhone: ImportStatement;
  insertAddress: ImportStatement;
  insertCategory: ImportStatement;
  insertInstantMessage: ImportStatement;
  insertUrl: ImportStatement;
  insertRelatedPerson: ImportStatement;
  insertSocialProfile: ImportStatement;
  setPhotoHash: ImportStatement;
  upsertContactPhoto: ImportStatement;
}

/**
 * Prepared once per batch rather than once per job: the LRU cache in
 * getUserDatabase can close a handle out from under a long-running job, so the
 * worker re-acquires the database (and therefore its statements) each batch.
 */
function prepareStatements(db: DatabaseType): ImportStatements {
  return {
    findByUid: db.prepare('SELECT id FROM contacts WHERE icloud_uid = ? LIMIT 1'),

    insertContact: db.prepare(`
      INSERT INTO contacts (first_name, last_name, display_name, company, title, notes, birthday, photo_hash, raw_vcard, icloud_uid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    insertEmail: db.prepare(`
      INSERT INTO contact_emails (contact_id, email, type, is_primary) VALUES (?, ?, ?, ?)
    `),

    insertPhone: db.prepare(`
      INSERT INTO contact_phones (contact_id, phone, phone_display, country_code, type, is_primary) VALUES (?, ?, ?, ?, ?, ?)
    `),

    insertAddress: db.prepare(`
      INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),

    insertCategory: db.prepare(`
      INSERT INTO contact_categories (contact_id, category) VALUES (?, ?)
    `),

    insertInstantMessage: db.prepare(`
      INSERT INTO contact_instant_messages (contact_id, service, handle, type) VALUES (?, ?, ?, ?)
    `),

    insertUrl: db.prepare(`
      INSERT INTO contact_urls (contact_id, url, label, type) VALUES (?, ?, ?, ?)
    `),

    insertRelatedPerson: db.prepare(`
      INSERT INTO contact_related_people (contact_id, name, relationship) VALUES (?, ?, ?)
    `),

    insertSocialProfile: db.prepare(`
      INSERT INTO contact_social_profiles (contact_id, platform, username, profile_url, type)
      VALUES (?, ?, ?, ?, ?)
    `),

    setPhotoHash: db.prepare('UPDATE contacts SET photo_hash = ? WHERE id = ?'),

    upsertContactPhoto: db.prepare(`
      INSERT INTO contact_photos (contact_id, source, local_hash, is_primary)
      VALUES (?, 'vcard', ?, 1)
      ON CONFLICT(contact_id, source) DO UPDATE SET
        local_hash = excluded.local_hash,
        fetched_at = CURRENT_TIMESTAMP
    `)
  };
}

/**
 * Inserts one contact and all of its child rows. Must be called inside a
 * transaction; returns the new contact id, or null if the card was skipped as
 * a duplicate.
 */
function insertContact(stmts: ImportStatements, db: DatabaseType, contact: ParsedContact): number | null {
  // Stable-identifier dedupe: a re-import of the same export is a no-op for
  // any card carrying a UID we have already seen.
  if (contact.uid) {
    const existing = stmts.findByUid.get(contact.uid) as { id: number } | undefined;
    if (existing) return null;
  }

  const result = stmts.insertContact.run(
    contact.firstName,
    contact.lastName,
    contact.displayName,
    contact.company,
    contact.title,
    contact.notes,
    contact.birthday,
    null,
    contact.rawVcard,
    contact.uid
  );
  const contactId = result.lastInsertRowid as number;

  for (const email of contact.emails) {
    stmts.insertEmail.run(contactId, email.email, email.type, email.isPrimary ? 1 : 0);
  }

  for (const phone of contact.phones) {
    stmts.insertPhone.run(contactId, phone.phone, phone.phoneDisplay, phone.countryCode, phone.type, phone.isPrimary ? 1 : 0);
  }

  for (const addr of contact.addresses) {
    stmts.insertAddress.run(contactId, addr.street, addr.city, addr.state, addr.postalCode, addr.country, addr.type);
  }

  for (const category of contact.categories) {
    stmts.insertCategory.run(contactId, category);
  }

  for (const im of contact.instantMessages) {
    stmts.insertInstantMessage.run(contactId, im.service, im.handle, im.type);
  }

  for (const url of contact.urls) {
    stmts.insertUrl.run(contactId, url.url, url.label, url.type);
  }

  for (const person of contact.relatedPeople) {
    stmts.insertRelatedPerson.run(contactId, person.name, person.relationship);
  }

  for (const profile of contact.socialProfiles) {
    // Extract username from URL if not provided
    let username = profile.username;
    if (!username && profile.url) {
      const urlMatch = profile.url.match(/\/([^/]+)\/?$/);
      username = urlMatch ? urlMatch[1] : profile.platform;
    }
    username = username || profile.platform;

    stmts.insertSocialProfile.run(contactId, profile.platform, username, profile.url, null);
  }

  rebuildContactSearch(db, contactId);

  return contactId;
}

/**
 * Commits one batch. Photo processing is deliberately sandwiched between two
 * transactions: processPhoto is async (sharp) and hashes on the contact id, so
 * it can neither run inside a synchronous better-sqlite3 transaction nor
 * before the insert that assigns the id.
 */
async function processBatch(
  userId: number,
  blocks: Array<{ index: number; raw: string }>,
  totals: RunningTotals,
  errors: Array<{ line: number; reason: string }>
): Promise<void> {
  const parsed: Array<{ index: number; contact: ParsedContact }> = [];

  for (const block of blocks) {
    try {
      const contact = parseSingleVcard(unfoldLines(block.raw));
      if (contact) {
        parsed.push({ index: block.index, contact });
      } else {
        totals.failed++;
        if (errors.length < MAX_STORED_ERRORS) {
          errors.push({ line: block.index, reason: 'Card produced no contact' });
        }
      }
    } catch (e) {
      totals.failed++;
      if (errors.length < MAX_STORED_ERRORS) {
        errors.push({ line: block.index, reason: e instanceof Error ? e.message : 'Unknown parsing error' });
      }
    }
  }

  const db = getUserDatabase(userId);
  const stmts = prepareStatements(db);
  const pendingPhotos: PendingPhoto[] = [];

  // Transaction A — contacts and all child rows.
  db.transaction(() => {
    for (const { index, contact } of parsed) {
      try {
        const contactId = insertContact(stmts, db, contact);

        if (contactId === null) {
          totals.skipped++;
          continue;
        }

        totals.imported++;
        if (contact.photoBase64) {
          pendingPhotos.push({ contactId, photoBase64: contact.photoBase64 });
        }
      } catch (e) {
        totals.failed++;
        if (errors.length < MAX_STORED_ERRORS) {
          errors.push({ line: index, reason: e instanceof Error ? e.message : 'Unknown error' });
        }
      }
    }
  })();

  // Photos — async, outside any transaction.
  const processed: Array<{ contactId: number; hash: string }> = [];
  for (const photo of pendingPhotos) {
    try {
      const hash = await processPhoto(photo.photoBase64, photo.contactId, userId);
      processed.push({ contactId: photo.contactId, hash });
    } catch {
      /* skip photo on error — the contact itself is already committed */
    }
  }

  // Transaction B — attach the processed photo hashes.
  if (processed.length > 0) {
    const photoDb = getUserDatabase(userId);
    const photoStmts = prepareStatements(photoDb);

    photoDb.transaction(() => {
      for (const { contactId, hash } of processed) {
        photoStmts.setPhotoHash.run(hash, contactId);
        photoStmts.upsertContactPhoto.run(contactId, hash);
        totals.photosProcessed++;
      }
    })();
  }
}

/**
 * Runs a staged VCF import to completion. Safe to call on a job that was
 * interrupted mid-flight: batches commit atomically and cards_processed is
 * written only after a commit, so resuming at that offset can neither drop nor
 * duplicate a card.
 */
export async function runVcfImportJob(userId: number, jobId: string): Promise<ImportJobResult> {
  const job = getImportJob(getUserDatabase(userId), jobId);

  if (!job) {
    throw new Error(`Import job ${jobId} not found`);
  }
  if (!job.filePath) {
    throw new Error(`Import job ${jobId} has no staged file`);
  }

  const filePath = job.filePath;

  try {
    const totalCards = job.totalCards > 0 ? job.totalCards : await countVcards(filePath);
    startJob(getUserDatabase(userId), jobId, totalCards);

    const resumeFrom = job.cardsProcessed;
    const totals: RunningTotals = {
      cardsProcessed: job.cardsProcessed,
      imported: job.importedCount,
      skipped: job.skippedCount,
      failed: job.failedCount,
      photosProcessed: job.photosProcessed
    };
    const errors: Array<{ line: number; reason: string }> = job.result?.errors ?? [];

    let cardIndex = 0;
    let batch: Array<{ index: number; raw: string }> = [];

    const flush = async (): Promise<void> => {
      if (batch.length === 0) return;

      await processBatch(userId, batch, totals, errors);
      totals.cardsProcessed += batch.length;
      batch = [];

      updateJobProgress(getUserDatabase(userId), jobId, {
        cardsProcessed: totals.cardsProcessed,
        importedCount: totals.imported,
        skippedCount: totals.skipped,
        failedCount: totals.failed,
        photosProcessed: totals.photosProcessed
      });

      await yieldToEventLoop();
    };

    for await (const raw of streamVcardBlocks(filePath)) {
      cardIndex++;
      if (cardIndex <= resumeFrom) continue;

      batch.push({ index: cardIndex, raw });
      if (batch.length >= BATCH_SIZE) {
        await flush();
      }
    }

    await flush();

    const result: ImportJobResult = {
      imported: totals.imported,
      skipped: totals.skipped,
      failed: totals.failed,
      photosProcessed: totals.photosProcessed,
      errors
    };

    completeJob(getUserDatabase(userId), jobId, result);

    // The staged upload is only needed for resume; drop it once we are done.
    await fs.promises.unlink(filePath).catch(() => { /* already gone */ });

    return result;
  } catch (error) {
    // Leave the staged file in place so a failed import can be investigated.
    const message = error instanceof Error ? error.message : 'Unknown error';
    failJob(getUserDatabase(userId), jobId, message);
    throw error;
  }
}

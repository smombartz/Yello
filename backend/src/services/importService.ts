import fs from 'fs';
import readline from 'readline';
import { isGroupVcard, parseSingleVcard, unfoldLines, type ParsedContact } from './vcardParser.js';
import { processPhoto } from './photoProcessor.js';
import { getUserDatabase } from './userDatabase.js';
import { insertParsedContact, prepareContactStatements } from './contactPersistence.js';
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
  addressesGeotagged: number;
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
    if (isGroupVcard(block.raw)) {
      totals.skipped++;
      continue;
    }
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
  const stmts = prepareContactStatements(db);
  const pendingPhotos: PendingPhoto[] = [];

  // Transaction A — contacts and all child rows.
  db.transaction(() => {
    for (const { index, contact } of parsed) {
      try {
        const inserted = insertParsedContact(stmts, db, contact);

        if (inserted === null) {
          totals.skipped++;
          continue;
        }

        totals.imported++;
        totals.addressesGeotagged += inserted.addressesGeotagged;
        if (contact.photoBase64) {
          pendingPhotos.push({ contactId: inserted.contactId, photoBase64: contact.photoBase64 });
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
    const photoStmts = prepareContactStatements(photoDb);

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
      photosProcessed: job.photosProcessed,
      addressesGeotagged: job.addressesGeotagged
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
        photosProcessed: totals.photosProcessed,
        addressesGeotagged: totals.addressesGeotagged
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
      addressesGeotagged: totals.addressesGeotagged,
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

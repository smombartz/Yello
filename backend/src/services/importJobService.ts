import crypto from 'crypto';
import type { Database as DatabaseType } from 'better-sqlite3';

export type ImportJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ImportJob {
  id: string;
  kind: string;
  status: ImportJobStatus;
  filename: string | null;
  filePath: string | null;
  fileSize: number | null;
  totalCards: number;
  cardsProcessed: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  photosProcessed: number;
  result: ImportJobResult | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
}

export interface ImportJobResult {
  imported: number;
  skipped: number;
  failed: number;
  photosProcessed: number;
  /** Truncated to MAX_STORED_ERRORS — `failed` is the true count. */
  errors: Array<{ line: number; reason: string }>;
}

export interface ImportJobProgress {
  cardsProcessed: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  photosProcessed: number;
}

interface ImportJobRow {
  id: string;
  kind: string;
  status: ImportJobStatus;
  filename: string | null;
  file_path: string | null;
  file_size: number | null;
  total_cards: number | null;
  cards_processed: number | null;
  imported_count: number | null;
  skipped_count: number | null;
  failed_count: number | null;
  photos_processed: number | null;
  result: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

function mapRow(row: ImportJobRow): ImportJob {
  let result: ImportJobResult | null = null;
  if (row.result) {
    try {
      result = JSON.parse(row.result) as ImportJobResult;
    } catch {
      // A malformed result blob should not make the whole job unreadable.
      result = null;
    }
  }

  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    filename: row.filename,
    filePath: row.file_path,
    fileSize: row.file_size,
    totalCards: row.total_cards ?? 0,
    cardsProcessed: row.cards_processed ?? 0,
    importedCount: row.imported_count ?? 0,
    skippedCount: row.skipped_count ?? 0,
    failedCount: row.failed_count ?? 0,
    photosProcessed: row.photos_processed ?? 0,
    result,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at
  };
}

/**
 * `id` may be supplied so the caller can name the staged file after the job it
 * belongs to — the file has to be written before the row exists.
 */
export function createImportJob(
  db: DatabaseType,
  opts: { filename: string | null; filePath: string; fileSize: number; kind?: string; id?: string }
): string {
  const id = opts.id ?? crypto.randomUUID();

  db.prepare(`
    INSERT INTO import_jobs (id, kind, status, filename, file_path, file_size)
    VALUES (?, ?, 'pending', ?, ?, ?)
  `).run(id, opts.kind ?? 'vcf', opts.filename, opts.filePath, opts.fileSize);

  return id;
}

export function getImportJob(db: DatabaseType, id: string): ImportJob | null {
  const row = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(id) as ImportJobRow | undefined;
  return row ? mapRow(row) : null;
}

/**
 * The newest job that has not reached a terminal state. Used both to reject
 * concurrent uploads and to let the UI reconnect after a page reload.
 */
export function getActiveImportJob(db: DatabaseType): ImportJob | null {
  const row = db.prepare(`
    SELECT * FROM import_jobs
    WHERE status IN ('pending', 'running')
    ORDER BY created_at DESC, rowid DESC
    LIMIT 1
  `).get() as ImportJobRow | undefined;

  return row ? mapRow(row) : null;
}

/** Marks the job running and stamps started_at (left alone on a resume). */
export function startJob(db: DatabaseType, id: string, totalCards: number): void {
  db.prepare(`
    UPDATE import_jobs
    SET status = 'running',
        total_cards = ?,
        started_at = COALESCE(started_at, datetime('now'))
    WHERE id = ?
  `).run(totalCards, id);
}

/**
 * Absolute (not incremental) counter write, called once per committed batch.
 * The worker owns the running totals, so a retried batch cannot double-count.
 */
export function updateJobProgress(db: DatabaseType, id: string, progress: ImportJobProgress): void {
  db.prepare(`
    UPDATE import_jobs
    SET cards_processed = ?,
        imported_count = ?,
        skipped_count = ?,
        failed_count = ?,
        photos_processed = ?
    WHERE id = ?
  `).run(
    progress.cardsProcessed,
    progress.importedCount,
    progress.skippedCount,
    progress.failedCount,
    progress.photosProcessed,
    id
  );
}

export function completeJob(db: DatabaseType, id: string, result: ImportJobResult): void {
  db.prepare(`
    UPDATE import_jobs
    SET status = 'completed',
        result = ?,
        completed_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(result), id);
}

export function failJob(db: DatabaseType, id: string, message: string): void {
  db.prepare(`
    UPDATE import_jobs
    SET status = 'failed',
        error_message = ?,
        completed_at = datetime('now')
    WHERE id = ?
  `).run(message, id);
}

/** Jobs left mid-flight by a process restart. */
export function getInterruptedJobs(db: DatabaseType): ImportJob[] {
  const rows = db.prepare(`
    SELECT * FROM import_jobs
    WHERE status IN ('pending', 'running')
    ORDER BY created_at ASC
  `).all() as ImportJobRow[];

  return rows.map(mapRow);
}

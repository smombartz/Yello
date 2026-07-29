import fs from 'fs';
import type { FastifyBaseLogger } from 'fastify';
import { getUserDatabase, listUserIds } from './userDatabase.js';
import { getInterruptedJobs, failJob } from './importJobService.js';
import { runVcfImportJob } from './importService.js';

/**
 * Re-enqueues import jobs that were mid-flight when the process stopped.
 *
 * Railway restarts the container on failure and on every redeploy, which kills
 * the in-process worker. Because each batch commits atomically and
 * cards_processed is written only after a commit, resuming from that offset is
 * exact — no card is dropped or imported twice.
 *
 * There is no cross-user index (each tenant is a separate SQLite file), so the
 * only way to find these jobs is to walk the user data directory.
 */
export function resumeInterruptedImports(log: FastifyBaseLogger): void {
  let userIds: number[];
  try {
    userIds = listUserIds();
  } catch (error) {
    log.error(error, 'Could not enumerate user data directories for import recovery');
    return;
  }

  for (const userId of userIds) {
    try {
      const db = getUserDatabase(userId);
      const jobs = getInterruptedJobs(db);

      for (const job of jobs) {
        if (!job.filePath || !fs.existsSync(job.filePath)) {
          failJob(db, job.id, 'Import was interrupted by a server restart and could not be resumed.');
          log.warn(`Import job ${job.id} (user ${userId}) failed: staged file missing`);
          continue;
        }

        log.info(`Resuming import job ${job.id} (user ${userId}) from card ${job.cardsProcessed}`);

        void runVcfImportJob(userId, job.id).catch((error) => {
          log.error(error, `Resumed import job ${job.id} failed`);
          try {
            failJob(getUserDatabase(userId), job.id, 'Import failed unexpectedly. Please try again.');
          } catch (updateError) {
            log.error(updateError, `Could not mark resumed import job ${job.id} as failed`);
          }
        });
      }
    } catch (error) {
      // One unreadable tenant database must not stop the sweep.
      log.error(error, `Import recovery failed for user ${userId}`);
    }
  }
}

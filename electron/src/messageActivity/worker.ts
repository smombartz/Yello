import { parentPort, workerData } from 'worker_threads';
import { readChannel, type DesktopChannel } from './readers';
import { readWhatsAppFromBackup } from './iphoneBackup';

// Runs one scan off the main process, so reading a large chat.db (or
// unlocking an encrypted iPhone backup, which takes seconds) doesn't freeze
// the window. Posts { result } or { error }.

type Job =
  | { kind: 'mac'; channel: DesktopChannel; sinceDay: string | null }
  | { kind: 'backup'; backupId: string; password: string | null };

const job = workerData as Job;
try {
  const result = job.kind === 'backup'
    ? readWhatsAppFromBackup(job.backupId, job.password)
    : readChannel(job.channel, job.sinceDay);
  parentPort!.postMessage({ result });
} catch (err) {
  parentPort!.postMessage({ error: err instanceof Error ? err.message : String(err) });
}

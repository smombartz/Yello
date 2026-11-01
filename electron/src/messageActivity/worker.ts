import { parentPort, workerData } from 'worker_threads';
import { readChannel, type DesktopChannel } from './readers';

// Runs one scan off the main process, so reading a large chat.db doesn't
// freeze the window. Posts { result } or { error }.

const { channel, sinceDay } = workerData as { channel: DesktopChannel; sinceDay: string | null };
try {
  parentPort!.postMessage({ result: readChannel(channel, sinceDay) });
} catch (err) {
  parentPort!.postMessage({ error: err instanceof Error ? err.message : String(err) });
}

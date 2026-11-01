import { uploadActivity, type ActivityUpload } from '../api/messageHooks';

/**
 * The Yello desktop app reads iMessage and WhatsApp on the Mac and hands
 * this page daily counts per person (electron/src/messageActivity/). In a
 * plain browser `window.yelloDesktop` doesn't exist and these channels
 * show "Available in the Yello desktop app".
 */

export type DesktopChannel = 'imessage' | 'whatsapp';

export interface DesktopReaderStatus {
  /** ready: readable; needs_full_disk_access: macOS blocked it; not_found: app not used on this Mac */
  state: 'ready' | 'needs_full_disk_access' | 'not_found' | 'error';
  error?: string;
}

export interface DesktopScanResult {
  from: string;
  to: string;
  handles: ActivityUpload['handles'];
  activity: ActivityUpload['activity'];
  messages: number;
}

export interface DesktopMessageActivity {
  status(): Promise<Record<DesktopChannel, DesktopReaderStatus>>;
  /** Counts from sinceDay (YYYY-MM-DD) on, or the whole history when null */
  scan(channel: DesktopChannel, sinceDay: string | null): Promise<DesktopScanResult>;
  openFullDiskAccessSettings(): Promise<void>;
  relaunch(): Promise<void>;
}

export function getDesktopMessages(): DesktopMessageActivity | null {
  const bridge = (window as unknown as { yelloDesktop?: { messageActivity?: DesktopMessageActivity } }).yelloDesktop;
  return bridge?.messageActivity ?? null;
}

/** Days re-read before the last covered day, for messages that synced late */
const OVERLAP_DAYS = 2;

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Read one channel on this Mac and upload its counts. With coveredThrough
 * (from the server's sources), only re-reads from a little before it.
 */
export async function syncDesktopChannel(
  channel: DesktopChannel,
  coveredThrough: string | null,
  onProgress?: (label: string) => void,
): Promise<{ messages: number } | null> {
  const desktop = getDesktopMessages();
  if (!desktop) return null;
  onProgress?.('Reading on this Mac…');
  const since = coveredThrough ? shiftDay(coveredThrough, -OVERLAP_DAYS) : null;
  const result = await desktop.scan(channel, since);
  if (!result.activity.length) return { messages: 0 };
  const from = since && since < result.from ? since : result.from;
  await uploadActivity(channel, from, result.to, result.handles, result.activity,
    (done, total) => onProgress?.(`Uploading ${done} of ${total}…`));
  return { messages: result.messages };
}

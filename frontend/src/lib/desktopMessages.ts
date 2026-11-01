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

/** An iPhone backup Finder made on this Mac */
export interface IPhoneBackup {
  id: string;
  deviceName: string;
  /** ISO time the backup was made */
  date: string | null;
  encrypted: boolean;
}

export interface IPhoneBackupList {
  state: 'ready' | 'not_found' | 'needs_full_disk_access' | 'error';
  backups: IPhoneBackup[];
  error?: string;
}

export interface BackupScanResult extends DesktopScanResult {
  backupDay: string | null;
  /** Last day counted: the day before the backup */
  untilDay: string | null;
}

export interface DesktopMessageActivity {
  status(): Promise<Record<DesktopChannel, DesktopReaderStatus>>;
  /** Missing in desktop app builds from before iPhone backup support */
  backups?(): Promise<IPhoneBackupList>;
  scanBackup?(backupId: string, password: string | null): Promise<BackupScanResult>;
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

/** First day a "scan new messages" re-reads, given the last day already imported */
export function incrementalScanStart(coveredThrough: string): string {
  return shiftDay(coveredThrough, -OVERLAP_DAYS);
}

/*
 * Per-Mac settings, kept in localStorage because the reading happens on this
 * Mac: whether to refresh each channel automatically (off until the user
 * turns it on) and when it was last read here.
 */
const AUTO_REFRESH_KEY = 'yello.messages.autoRefresh';
const LAST_SCAN_KEY = 'yello.messages.lastScan';
export const AUTO_REFRESH_EVENT = 'yello:messages-auto-refresh';

function readJson<T extends object>(key: string): Partial<T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<T>;
  } catch {
    return {};
  }
}

export function getAutoRefresh(channel: DesktopChannel): boolean {
  return readJson<Record<DesktopChannel, boolean>>(AUTO_REFRESH_KEY)[channel] === true;
}

export function setAutoRefresh(channel: DesktopChannel, on: boolean): void {
  localStorage.setItem(AUTO_REFRESH_KEY, JSON.stringify({ ...readJson(AUTO_REFRESH_KEY), [channel]: on }));
  window.dispatchEvent(new Event(AUTO_REFRESH_EVENT));
}

/** When this Mac last read the channel (ms), or null */
export function getLastScan(channel: DesktopChannel): number | null {
  return readJson<Record<DesktopChannel, number>>(LAST_SCAN_KEY)[channel] ?? null;
}

function setLastScan(channel: DesktopChannel, at: number): void {
  localStorage.setItem(LAST_SCAN_KEY, JSON.stringify({ ...readJson(LAST_SCAN_KEY), [channel]: at }));
}

/** One read per channel at a time: a click during an automatic refresh joins it */
const inFlight = new Map<DesktopChannel, Promise<{ messages: number } | null>>();

/**
 * Read one channel on this Mac and upload its counts. With coveredThrough
 * (from the server's sources), only re-reads from a little before it, which
 * replaces those days' counts; null reads the whole history.
 */
export function syncDesktopChannel(
  channel: DesktopChannel,
  coveredThrough: string | null,
  onProgress?: (label: string) => void,
): Promise<{ messages: number } | null> {
  const running = inFlight.get(channel);
  if (running) {
    onProgress?.('Already reading on this Mac…');
    return running;
  }
  const job = (async () => {
    const desktop = getDesktopMessages();
    if (!desktop) return null;
    onProgress?.('Reading on this Mac…');
    // A full WhatsApp rescan starts after an imported iPhone backup: the backup has the
    // complete older history, the Mac only what the phone sent over when it was linked
    const backupThrough = channel === 'whatsapp' ? getBackupThrough() : null;
    const since = coveredThrough ? incrementalScanStart(coveredThrough) : backupThrough ? shiftDay(backupThrough, 1) : null;
    const result = await desktop.scan(channel, since);
    if (result.activity.length) {
      const from = since && since < result.from ? since : result.from;
      await uploadActivity(channel, from, result.to, result.handles, result.activity,
        (done, total) => onProgress?.(`Uploading ${done} of ${total}…`));
    }
    setLastScan(channel, Date.now());
    return { messages: result.messages };
  })();
  inFlight.set(channel, job);
  return job.finally(() => inFlight.delete(channel));
}

/* --- WhatsApp's older history from an iPhone backup --- */

const BACKUP_THROUGH_KEY = 'yello.messages.whatsappBackupThrough';

/** Last day an imported iPhone backup covers (this Mac), or null */
export function getBackupThrough(): string | null {
  return localStorage.getItem(BACKUP_THROUGH_KEY);
}

/** The error codes the desktop app sends back, in words */
export function backupErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('wrong_password')) return 'That password doesn’t unlock this backup. It’s the one you set for encrypted backups in Finder.';
  if (message.includes('password_required')) return 'This backup is encrypted. Enter its password.';
  if (message.includes('no_whatsapp')) return 'This backup has no WhatsApp data.';
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

/**
 * Read WhatsApp's full history from an iPhone backup and upload the counts,
 * through the day before the backup was made. Those days are replaced with
 * the backup's counts, which are complete; the Mac's own scans cover the rest.
 */
export async function importWhatsAppBackup(
  backupId: string,
  password: string | null,
  onProgress?: (label: string) => void,
): Promise<{ messages: number; untilDay: string | null }> {
  const desktop = getDesktopMessages();
  if (!desktop?.scanBackup) throw new Error('Update the Yello desktop app to read iPhone backups.');
  onProgress?.(password ? 'Unlocking the backup (this takes a few seconds)…' : 'Reading the backup…');
  const result = await desktop.scanBackup(backupId, password);
  if (result.activity.length) {
    const to = result.untilDay && result.untilDay > result.to ? result.untilDay : result.to;
    await uploadActivity('whatsapp', result.from, to, result.handles, result.activity,
      (done, total) => onProgress?.(`Uploading ${done} of ${total}…`));
  }
  if (result.untilDay) localStorage.setItem(BACKUP_THROUGH_KEY, result.untilDay);
  return { messages: result.messages, untilDay: result.untilDay };
}

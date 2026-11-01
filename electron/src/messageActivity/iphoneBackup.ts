import { createDecipheriv, pbkdf2Sync } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parsePlist, unarchive, type PlistValue } from './plist';
import { localDay, readWhatsApp, type ScanResult } from './readers';

// Top contacts: WhatsApp's full history from an iPhone backup that Finder
// made on this Mac. WhatsApp on the Mac only has what the phone sent over when
// it was linked; the phone's own database (same layout) has everything.
//
// Backup layout: Manifest.db maps (domain, relativePath) to a fileID, stored
// at <backup>/<fileID[0:2]>/<fileID>. Encrypted backups encrypt Manifest.db
// and every file; their keys unlock with the backup password (never stored).
// Like the Mac databases, the backup folder needs Full Disk Access.

export const BACKUP_ROOT = path.join(os.homedir(), 'Library', 'Application Support', 'MobileSync', 'Backup');
const WHATSAPP_DOMAIN = 'AppDomainGroup-group.net.whatsapp.WhatsApp.shared';
const WHATSAPP_FILES = ['ChatStorage.sqlite', 'ChatStorage.sqlite-wal'];
export const BACKUP_ID_RE = /^[A-Za-z0-9-]+$/;

/** Error codes the page turns into words */
export class BackupError extends Error {}

export interface BackupInfo {
  /** Folder name inside the backup root */
  id: string;
  deviceName: string;
  /** When the backup was made (ISO) */
  date: string | null;
  encrypted: boolean;
  /** Whether it holds WhatsApp's database; null when encrypted (known only once unlocked) */
  hasWhatsApp: boolean | null;
  /** Where it is, with ~ for the home folder */
  location: string;
}

/** Whether an unencrypted backup's file list includes WhatsApp's database */
function backupHasWhatsApp(dir: string): boolean | null {
  try {
    const db = new DatabaseSync(path.join(dir, 'Manifest.db'), { readOnly: true });
    try {
      return !!db.prepare('SELECT 1 FROM Files WHERE domain = ? AND relativePath = ? LIMIT 1').get(WHATSAPP_DOMAIN, 'ChatStorage.sqlite');
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

function readPlistFile(file: string): { [key: string]: PlistValue } {
  return parsePlist(fs.readFileSync(file)) as { [key: string]: PlistValue };
}

function asDate(v: PlistValue | undefined): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return new Date(v);
  return null;
}

/** iPhone (and iPad) backups on this Mac, newest first. Throws EPERM without Full Disk Access. */
export function listBackups(root = BACKUP_ROOT): BackupInfo[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: BackupInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !BACKUP_ID_RE.test(entry.name)) continue;
    const dir = path.join(root, entry.name);
    try {
      const manifest = readPlistFile(path.join(dir, 'Manifest.plist'));
      let info: { [key: string]: PlistValue } = {};
      try { info = readPlistFile(path.join(dir, 'Info.plist')); } catch { /* optional */ }
      const lockdown = (manifest.Lockdown ?? {}) as { [key: string]: PlistValue };
      const date = asDate(info['Last Backup Date']) ?? asDate(manifest.Date);
      const encrypted = manifest.IsEncrypted === true;
      out.push({
        id: entry.name,
        deviceName: String(info['Device Name'] ?? lockdown.DeviceName ?? 'iPhone'),
        date: date ? date.toISOString() : null,
        encrypted,
        hasWhatsApp: encrypted ? null : backupHasWhatsApp(dir),
        location: dir.startsWith(os.homedir()) ? `~${dir.slice(os.homedir().length)}` : dir,
      });
    } catch {
      // Not a backup, or one still being written
    }
  }
  return out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

// --- Encrypted backups ------------------------------------------------------

interface ClassKey { clas: number; wrap: number; wpky: Buffer | null; key: Buffer | null }

const WRAP_PASSCODE = 2;

/** The keybag in Manifest.plist: 4-byte tag, 4-byte length, value. The first UUID is the bag's, later ones start class keys. */
export function parseKeybag(buf: Buffer): { attrs: Map<string, Buffer>; classKeys: ClassKey[] } {
  const attrs = new Map<string, Buffer>();
  const classKeys: ClassKey[] = [];
  let current: Map<string, Buffer> | null = null;
  const finish = () => {
    if (!current) return;
    const clas = current.get('CLAS');
    if (clas) {
      classKeys.push({
        clas: clas.readUInt32BE(0),
        wrap: current.get('WRAP')?.readUInt32BE(0) ?? 0,
        wpky: current.get('WPKY') ?? null,
        key: null,
      });
    }
  };
  let seenUuid = false;
  for (let i = 0; i + 8 <= buf.length;) {
    const tag = buf.toString('latin1', i, i + 4);
    const length = buf.readUInt32BE(i + 4);
    const value = buf.subarray(i + 8, i + 8 + length);
    i += 8 + length;
    if (tag === 'UUID') {
      if (!seenUuid) { seenUuid = true; attrs.set(tag, value); continue; }
      finish();
      current = new Map([[tag, value]]);
      continue;
    }
    (current ?? attrs).set(tag, value);
  }
  finish();
  return { attrs, classKeys };
}

export function aesUnwrap(kek: Buffer, wrapped: Buffer): Buffer {
  const decipher = createDecipheriv('id-aes256-wrap', kek, Buffer.from('A6A6A6A6A6A6A6A6', 'hex'));
  return Buffer.concat([decipher.update(wrapped), decipher.final()]);
}

function aesCbcDecrypt(key: Buffer, data: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-cbc', key, Buffer.alloc(16));
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data.subarray(0, data.length - (data.length % 16))), decipher.final()]);
}

function stripPadding(data: Buffer): Buffer {
  const n = data[data.length - 1];
  if (n < 1 || n > 16 || n > data.length) return data;
  for (let i = data.length - n; i < data.length; i++) if (data[i] !== n) return data;
  return data.subarray(0, data.length - n);
}

/** Unlock the keybag's class keys with the backup password. Throws BackupError('wrong_password'). */
export function unlockKeybag(keybag: Buffer, password: string): Map<number, Buffer> {
  const { attrs, classKeys } = parseKeybag(keybag);
  const salt = attrs.get('SALT');
  const iter = attrs.get('ITER');
  if (!salt || !iter) throw new BackupError('Yello can’t read this backup’s keys.');
  let secret: Buffer = Buffer.from(password, 'utf8');
  // iOS 10.2+ adds a slow PBKDF2-SHA256 round before the SHA-1 one
  const dpsl = attrs.get('DPSL');
  const dpic = attrs.get('DPIC');
  if (dpsl && dpic) secret = pbkdf2Sync(secret, dpsl, dpic.readUInt32BE(0), 32, 'sha256');
  const passcodeKey = pbkdf2Sync(secret, salt, iter.readUInt32BE(0), 32, 'sha1');

  const keys = new Map<number, Buffer>();
  for (const ck of classKeys) {
    if (!ck.wpky || !(ck.wrap & WRAP_PASSCODE)) continue;
    try {
      keys.set(ck.clas, aesUnwrap(passcodeKey, ck.wpky));
    } catch {
      throw new BackupError('wrong_password');
    }
  }
  if (!keys.size) throw new BackupError('wrong_password');
  return keys;
}

/** A key stored as 4-byte little-endian protection class + wrapped key */
function unwrapForClass(keys: Map<number, Buffer>, protectionClass: number, wrapped: Buffer): Buffer {
  const classKey = keys.get(protectionClass);
  if (!classKey) throw new BackupError(`This backup uses a key Yello can’t unlock (class ${protectionClass}).`);
  return aesUnwrap(classKey, wrapped);
}

function decryptFile(keys: Map<number, Buffer>, fileBlob: Buffer, data: Buffer): Buffer {
  const meta = unarchive(parsePlist(fileBlob));
  const encryptionKey = meta.EncryptionKey;
  const keyBytes = Buffer.isBuffer(encryptionKey)
    ? encryptionKey
    : (encryptionKey as { 'NS.data'?: PlistValue } | undefined)?.['NS.data'];
  if (!Buffer.isBuffer(keyBytes)) throw new BackupError('A backup file has no key.');
  const key = unwrapForClass(keys, Number(meta.ProtectionClass), keyBytes.subarray(4));
  const plain = aesCbcDecrypt(key, data);
  // The recorded size is exact; padding is the fallback when there's none
  const size = Number(meta.Size);
  return size > 0 && size <= plain.length ? plain.subarray(0, size) : stripPadding(plain);
}

// --- Reading WhatsApp out of a backup --------------------------------------

function backupFile(dir: string, fileID: string): string {
  const nested = path.join(dir, fileID.slice(0, 2), fileID);
  return fs.existsSync(nested) ? nested : path.join(dir, fileID);
}

export interface BackupScanResult extends ScanResult {
  /** The day the backup was made */
  backupDay: string | null;
  /** Last day counted: the day before the backup */
  untilDay: string | null;
}

/** When the backup was made, as this Mac's local day */
export function backupDay(dir: string): string | null {
  try {
    const info = readPlistFile(path.join(dir, 'Info.plist'));
    const date = asDate(info['Last Backup Date']);
    if (date) return localDay(date.getTime() / 1000);
  } catch { /* fall back to the manifest */ }
  const date = asDate(readPlistFile(path.join(dir, 'Manifest.plist')).Date);
  return date ? localDay(date.getTime() / 1000) : null;
}

function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d - 1, 12).getTime() / 1000);
}

/**
 * Daily WhatsApp counts from an iPhone backup, through the day before the
 * backup was made (the backup day itself is only partly in it). Message text
 * is never read. Throws BackupError: 'password_required', 'wrong_password',
 * 'no_whatsapp', or a readable message.
 */
export function readWhatsAppFromBackup(
  backupId: string, password: string | null, root = BACKUP_ROOT,
): BackupScanResult {
  if (!BACKUP_ID_RE.test(backupId)) throw new BackupError('unknown backup');
  const dir = path.join(root, backupId);
  const manifest = readPlistFile(path.join(dir, 'Manifest.plist'));
  const encrypted = manifest.IsEncrypted === true;
  const madeOn = backupDay(dir);
  const untilDay = madeOn ? previousDay(madeOn) : null;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-backup-'));
  try {
    let keys: Map<number, Buffer> | null = null;
    let manifestDbPath = path.join(dir, 'Manifest.db');
    if (encrypted) {
      if (!password) throw new BackupError('password_required');
      const keybag = manifest.BackupKeyBag;
      const manifestKey = manifest.ManifestKey;
      if (!Buffer.isBuffer(keybag) || !Buffer.isBuffer(manifestKey)) throw new BackupError('Yello can’t read this backup’s keys.');
      keys = unlockKeybag(keybag, password);
      const dbKey = unwrapForClass(keys, manifestKey.readUInt32LE(0), manifestKey.subarray(4));
      manifestDbPath = path.join(tmp, 'Manifest.db');
      const plainManifest = aesCbcDecrypt(dbKey, fs.readFileSync(path.join(dir, 'Manifest.db')));
      // Trim PKCS#7 padding only when what's left is whole SQLite pages
      const trimmed = stripPadding(plainManifest);
      fs.writeFileSync(manifestDbPath, trimmed.length % 512 === 0 ? trimmed : plainManifest);
    }

    const manifestDb = new DatabaseSync(manifestDbPath, { readOnly: true });
    let rows: Array<{ fileID: string; relativePath: string; file: Uint8Array | null }>;
    try {
      rows = manifestDb.prepare(`
        SELECT fileID, relativePath, file FROM Files WHERE domain = ? AND relativePath IN (${WHATSAPP_FILES.map(() => '?').join(', ')})
      `).all(WHATSAPP_DOMAIN, ...WHATSAPP_FILES) as typeof rows;
    } catch {
      throw new BackupError(encrypted ? 'wrong_password' : 'Yello can’t read this backup’s file list.');
    } finally {
      manifestDb.close();
    }
    if (!rows.some(r => r.relativePath === 'ChatStorage.sqlite')) throw new BackupError('no_whatsapp');

    for (const row of rows) {
      let data: Buffer = fs.readFileSync(backupFile(dir, row.fileID));
      if (keys) {
        if (!row.file) throw new BackupError('A backup file has no key.');
        data = decryptFile(keys, Buffer.from(row.file), data);
      }
      fs.writeFileSync(path.join(tmp, row.relativePath), data);
    }

    // Fold the copied write-ahead log into the copy, so it reads like a plain database
    const chatPath = path.join(tmp, 'ChatStorage.sqlite');
    const copy = new DatabaseSync(chatPath);
    try {
      copy.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE;');
    } finally {
      copy.close();
    }
    return { ...readWhatsApp(chatPath, null, untilDay), backupDay: madeOn, untilDay };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'crypto';
import { execFileSync } from 'child_process';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listBackups, readWhatsAppFromBackup } from './iphoneBackup';
import { parsePlist, PlistUid } from './plist';

// Builds small fake iPhone backups in the layout Finder writes (Manifest.plist,
// Info.plist, Manifest.db, files under <id[0:2]>/<id>), plain and encrypted.
// Binary plists come from macOS's own plutil.

const APPLE_EPOCH = 978307200;
const DOMAIN = 'AppDomainGroup-group.net.whatsapp.WhatsApp.shared';
const noon = (day: string) => Math.floor(new Date(`${day}T12:00:00`).getTime() / 1000);

let root: string;
let work: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-backups-'));
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-backup-src-'));
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(work, { recursive: true, force: true });
});

function xmlValue(v: unknown): string {
  if (v instanceof PlistUid) return `<dict><key>CF$UID</key><integer>${v.value}</integer></dict>`;
  if (Buffer.isBuffer(v)) return `<data>${v.toString('base64')}</data>`;
  if (v instanceof Date) return `<date>${v.toISOString().replace(/\.\d+Z$/, 'Z')}</date>`;
  if (typeof v === 'boolean') return v ? '<true/>' : '<false/>';
  if (typeof v === 'number') return `<integer>${v}</integer>`;
  if (typeof v === 'string') return `<string>${v}</string>`;
  if (Array.isArray(v)) return `<array>${v.map(xmlValue).join('')}</array>`;
  return `<dict>${Object.entries(v as object).map(([k, x]) => `<key>${k}</key>${xmlValue(x)}`).join('')}</dict>`;
}

function plist(v: unknown, binary: boolean): Buffer {
  const xml = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">${xmlValue(v)}</plist>\n`);
  if (!binary) return xml;
  const file = path.join(work, `p-${randomBytes(4).toString('hex')}.plist`);
  fs.writeFileSync(file, xml);
  execFileSync('plutil', ['-convert', 'binary1', file]);
  return fs.readFileSync(file);
}

/** A WhatsApp ChatStorage with one chat, part of it still in the write-ahead log */
function chatStorage(): { main: Buffer; wal: Buffer } {
  const file = path.join(work, `chat-${randomBytes(4).toString('hex')}.sqlite`);
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;
    CREATE TABLE ZWACHATSESSION (Z_PK INTEGER PRIMARY KEY, ZCONTACTJID TEXT, ZPARTNERNAME TEXT, ZSESSIONTYPE INTEGER);
    CREATE TABLE ZWAGROUPMEMBER (Z_PK INTEGER PRIMARY KEY, ZCHATSESSION INTEGER, ZMEMBERJID TEXT, ZCONTACTNAME TEXT);
    CREATE TABLE ZWAMESSAGE (Z_PK INTEGER PRIMARY KEY, ZCHATSESSION INTEGER, ZISFROMME INTEGER, ZMESSAGEDATE REAL,
      ZMESSAGETYPE INTEGER, ZGROUPMEMBER INTEGER, ZFROMJID TEXT, ZTEXT TEXT);
    INSERT INTO ZWACHATSESSION VALUES (1, '4915112345678@s.whatsapp.net', 'Ada', 0);
  `);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const m = db.prepare('INSERT INTO ZWAMESSAGE (ZCHATSESSION, ZISFROMME, ZMESSAGEDATE, ZMESSAGETYPE, ZTEXT) VALUES (1, ?, ?, 0, ?)');
  m.run(1, noon('2019-03-01') - APPLE_EPOCH, 'secret');
  m.run(0, noon('2019-03-01') - APPLE_EPOCH, 'secret');
  m.run(0, noon('2021-06-15') - APPLE_EPOCH, 'secret');
  m.run(0, noon('2026-10-31') - APPLE_EPOCH, 'secret'); // the backup day: left out
  // Copy while the connection is open, so the last inserts are only in the WAL
  const main = fs.readFileSync(file);
  const wal = fs.readFileSync(`${file}-wal`);
  db.close();
  return { main, wal };
}

const fileId = (relativePath: string) => createHash('sha1').update(`${DOMAIN}-${relativePath}`).digest('hex');

function manifestDb(file: string, rows: Array<{ relativePath: string; blob: Buffer | null }>): void {
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE Files (fileID TEXT PRIMARY KEY, domain TEXT, relativePath TEXT, flags INTEGER, file BLOB)');
  const insert = db.prepare('INSERT INTO Files VALUES (?, ?, ?, 1, ?)');
  insert.run('aaaa', 'HomeDomain', 'Library/SMS/sms.db', null);
  for (const r of rows) insert.run(fileId(r.relativePath), DOMAIN, r.relativePath, r.blob);
  db.close();
}

function writeBackupFile(dir: string, relativePath: string, data: Buffer): void {
  const id = fileId(relativePath);
  fs.mkdirSync(path.join(dir, id.slice(0, 2)), { recursive: true });
  fs.writeFileSync(path.join(dir, id.slice(0, 2), id), data);
}

function info(dir: string, name: string): void {
  fs.writeFileSync(path.join(dir, 'Info.plist'), plist({ 'Device Name': name, 'Last Backup Date': new Date(noon('2026-10-31') * 1000) }, false));
}

// --- encryption helpers, the way iOS does it --------------------------------

const wrap = (kek: Buffer, key: Buffer) => {
  const c = createCipheriv('id-aes256-wrap', kek, Buffer.from('A6A6A6A6A6A6A6A6', 'hex'));
  return Buffer.concat([c.update(key), c.final()]);
};
const encrypt = (key: Buffer, data: Buffer) => {
  const c = createCipheriv('aes-256-cbc', key, Buffer.alloc(16));
  return Buffer.concat([c.update(data), c.final()]);
};
const tlv = (tag: string, value: Buffer) => {
  const head = Buffer.alloc(8);
  head.write(tag, 0, 'latin1');
  head.writeUInt32BE(value.length, 4);
  return Buffer.concat([head, value]);
};
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };

describe('iPhone backups', () => {
  it('reads WhatsApp from an unencrypted backup, through the day before it was made', () => {
    const dir = path.join(root, 'PLAINBACKUP-0001');
    fs.mkdirSync(dir);
    info(dir, 'Test iPhone');
    fs.writeFileSync(path.join(dir, 'Manifest.plist'), plist({ IsEncrypted: false, Lockdown: { DeviceName: 'Test iPhone' } }, true));
    const { main, wal } = chatStorage();
    manifestDb(path.join(dir, 'Manifest.db'), [{ relativePath: 'ChatStorage.sqlite', blob: null }, { relativePath: 'ChatStorage.sqlite-wal', blob: null }]);
    writeBackupFile(dir, 'ChatStorage.sqlite', main);
    writeBackupFile(dir, 'ChatStorage.sqlite-wal', wal);

    const result = readWhatsAppFromBackup('PLAINBACKUP-0001', null, root);
    expect(result.messages).toBe(3);
    expect(result.from).toBe('2019-03-01');
    expect(result.to).toBe('2021-06-15');
    expect(result.untilDay).toBe('2026-10-30');
    expect(result.activity).toEqual([
      { handle: '4915112345678@s.whatsapp.net', day: '2019-03-01', sent: 1, received: 1, group: 0 },
      { handle: '4915112345678@s.whatsapp.net', day: '2021-06-15', sent: 0, received: 1, group: 0 },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('unlocks an encrypted backup with its password, and says when the password is wrong', () => {
    const dir = path.join(root, 'SECRETBACKUP-0002');
    fs.mkdirSync(dir);
    info(dir, 'Locked iPhone');
    const password = 'correct horse';

    // Keybag: salts and rounds, then one class key wrapped with the passcode key
    const salt = randomBytes(20);
    const dpsl = randomBytes(20);
    const passcodeKey = pbkdf2Sync(pbkdf2Sync(password, dpsl, 10, 32, 'sha256'), salt, 10, 32, 'sha1');
    const classKey = randomBytes(32);
    const keybag = Buffer.concat([
      tlv('VERS', u32(4)), tlv('TYPE', u32(1)), tlv('UUID', randomBytes(16)), tlv('WRAP', u32(0)),
      tlv('SALT', salt), tlv('ITER', u32(10)), tlv('DPWT', u32(1)), tlv('DPIC', u32(10)), tlv('DPSL', dpsl),
      tlv('UUID', randomBytes(16)), tlv('CLAS', u32(3)), tlv('WRAP', u32(2)), tlv('KTYP', u32(0)), tlv('WPKY', wrap(passcodeKey, classKey)),
    ]);

    // Manifest.db, encrypted with a key wrapped by class 3 (4-byte little-endian class first)
    const dbKey = randomBytes(32);
    const manifestKey = Buffer.concat([Buffer.from([3, 0, 0, 0]), wrap(classKey, dbKey)]);
    fs.writeFileSync(path.join(dir, 'Manifest.plist'), plist({ IsEncrypted: true, BackupKeyBag: keybag, ManifestKey: manifestKey }, true));

    const { main, wal } = chatStorage();
    const rows = [['ChatStorage.sqlite', main], ['ChatStorage.sqlite-wal', wal]] as const;
    const blobs = rows.map(([relativePath, data]) => {
      const fileKey = randomBytes(32);
      writeBackupFile(dir, relativePath, encrypt(fileKey, data));
      // MBFile, NSKeyedArchiver-style: EncryptionKey is NSData holding class + wrapped key
      const archive = {
        $archiver: 'NSKeyedArchiver', $version: 100000,
        $top: { root: new PlistUid(1) },
        $objects: [
          '$null',
          { $class: new PlistUid(3), EncryptionKey: new PlistUid(2), ProtectionClass: 3, Size: data.length, RelativePath: relativePath },
          { 'NS.data': Buffer.concat([Buffer.from([3, 0, 0, 0]), wrap(classKey, fileKey)]) },
          { $classname: 'MBFile', $classes: ['MBFile', 'NSObject'] },
        ],
      };
      return { relativePath, blob: plist(archive, true) };
    });
    const plainDb = path.join(work, 'Manifest-plain.db');
    manifestDb(plainDb, blobs);
    fs.writeFileSync(path.join(dir, 'Manifest.db'), encrypt(dbKey, fs.readFileSync(plainDb)));

    expect(() => readWhatsAppFromBackup('SECRETBACKUP-0002', null, root)).toThrow('password_required');
    expect(() => readWhatsAppFromBackup('SECRETBACKUP-0002', 'wrong', root)).toThrow('wrong_password');
    const result = readWhatsAppFromBackup('SECRETBACKUP-0002', password, root);
    expect(result.messages).toBe(3);
    expect(result.activity.map(a => a.day)).toEqual(['2019-03-01', '2021-06-15']);
  });

  it('lists backups with their device, date and encryption, newest first', () => {
    const list = listBackups(root);
    expect(list.map(b => [b.id, b.deviceName, b.encrypted])).toEqual(expect.arrayContaining([
      ['PLAINBACKUP-0001', 'Test iPhone', false],
      ['SECRETBACKUP-0002', 'Locked iPhone', true],
    ]));
    expect(list[0].date).toBe(new Date(noon('2026-10-31') * 1000).toISOString());
    expect(listBackups(path.join(root, 'missing'))).toEqual([]);
  });

  it('reads binary plists with UIDs and unicode strings', () => {
    const parsed = parsePlist(plist({ name: 'Zoë 📱', n: 5, ok: true, ref: new PlistUid(7), list: [1, 'two'] }, true)) as Record<string, unknown>;
    expect(parsed.name).toBe('Zoë 📱');
    expect(parsed.n).toBe(5);
    expect(parsed.ok).toBe(true);
    expect((parsed.ref as PlistUid).value).toBe(7);
    expect(parsed.list).toEqual([1, 'two']);
  });
});

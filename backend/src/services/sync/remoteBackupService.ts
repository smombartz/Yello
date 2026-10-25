import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getUserBackupsPath, getUserDatabase } from '../userDatabase.js';
import { getAuthDatabase } from '../authDatabase.js';
import { decryptToken } from '../tokenEncryption.js';
import { getValidAccessToken } from '../googleAuthService.js';
import { downloadGooglePhoto } from '../googlePeopleService.js';
import { buildICloudClient, streamICloudCards } from '../icloudService.js';
import { isGroupVcard, parseSingleVcard, unfoldLines } from '../vcardParser.js';
import { generateVcard } from '../vcardGenerator.js';
import {
  contactPhotoUrl,
  fetchAllGoogleContactGroups,
  fetchAllGooglePeople,
  GoogleApiError,
  googlePersonToVcardInput,
  type GooglePersonRaw
} from './googlePeople.js';

/**
 * Backups of the remote address books (iCloud, Google), taken before sync is
 * allowed to delete anything there. Each backup is a directory under
 * /data/users/<id>/backups/<id>/ holding:
 *
 *   <provider>-contacts.vcf  one vCard file the provider's own app re-imports
 *   icloud-index.json /      the full-fidelity copy (iCloud: href + etag per
 *   google-people.json       card; Google: every Person field and the labels)
 *   yello.db                 a snapshot of the user's Yello database
 *   manifest.json            counts, checksums, verification, confirmation
 *
 * A backup is only "verified" when the .vcf re-reads to exactly the number of
 * contacts the remote listed. The deletion gate requires a verified backup
 * that the user has confirmed, taken within BACKUP_MAX_AGE_MS.
 */

export type BackupProvider = 'icloud' | 'google';
export type BackupStatus = 'running' | 'verified' | 'unverified' | 'failed';

export interface BackupFile {
  name: string;
  bytes: number;
  sha256: string;
  description: string;
}

export interface BackupManifest {
  id: string;
  provider: BackupProvider;
  account: string | null;
  createdAt: string;
  finishedAt: string | null;
  status: BackupStatus;
  /** Contacts the remote listed (iCloud: excluding group cards). */
  remoteCount: number;
  /** Contact cards in the .vcf file, counted by re-reading it. */
  vcfCardCount: number;
  /** iCloud group cards / Google user labels, kept in the backup but not counted as contacts. */
  groupCount: number;
  photosIncluded: number;
  /** Cards the vCard parser could not read (informational: they are kept verbatim). */
  parseErrors: number;
  files: BackupFile[];
  error: string | null;
  /** When the user confirmed they downloaded this backup or have their own. */
  confirmedAt: string | null;
  /** Each time this backup was put back into its address book. */
  restores?: RestoreRecord[];
}

export interface RestoreRecord {
  mode: 'missing' | 'all';
  startedAt: string;
  finishedAt: string;
  recreated: number;
  reverted: number;
  unchanged: number;
  failed: number;
  errors: string[];
}

/** A remote delete needs a verified, confirmed backup no older than this. */
export const BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const MANIFEST = 'manifest.json';
const BACKUP_ID_PATTERN = /^(icloud|google)-\d{8}T\d{9}Z$/;

/** Backups in progress in this process; a 'running' manifest not in here was interrupted. */
const running = new Set<string>();

function backupKey(userId: number, id: string): string {
  return `${userId}:${id}`;
}

function timestampId(provider: BackupProvider, now = new Date()): string {
  // e.g. icloud-20261025T004403123Z (milliseconds keep back-to-back ids apart)
  return `${provider}-${now.toISOString().replace(/[-:]/g, '').replace('.', '')}`;
}

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileEntry(dir: string, name: string, description: string): BackupFile {
  const filePath = path.join(dir, name);
  return { name, bytes: fs.statSync(filePath).size, sha256: sha256File(filePath), description };
}

function writeManifest(dir: string, manifest: BackupManifest): void {
  const tmp = path.join(dir, `${MANIFEST}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2));
  fs.renameSync(tmp, path.join(dir, MANIFEST));
}

function readManifest(userId: number, dir: string): BackupManifest | null {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf-8')) as BackupManifest;
    if (manifest.status === 'running' && !running.has(backupKey(userId, manifest.id))) {
      return { ...manifest, status: 'failed', error: manifest.error ?? 'Interrupted (server restarted)' };
    }
    return manifest;
  } catch {
    return null;
  }
}

/** Counts the cards in a .vcf file the way an importer would see them. */
function countVcfCards(filePath: string): { contacts: number; groups: number; parseErrors: number } {
  const text = unfoldLines(fs.readFileSync(filePath, 'utf-8'));
  const blocks = text.split(/(?=^BEGIN:VCARD)/im).filter(block => /^BEGIN:VCARD/i.test(block.trim()));
  let contacts = 0;
  let groups = 0;
  let parseErrors = 0;
  for (const block of blocks) {
    if (!/END:VCARD\s*$/i.test(block.trim())) { parseErrors++; continue; }
    if (isGroupVcard(block)) { groups++; continue; }
    contacts++;
    try {
      if (!parseSingleVcard(block.trim())) parseErrors++;
    } catch {
      parseErrors++;
    }
  }
  return { contacts, groups, parseErrors };
}

async function snapshotYelloDatabase(userId: number, dir: string): Promise<void> {
  await getUserDatabase(userId).backup(path.join(dir, 'yello.db'));
}

/** Runs `task` on a pool of `concurrency` workers. */
async function mapPool<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── iCloud ─────────────────────────────────────────────────────────────────

function icloudCredentials(userId: number): { email: string; password: string } {
  const row = getUserDatabase(userId)
    .prepare('SELECT icloud_email, icloud_app_password FROM user_settings WHERE id = 1')
    .get() as { icloud_email: string | null; icloud_app_password: string | null } | undefined;
  if (!row?.icloud_email || !row.icloud_app_password) {
    throw new Error('iCloud is not connected. Connect it under Tools first.');
  }
  const password = decryptToken(row.icloud_app_password);
  if (!password) throw new Error('Stored iCloud password could not be decrypted. Reconnect iCloud.');
  return { email: row.icloud_email, password };
}

async function backUpICloud(userId: number, dir: string, manifest: BackupManifest): Promise<void> {
  const { email, password } = icloudCredentials(userId);
  manifest.account = email;
  const client = buildICloudClient(email, password);
  await client.login();

  const vcfName = 'icloud-contacts.vcf';
  const vcf = fs.openSync(path.join(dir, vcfName), 'w');
  const index: Array<{ addressBook: string; url: string; etag: string | null; uid: string | null; group: boolean }> = [];
  let contacts = 0;
  let groups = 0;
  let requested = 0;

  try {
    for await (const { addressBook, cards, requested: batchRequested } of streamICloudCards(client)) {
      requested += batchRequested;
      for (const card of cards) {
        const text = card.data.trim().replace(/\r?\n/g, '\r\n');
        fs.writeSync(vcf, `${text}\r\n`);
        const group = isGroupVcard(card.data);
        if (group) groups++; else contacts++;
        const uid = unfoldLines(card.data).match(/^UID[^:]*:(.*)$/im)?.[1]?.trim() ?? null;
        index.push({ addressBook: String(addressBook.displayName ?? addressBook.url), url: card.url, etag: card.etag, uid, group });
      }
    }
  } finally {
    fs.closeSync(vcf);
  }

  fs.writeFileSync(path.join(dir, 'icloud-index.json'), JSON.stringify(index, null, 2));
  // Cards iCloud listed but did not return count as missing, so the backup
  // will not verify.
  manifest.remoteCount = requested - groups;
  manifest.groupCount = groups;
  manifest.photosIncluded = index.length === 0 ? 0 : countPhotos(path.join(dir, vcfName));

  const check = countVcfCards(path.join(dir, vcfName));
  manifest.vcfCardCount = check.contacts;
  manifest.parseErrors = check.parseErrors;
  manifest.files = [
    fileEntry(dir, vcfName, 'Every iCloud card exactly as iCloud stores it, groups included. Import into Contacts.app or iCloud.com.'),
    fileEntry(dir, 'icloud-index.json', 'Card URL, etag and UID of every card (used to restore to iCloud).')
  ];
}

function countPhotos(vcfPath: string): number {
  return (fs.readFileSync(vcfPath, 'utf-8').match(/^PHOTO[;:]/gim) ?? []).length;
}

// ─── Google ─────────────────────────────────────────────────────────────────

function googleAccountEmail(userId: number): string | null {
  const row = getAuthDatabase().prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  return row?.email ?? null;
}

async function backUpGoogle(userId: number, dir: string, manifest: BackupManifest): Promise<void> {
  manifest.account = googleAccountEmail(userId);
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) throw new Error('Google is not connected. Sign in with Google again.');

  let people: GooglePersonRaw[];
  let groups;
  try {
    people = await fetchAllGooglePeople(accessToken);
    groups = await fetchAllGoogleContactGroups(accessToken);
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 403) {
      throw new Error('Yello is not allowed to read your Google Contacts yet. Grant Contacts access under Tools › Google Contacts.');
    }
    throw error;
  }

  const jsonName = 'google-people.json';
  fs.writeFileSync(path.join(dir, jsonName), JSON.stringify({ people, contactGroups: groups }, null, 2));

  const userGroups = groups.filter(g => g.groupType === 'USER_CONTACT_GROUP');
  const groupNames = new Map(userGroups.map(g => [g.resourceName, g.formattedName || g.name || g.resourceName]));

  const photos = await mapPool(people, 4, async person => {
    const url = contactPhotoUrl(person);
    return url ? downloadGooglePhoto(url, accessToken) : null;
  });

  const vcfName = 'google-contacts.vcf';
  const vcf = fs.openSync(path.join(dir, vcfName), 'w');
  try {
    people.forEach((person, i) => {
      const card = generateVcard(googlePersonToVcardInput(person, groupNames, photos[i]));
      fs.writeSync(vcf, `${card.replace(/\r?\n/g, '\r\n').trim()}\r\n`);
    });
  } finally {
    fs.closeSync(vcf);
  }

  manifest.remoteCount = people.length;
  manifest.groupCount = userGroups.length;
  manifest.photosIncluded = photos.filter(Boolean).length;

  const check = countVcfCards(path.join(dir, vcfName));
  const reread = JSON.parse(fs.readFileSync(path.join(dir, jsonName), 'utf-8')) as { people: unknown[] };
  manifest.vcfCardCount = reread.people.length === people.length ? check.contacts : -1;
  manifest.parseErrors = check.parseErrors;
  manifest.files = [
    fileEntry(dir, vcfName, 'Every Google contact as a vCard, labels as categories. Import at contacts.google.com.'),
    fileEntry(dir, jsonName, 'Every field of every Google contact plus all labels, exactly as Google returned them.')
  ];
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Starts a backup in the background and returns its id at once; poll
 * listBackups/getBackup for the result. One backup per provider at a time.
 */
export function startBackup(userId: number, provider: BackupProvider): { id: string; promise: Promise<BackupManifest> } {
  for (const key of running) {
    if (key.startsWith(`${userId}:${provider}-`)) {
      throw new Error(`A ${provider === 'icloud' ? 'iCloud' : 'Google'} backup is already running`);
    }
  }

  const id = timestampId(provider);
  const dir = path.join(getUserBackupsPath(userId), id);
  fs.mkdirSync(dir, { recursive: true });

  const manifest: BackupManifest = {
    id, provider, account: null,
    createdAt: new Date().toISOString(), finishedAt: null,
    status: 'running',
    remoteCount: 0, vcfCardCount: 0, groupCount: 0, photosIncluded: 0, parseErrors: 0,
    files: [], error: null, confirmedAt: null
  };
  writeManifest(dir, manifest);
  running.add(backupKey(userId, id));

  const promise = (async () => {
    try {
      if (provider === 'icloud') await backUpICloud(userId, dir, manifest);
      else await backUpGoogle(userId, dir, manifest);

      await snapshotYelloDatabase(userId, dir);
      manifest.files.push(fileEntry(dir, 'yello.db', 'Snapshot of your Yello database at the time of this backup.'));

      manifest.status = manifest.vcfCardCount === manifest.remoteCount ? 'verified' : 'unverified';
      if (manifest.status === 'unverified') {
        manifest.error = `The backup file holds ${manifest.vcfCardCount} contacts but ${provider === 'icloud' ? 'iCloud' : 'Google'} listed ${manifest.remoteCount}.`;
      }
    } catch (error) {
      manifest.status = 'failed';
      manifest.error = error instanceof Error ? error.message : String(error);
    } finally {
      manifest.finishedAt = new Date().toISOString();
      writeManifest(dir, manifest);
      running.delete(backupKey(userId, id));
    }
    return manifest;
  })();

  return { id, promise };
}

/** All backups, newest first. */
export function listBackups(userId: number, provider?: BackupProvider): BackupManifest[] {
  const root = getUserBackupsPath(userId);
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && BACKUP_ID_PATTERN.test(entry.name))
    .map(entry => readManifest(userId, path.join(root, entry.name)))
    .filter((m): m is BackupManifest => m !== null && (!provider || m.provider === provider))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getBackup(userId: number, id: string): BackupManifest | null {
  if (!BACKUP_ID_PATTERN.test(id)) return null;
  return readManifest(userId, path.join(getUserBackupsPath(userId), id));
}

/** Absolute path of a file listed in a backup's manifest, or null. Never resolves outside the backup. */
export function resolveBackupFile(userId: number, id: string, name: string): string | null {
  const manifest = getBackup(userId, id);
  if (!manifest?.files.some(f => f.name === name)) return null;
  return path.join(getUserBackupsPath(userId), id, path.basename(name));
}

/** Records that the user downloaded this backup or made their own. */
export function confirmBackup(userId: number, id: string): BackupManifest {
  const manifest = getBackup(userId, id);
  if (!manifest) throw new Error('Backup not found');
  if (manifest.status !== 'verified') throw new Error('Only a verified backup can be confirmed');
  manifest.confirmedAt = new Date().toISOString();
  writeManifest(path.join(getUserBackupsPath(userId), id), manifest);
  return manifest;
}

/** Appends a restore's outcome to the backup's manifest. */
export function recordRestore(userId: number, id: string, record: RestoreRecord): void {
  const manifest = getBackup(userId, id);
  if (!manifest) return;
  manifest.restores = [...(manifest.restores ?? []), record];
  writeManifest(path.join(getUserBackupsPath(userId), id), manifest);
}

export interface DeletionGate {
  allowed: boolean;
  reason: string | null;
  backup: BackupManifest | null;
}

/**
 * Whether sync may delete contacts from a provider right now. Every code path
 * that deletes remotely must check this first.
 */
export function checkDeletionGate(userId: number, provider: BackupProvider, now = Date.now()): DeletionGate {
  const latest = listBackups(userId, provider).find(m => m.status === 'verified') ?? null;
  const label = provider === 'icloud' ? 'iCloud' : 'Google';
  if (!latest) {
    return { allowed: false, reason: `Back up your ${label} contacts before anything is deleted there.`, backup: null };
  }
  if (now - new Date(latest.createdAt).getTime() > BACKUP_MAX_AGE_MS) {
    return { allowed: false, reason: `Your last ${label} backup is more than 24 hours old. Take a fresh one.`, backup: latest };
  }
  if (!latest.confirmedAt) {
    return { allowed: false, reason: `Confirm that you downloaded the ${label} backup (or made your own).`, backup: latest };
  }
  return { allowed: true, reason: null, backup: latest };
}

export class DeletionBlockedError extends Error {
  constructor(readonly gate: DeletionGate) {
    super(gate.reason ?? 'Remote deletion is blocked');
  }
}

/** Throws DeletionBlockedError unless checkDeletionGate allows the delete. */
export function assertDeletionAllowed(userId: number, provider: BackupProvider): void {
  const gate = checkDeletionGate(userId, provider);
  if (!gate.allowed) throw new DeletionBlockedError(gate);
}

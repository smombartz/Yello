import fs from 'fs';
import path from 'path';
import { getUserBackupsPath, getUserDatabase } from '../userDatabase.js';
import { unfoldLines } from '../vcardParser.js';
import { getBackup, recordRestore, type BackupManifest, type BackupProvider, type RestoreRecord } from './remoteBackupService.js';
import { openUserICloud } from './icloudSyncEngine.js';
import { openGoogleRemote, type GoogleRemote } from './googleRemote.js';
import type { GoogleContactGroupRaw, GooglePersonRaw } from './googlePeople.js';
import type { GooglePersonBody } from './googlePersonMapper.js';
import type { ICloudRemote } from './icloudRemote.js';
import { getProviderRow } from './syncRuntime.js';

/**
 * Puts a backup back into the address book it was taken from: the escape
 * hatch after a switch that went wrong.
 *
 * `missing` re-creates every backed-up card that is no longer there.
 * `all` also overwrites the cards that changed since the backup with their
 * backed-up version. Cards created after the backup are never touched.
 * Google gives a re-created contact a new id, and its photo is not restored
 * (the People API takes photos only separately, from bytes the backup's
 * JSON does not hold); iCloud cards come back byte for byte, photos included.
 *
 * Only while sync with that provider is off: otherwise the restored cards
 * would immediately be read as new contacts or overwritten by Yello.
 */

export type RestoreMode = 'missing' | 'all';

export class RestoreError extends Error {}

function splitCards(text: string): string[] {
  return text.split(/(?=^BEGIN:VCARD)/im).map(b => b.trim()).filter(b => /^BEGIN:VCARD/i.test(b));
}

const normalise = (card: string) => unfoldLines(card).replace(/\r\n/g, '\n').trim();

async function restoreICloud(userId: number, backup: BackupManifest, mode: RestoreMode, remote?: ICloudRemote): Promise<Omit<RestoreRecord, 'mode' | 'startedAt' | 'finishedAt'>> {
  const dir = path.join(getUserBackupsPath(userId), backup.id);
  const blocks = splitCards(fs.readFileSync(path.join(dir, 'icloud-contacts.vcf'), 'utf-8'));
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'icloud-index.json'), 'utf-8')) as Array<{ url: string }>;
  const icloud = remote ?? await openUserICloud(getUserDatabase(userId));
  const current = new Map((await icloud.listCards()).map(c => [c.url, c.etag]));

  const result = { recreated: 0, reverted: 0, unchanged: 0, failed: 0, errors: [] as string[] };
  const present = index.map((entry, i) => ({ url: entry.url, data: blocks[i] })).filter(c => current.has(c.url));
  const stored = mode === 'all' ? new Map((await icloud.fetchCards(present.map(c => c.url))).map(c => [c.url, c])) : new Map();

  for (let i = 0; i < index.length; i++) {
    const { url } = index[i];
    const data = blocks[i];
    try {
      if (!current.has(url)) {
        await icloud.putCardAt(url, data, null);
        result.recreated++;
      } else if (mode === 'all') {
        const now = stored.get(url);
        if (now && normalise(now.data) !== normalise(data)) {
          await icloud.putCardAt(url, data, now.etag);
          result.reverted++;
        } else {
          result.unchanged++;
        }
      } else {
        result.unchanged++;
      }
    } catch (error) {
      result.failed++;
      if (result.errors.length < 50) result.errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

/** Fields of a Person that can be written back. */
const WRITABLE_FIELDS = [
  'names', 'nicknames', 'organizations', 'biographies', 'birthdays', 'events', 'genders', 'emailAddresses',
  'phoneNumbers', 'addresses', 'urls', 'imClients', 'relations', 'userDefined', 'externalIds', 'sipAddresses',
  'occupations', 'interests', 'skills', 'locations', 'miscKeywords', 'calendarUrls', 'clientData', 'fileAses'
];
/** Output-only parts of a field value. */
const OUTPUT_ONLY = new Set(['metadata', 'formattedType', 'formattedValue', 'formattedProtocol', 'canonicalForm', 'displayName', 'displayNameLastFirst', 'unstructuredName']);

function writableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(writableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !OUTPUT_ONLY.has(key))
      .map(([key, v]) => [key, writableValue(v)]));
  }
  return value;
}

/** A backed-up Person as a body Google accepts; labels only for groups that still exist. */
export function restorableBody(person: GooglePersonRaw, userGroups: Set<string> | null): GooglePersonBody {
  const body: GooglePersonBody = {};
  for (const field of WRITABLE_FIELDS) {
    const value = (person as Record<string, unknown>)[field];
    if (Array.isArray(value) && value.length) body[field] = writableValue(value);
  }
  // A name Google only had as one string still needs to come back.
  const names = person.names as Array<{ unstructuredName?: string; givenName?: string; familyName?: string }> | undefined;
  if (names?.[0] && !names[0].givenName && !names[0].familyName && names[0].unstructuredName) {
    body.names = [{ unstructuredName: names[0].unstructuredName }];
  }
  if (userGroups) {
    const memberships = (person.memberships ?? [])
      .map(m => m.contactGroupMembership?.contactGroupResourceName)
      .filter((group): group is string => !!group && userGroups.has(group))
      .map(contactGroupResourceName => ({ contactGroupMembership: { contactGroupResourceName } }));
    if (memberships.length) body.memberships = memberships;
  }
  return body;
}

async function restoreGoogle(userId: number, backup: BackupManifest, mode: RestoreMode, remote?: GoogleRemote): Promise<Omit<RestoreRecord, 'mode' | 'startedAt' | 'finishedAt'>> {
  const dir = path.join(getUserBackupsPath(userId), backup.id);
  const { people, contactGroups } = JSON.parse(fs.readFileSync(path.join(dir, 'google-people.json'), 'utf-8')) as
    { people: GooglePersonRaw[]; contactGroups: GoogleContactGroupRaw[] };
  const google = remote ?? openGoogleRemote(userId);
  const backedUp = people.filter(p => !p.metadata?.deleted);
  const current = new Map((await google.getPeople(backedUp.map(p => p.resourceName))).map(p => [p.resourceName, p]));
  const userGroups = new Set(contactGroups.filter(g => g.groupType === 'USER_CONTACT_GROUP').map(g => g.resourceName));

  const result = { recreated: 0, reverted: 0, unchanged: 0, failed: 0, errors: [] as string[] };
  const note = (name: string, error: unknown) => {
    result.failed++;
    if (result.errors.length < 50) result.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  };

  const missing = backedUp.filter(p => !current.has(p.resourceName));
  const created = missing.length ? await google.createContacts(missing.map(p => restorableBody(p, userGroups))) : [];
  created.forEach((r, i) => (r instanceof Error ? note(missing[i].resourceName, r) : result.recreated++));

  const present = backedUp.filter(p => current.has(p.resourceName));
  if (mode === 'all' && present.length) {
    const updates = present.map(p => ({ resourceName: p.resourceName, etag: current.get(p.resourceName)!.etag ?? null, body: restorableBody(p, null) }));
    const results = await google.updateContacts(updates);
    results.forEach((r, i) => (r instanceof Error ? note(present[i].resourceName, r) : result.reverted++));
  } else {
    result.unchanged += present.length;
  }
  return result;
}

const running = new Set<string>();

/** Starts a restore in the background; its result is recorded on the backup's manifest. */
export function startRestore(
  userId: number,
  backupId: string,
  mode: RestoreMode,
  remotes: { icloud?: ICloudRemote; google?: GoogleRemote } = {}
): { promise: Promise<RestoreRecord> } {
  const backup = getBackup(userId, backupId);
  if (!backup) throw new RestoreError('Backup not found');
  if (backup.status !== 'verified') throw new RestoreError('Only a verified backup can be restored');
  const provider: BackupProvider = backup.provider;
  const name = provider === 'icloud' ? 'iCloud' : 'Google';
  if (getProviderRow(getUserDatabase(userId), provider).enabled) {
    throw new RestoreError(`Turn ${name} sync off first; otherwise it would undo the restore straight away.`);
  }
  const key = `${userId}:${provider}`;
  if (running.has(key)) throw new RestoreError(`A ${name} restore is already running`);
  running.add(key);

  const startedAt = new Date().toISOString();
  const promise = (async (): Promise<RestoreRecord> => {
    let record: RestoreRecord;
    try {
      const counts = provider === 'icloud'
        ? await restoreICloud(userId, backup, mode, remotes.icloud)
        : await restoreGoogle(userId, backup, mode, remotes.google);
      record = { mode, startedAt, finishedAt: new Date().toISOString(), ...counts };
    } catch (error) {
      record = {
        mode, startedAt, finishedAt: new Date().toISOString(), recreated: 0, reverted: 0, unchanged: 0, failed: 0,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    } finally {
      running.delete(key);
    }
    recordRestore(userId, backupId, record);
    return record;
  })();
  return { promise };
}

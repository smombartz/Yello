import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { getUserDatabase, closeAllUserDatabases, getUserBackupsPath } from '../../userDatabase.js';
import { encryptToken } from '../../tokenEncryption.js';
import type { GooglePersonRaw } from '../googlePeople.js';

const icloudCards: Array<{ url: string; etag: string; data: string }> = [];
let icloudDropOne = false;

vi.mock('../../icloudService.js', () => ({
  buildICloudClient: vi.fn(() => ({ login: vi.fn().mockResolvedValue(undefined) })),
  streamICloudCards: vi.fn(async function* () {
    const cards = icloudDropOne ? icloudCards.slice(1) : icloudCards;
    yield { addressBook: { url: 'https://contacts.icloud.com/1/carddavhome/card/', displayName: 'card' }, cards, requested: icloudCards.length };
  })
}));

const googlePeople: GooglePersonRaw[] = [];
vi.mock('../googlePeople.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../googlePeople.js')>()),
  fetchAllGooglePeople: vi.fn(async () => googlePeople),
  fetchAllGoogleContactGroups: vi.fn(async () => [
    { resourceName: 'contactGroups/abc', name: 'Climbing', formattedName: 'Climbing', groupType: 'USER_CONTACT_GROUP' },
    { resourceName: 'contactGroups/myContacts', name: 'myContacts', groupType: 'SYSTEM_CONTACT_GROUP' }
  ])
}));

vi.mock('../../googleAuthService.js', () => ({ getValidAccessToken: vi.fn(async () => 'access-token') }));
vi.mock('../../googlePeopleService.js', () => ({ downloadGooglePhoto: vi.fn(async () => 'UEhPVE8=') }));
vi.mock('../../authDatabase.js', () => ({
  getAuthDatabase: () => ({ prepare: () => ({ get: () => ({ email: 'me@gmail.com' }) }) })
}));

const {
  startBackup, listBackups, getBackup, confirmBackup, resolveBackupFile, checkDeletionGate, assertDeletionAllowed,
  DeletionBlockedError, BACKUP_MAX_AGE_MS
} = await import('../remoteBackupService.js');

const USER_ID = 11;

function vcard(name: string, uid: string, extra: string[] = []): string {
  return ['BEGIN:VCARD', 'VERSION:3.0', `N:${name};;;;`, `FN:${name}`, `UID:${uid}`, ...extra, 'END:VCARD'].join('\r\n');
}

describe('remoteBackupService', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-remote-backup-'));
    process.env.USER_DATA_PATH = tmpDir;
    process.env.TOKEN_ENCRYPTION_KEY = 'test-token-encryption-key-for-backups';
  });

  afterAll(() => {
    closeAllUserDatabases();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    fs.rmSync(getUserBackupsPath(USER_ID), { recursive: true, force: true });
    icloudDropOne = false;
    icloudCards.length = 0;
    icloudCards.push(
      { url: 'https://contacts.icloud.com/1/carddavhome/card/a.vcf', etag: '"1"', data: vcard('Ada', 'A') },
      { url: 'https://contacts.icloud.com/1/carddavhome/card/b.vcf', etag: '"2"', data: vcard('Bob', 'B', ['PHOTO;ENCODING=b;TYPE=JPEG:UEhPVE8=']) },
      { url: 'https://contacts.icloud.com/1/carddavhome/card/g.vcf', etag: '"3"', data: vcard('Family', 'G', ['X-ADDRESSBOOKSERVER-KIND:group']) }
    );
    googlePeople.length = 0;
    googlePeople.push(
      {
        resourceName: 'people/c1',
        names: [{ givenName: 'Grace', familyName: 'Hopper', displayName: 'Grace Hopper' }],
        emailAddresses: [{ value: 'grace@navy.mil', type: 'work' }],
        phoneNumbers: [{ value: '+1 555 0100', canonicalForm: '+15550100', type: 'mobile' }],
        memberships: [
          { contactGroupMembership: { contactGroupResourceName: 'contactGroups/abc' } },
          { contactGroupMembership: { contactGroupResourceName: 'contactGroups/myContacts' } }
        ],
        photos: [{ url: 'https://photo', metadata: { source: { type: 'CONTACT' } } }]
      },
      { resourceName: 'people/c2', emailAddresses: [{ value: 'nameless@example.com' }] }
    );
    getUserDatabase(USER_ID)
      .prepare('UPDATE user_settings SET icloud_email = ?, icloud_app_password = ? WHERE id = 1')
      .run('me@icloud.com', encryptToken('app-password'));
  });

  it('backs up iCloud verbatim, counts groups apart, and verifies', async () => {
    const { promise } = startBackup(USER_ID, 'icloud');
    const manifest = await promise;

    expect(manifest.status).toBe('verified');
    expect(manifest.account).toBe('me@icloud.com');
    expect(manifest.remoteCount).toBe(2);
    expect(manifest.vcfCardCount).toBe(2);
    expect(manifest.groupCount).toBe(1);
    expect(manifest.photosIncluded).toBe(1);
    expect(manifest.files.map(f => f.name)).toEqual(['icloud-contacts.vcf', 'icloud-index.json', 'yello.db']);

    const vcf = fs.readFileSync(resolveBackupFile(USER_ID, manifest.id, 'icloud-contacts.vcf')!, 'utf-8');
    for (const card of icloudCards) expect(vcf).toContain(card.data);

    const index = JSON.parse(fs.readFileSync(resolveBackupFile(USER_ID, manifest.id, 'icloud-index.json')!, 'utf-8'));
    expect(index.map((c: { uid: string; group: boolean }) => [c.uid, c.group])).toEqual([['A', false], ['B', false], ['G', true]]);
  });

  it('is unverified when iCloud returns fewer cards than it listed', async () => {
    icloudDropOne = true;
    const manifest = await startBackup(USER_ID, 'icloud').promise;
    expect(manifest.status).toBe('unverified');
    expect(manifest.error).toMatch(/iCloud listed/);
    expect(checkDeletionGate(USER_ID, 'icloud').allowed).toBe(false);
  });

  it('backs up Google as JSON plus an importable vCard file', async () => {
    const manifest = await startBackup(USER_ID, 'google').promise;

    expect(manifest.status).toBe('verified');
    expect(manifest.remoteCount).toBe(2);
    expect(manifest.groupCount).toBe(1);
    expect(manifest.photosIncluded).toBe(1);

    const vcf = fs.readFileSync(resolveBackupFile(USER_ID, manifest.id, 'google-contacts.vcf')!, 'utf-8');
    expect(vcf).toContain('FN:Grace Hopper');
    expect(vcf).toContain('EMAIL;TYPE=WORK');
    expect(vcf).toContain('TEL;TYPE=CELL');
    expect(vcf).toContain('CATEGORIES:Climbing');
    expect(vcf).not.toContain('myContacts');
    expect(vcf).toContain('PHOTO;ENCODING=b;TYPE=JPEG:UEhPVE8=');
    expect(vcf).toContain('FN:nameless@example.com');

    const json = JSON.parse(fs.readFileSync(resolveBackupFile(USER_ID, manifest.id, 'google-people.json')!, 'utf-8'));
    expect(json.people).toHaveLength(2);
    expect(json.contactGroups).toHaveLength(2);
  });

  it('fails cleanly when iCloud is not connected', async () => {
    getUserDatabase(USER_ID).prepare('UPDATE user_settings SET icloud_email = NULL, icloud_app_password = NULL WHERE id = 1').run();
    const manifest = await startBackup(USER_ID, 'icloud').promise;
    expect(manifest.status).toBe('failed');
    expect(manifest.error).toMatch(/not connected/);
  });

  it('runs one backup per provider at a time', async () => {
    const first = startBackup(USER_ID, 'icloud');
    expect(() => startBackup(USER_ID, 'icloud')).toThrow(/already running/);
    await first.promise;
  });

  it('lists backups newest first and resolves only manifest files', async () => {
    const manifest = await startBackup(USER_ID, 'icloud').promise;
    expect(listBackups(USER_ID).map(b => b.id)).toContain(manifest.id);
    expect(getBackup(USER_ID, '../etc')).toBeNull();
    expect(resolveBackupFile(USER_ID, manifest.id, '../../contacts.db')).toBeNull();
    expect(resolveBackupFile(USER_ID, manifest.id, 'manifest.json')).toBeNull();
  });

  describe('deletion gate', () => {
    it('needs a verified backup, then a confirmation, and expires after 24 hours', async () => {
      expect(checkDeletionGate(USER_ID, 'icloud').reason).toMatch(/Back up/);
      expect(() => assertDeletionAllowed(USER_ID, 'icloud')).toThrow(DeletionBlockedError);

      const manifest = await startBackup(USER_ID, 'icloud').promise;
      expect(checkDeletionGate(USER_ID, 'icloud').reason).toMatch(/Confirm/);

      confirmBackup(USER_ID, manifest.id);
      expect(checkDeletionGate(USER_ID, 'icloud').allowed).toBe(true);
      expect(() => assertDeletionAllowed(USER_ID, 'icloud')).not.toThrow();

      // An iCloud backup never unlocks Google.
      expect(checkDeletionGate(USER_ID, 'google').allowed).toBe(false);

      const later = new Date(manifest.createdAt).getTime() + BACKUP_MAX_AGE_MS + 1;
      expect(checkDeletionGate(USER_ID, 'icloud', later).reason).toMatch(/more than 24 hours/);
    });

    it('refuses to confirm a backup that did not verify', async () => {
      icloudDropOne = true;
      const manifest = await startBackup(USER_ID, 'icloud').promise;
      expect(() => confirmBackup(USER_ID, manifest.id)).toThrow(/verified/);
    });
  });
});

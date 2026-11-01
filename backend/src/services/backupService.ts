import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getAuthDatabase } from './authDatabase.js';
import { getUserDatabase, listUserIds } from './userDatabase.js';

/**
 * Full backup of this server's data, for the admin: a consistent copy of
 * auth.db and every user's contacts.db (SQLite's online backup, so WAL
 * contents are included), plus each user's photos and the profile images.
 * Staged imports and remote address-book backups are left out.
 *
 * Layout matches a local data set folder (services/datasets.ts):
 *   auth.db · users/<id>/contacts.db · users/<id>/photos/ · photos/
 */
export async function createBackupSnapshot(): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-backup-'));

  try {
    await getAuthDatabase().backup(path.join(dir, 'auth.db'));

    const usersPath = process.env.USER_DATA_PATH || './data/users';
    for (const userId of listUserIds()) {
      const userDir = path.join(dir, 'users', String(userId));
      fs.mkdirSync(userDir, { recursive: true });
      await getUserDatabase(userId).backup(path.join(userDir, 'contacts.db'));

      const photos = path.join(usersPath, String(userId), 'photos');
      if (fs.existsSync(photos)) fs.cpSync(photos, path.join(userDir, 'photos'), { recursive: true });
    }

    const profilePhotos = process.env.PHOTOS_PATH || './data/photos';
    if (fs.existsSync(profilePhotos)) fs.cpSync(profilePhotos, path.join(dir, 'photos'), { recursive: true });

    return dir;
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

/** Streams the snapshot folder as a .tar.gz on stdout. */
export function tarSnapshot(dir: string): ChildProcessWithoutNullStreams {
  return spawn('tar', ['-czf', '-', '-C', dir, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
}

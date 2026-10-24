import type { Database as DatabaseType } from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import { getAuthDatabase } from './authDatabase.js';
import { getUserDatabase, listUserIds } from './userDatabase.js';
import { isKeyRotationPending, reencryptToken } from './tokenEncryption.js';

export interface RotationCounts {
  rotated: number;
  current: number;
  failed: number;
}

/**
 * Re-encrypts one table's token columns in a single transaction. Only rows
 * whose value actually changed are written; failures keep their old value.
 */
function rotateColumns(
  db: DatabaseType,
  table: string,
  columns: string[],
  counts: RotationCounts,
  log: FastifyBaseLogger,
  label: string
): void {
  const rows = db.prepare(`SELECT id, ${columns.join(', ')} FROM ${table}`).all() as Array<
    Record<string, unknown> & { id: number }
  >;

  db.transaction(() => {
    for (const row of rows) {
      for (const column of columns) {
        const value = row[column];
        if (typeof value !== 'string' || value.length === 0) continue;

        const result = reencryptToken(value);
        counts[result.status]++;

        if (result.status === 'rotated') {
          db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`).run(result.value, row.id);
        } else if (result.status === 'failed') {
          log.warn(`Token key rotation: could not decrypt ${label} ${table}.${column} (row ${row.id})`);
        }
      }
    }
  })();
}

/**
 * Moves every encrypted credential onto TOKEN_ENCRYPTION_KEY when
 * TOKEN_ENCRYPTION_KEY_PREVIOUS is set. Runs at boot, before the server
 * listens, so no request sees a half-migrated store. Idempotent: values already
 * on the current key are skipped, so it is safe on every restart until the
 * previous key is removed.
 *
 * Covered: Google tokens in auth.db `users`, and each tenant's Apify token and
 * iCloud app password in `user_settings`.
 */
export function rotateEncryptedTokens(log: FastifyBaseLogger): RotationCounts | null {
  if (!isKeyRotationPending()) return null;

  const counts: RotationCounts = { rotated: 0, current: 0, failed: 0 };

  try {
    rotateColumns(getAuthDatabase(), 'users', ['access_token', 'refresh_token'], counts, log, 'auth.db');
  } catch (error) {
    log.error(error, 'Token key rotation failed for auth.db');
  }

  let userIds: number[] = [];
  try {
    userIds = listUserIds();
  } catch (error) {
    log.error(error, 'Could not enumerate user data directories for token key rotation');
  }

  for (const userId of userIds) {
    try {
      rotateColumns(
        getUserDatabase(userId),
        'user_settings',
        ['apify_api_token', 'icloud_app_password'],
        counts,
        log,
        `user ${userId}`
      );
    } catch (error) {
      log.error(error, `Token key rotation failed for user ${userId}`);
    }
  }

  log.info(
    `Token key rotation: rotated ${counts.rotated}, already current ${counts.current}, failed ${counts.failed}`
  );
  return counts;
}

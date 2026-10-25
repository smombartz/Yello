import type { Database as DatabaseType } from 'better-sqlite3';

/**
 * Remote address books (iCloud, Google) keep the cards of contacts that were
 * merged away in Yello. contact_merged_identities remembers which surviving
 * contact each of those UIDs / resource names now belongs to.
 */

export type MergedIdentityKind = 'uid' | 'google_resource_name';

interface IdentityRow {
  icloud_uid: string | null;
  google_resource_name: string | null;
}

/**
 * Moves the identifiers of the secondary contacts onto the primary before the
 * secondaries are deleted. The primary adopts a UID / resource name it lacks;
 * every other one is recorded as a merged identity. Call inside the merge
 * transaction, before the DELETE (the cascade would drop their records).
 */
export function carryMergedIdentities(db: DatabaseType, primaryId: number, secondaryIds: number[]): void {
  const select = db.prepare('SELECT icloud_uid, google_resource_name FROM contacts WHERE id = ?');
  const record = db.prepare(`
    INSERT INTO contact_merged_identities (contact_id, kind, value) VALUES (?, ?, ?)
    ON CONFLICT(kind, value) DO UPDATE SET contact_id = excluded.contact_id, merged_at = CURRENT_TIMESTAMP
  `);
  const repoint = db.prepare('UPDATE contact_merged_identities SET contact_id = ? WHERE contact_id = ?');

  const primary = select.get(primaryId) as IdentityRow | undefined;
  if (!primary) return;
  let uid = primary.icloud_uid;
  let resourceName = primary.google_resource_name;

  for (const secondaryId of secondaryIds) {
    repoint.run(primaryId, secondaryId);
    const secondary = select.get(secondaryId) as IdentityRow | undefined;
    if (!secondary) continue;

    if (secondary.icloud_uid && secondary.icloud_uid !== uid) {
      if (!uid) {
        uid = secondary.icloud_uid;
        db.prepare('UPDATE contacts SET icloud_uid = ? WHERE id = ?').run(uid, primaryId);
      } else {
        record.run(primaryId, 'uid', secondary.icloud_uid);
      }
    }

    if (secondary.google_resource_name && secondary.google_resource_name !== resourceName) {
      if (!resourceName) {
        resourceName = secondary.google_resource_name;
        db.prepare('UPDATE contacts SET google_resource_name = ? WHERE id = ?').run(resourceName, primaryId);
      } else {
        record.run(primaryId, 'google_resource_name', secondary.google_resource_name);
      }
    }
  }
}

/** The surviving contact a merged-away UID / resource name now belongs to. */
export function findContactByMergedIdentity(db: DatabaseType, kind: MergedIdentityKind, value: string): number | null {
  const row = db.prepare('SELECT contact_id FROM contact_merged_identities WHERE kind = ? AND value = ?').get(kind, value) as
    { contact_id: number } | undefined;
  return row?.contact_id ?? null;
}

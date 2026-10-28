import type { Database as DatabaseType } from 'better-sqlite3';
import type { VcardParams } from './vcardParser.js';

/**
 * Archived contact details
 * ========================
 * A phone, email, address, URL, social profile or IM can be archived: kept in
 * Yello (searchable, in the VCF export) but out of the main view and never
 * sent to iCloud or Google. A row is archived when `detail_archived_at` is set.
 *
 * In a VCF export an archived entry carries the label "Archived", so other
 * apps show it as such, plus two parameters that let a Yello import restore
 * it exactly:
 *
 *   item3.TEL;TYPE=CELL;X-YELLO-ARCHIVED=2026-10-26;X-YELLO-LABEL=mobile:+14155550100
 *   item3.X-ABLabel:Archived
 *
 * An entry stored with the label "Obsolete" or "Archived" (Apple users mark
 * stale numbers that way) is archived on write and loses the label. Sync
 * relies on that happening at storage, not in the parser: the remote card
 * still projects the entry, so Yello's next push removes it from the phone.
 */

/** Child tables whose rows can be archived. */
export const ARCHIVABLE_TABLES = [
  'contact_emails', 'contact_phones', 'contact_addresses',
  'contact_urls', 'contact_social_profiles', 'contact_instant_messages'
] as const;

/** The archivable tables that carry an X-ABLabel `label` column. */
const LABELLED_TABLES = ['contact_emails', 'contact_phones', 'contact_addresses', 'contact_urls'] as const;

/** Tables with an is_primary flag, which only an active row may hold. */
const PRIMARY_TABLES = ['contact_emails', 'contact_phones'] as const;

export const ARCHIVED_LABEL = 'Archived';
export const ARCHIVED_PARAM = 'X-YELLO-ARCHIVED';
export const ARCHIVED_LABEL_PARAM = 'X-YELLO-LABEL';

const ARCHIVE_LABELS = new Set(['obsolete', 'archived']);

export interface ArchivableEntry {
  label?: string | null;
  params?: VcardParams | null;
  archivedAt?: string | null;
}

/** True for a label that means "this detail is no longer in use". */
export function isArchiveLabel(label: string | null | undefined): boolean {
  return !!label && ARCHIVE_LABELS.has(label.trim().toLowerCase());
}

export function isArchived(entry: { archivedAt?: string | null }): boolean {
  return !!entry.archivedAt;
}

export function activeOnly<E extends { archivedAt?: string | null }>(entries: E[]): E[] {
  return entries.filter(entry => !entry.archivedAt);
}

/**
 * Reads Yello's archive marker off a parsed entry: sets `archivedAt` and puts
 * back the label it had before archiving. Both parameters are removed, so
 * they are not stored as leftovers and written twice on export.
 */
export function takeArchiveMarker<E extends ArchivableEntry>(entry: E): E {
  const params = entry.params;
  const marker = params?.[ARCHIVED_PARAM];
  if (!params || !marker) return entry;

  const { [ARCHIVED_PARAM]: _marker, [ARCHIVED_LABEL_PARAM]: originalLabel, ...rest } = params;
  return {
    ...entry,
    archivedAt: marker[0]?.trim() || new Date().toISOString(),
    // Social profiles and IMs have no label
    ...('label' in entry ? { label: originalLabel?.length ? originalLabel.join(',') : null } : {}),
    params: Object.keys(rest).length > 0 ? rest : null
  };
}

/**
 * The archive state and label a row is stored with. An entry labelled
 * Obsolete/Archived is archived now and the label dropped.
 */
export function archiveStateForStorage(entry: ArchivableEntry): { archivedAt: string | null; label: string | null } {
  if (entry.archivedAt) return { archivedAt: entry.archivedAt, label: entry.label ?? null };
  if (isArchiveLabel(entry.label)) return { archivedAt: new Date().toISOString(), label: null };
  return { archivedAt: null, label: entry.label ?? null };
}

/**
 * Label and parameters an entry is exported with: unchanged for an active
 * entry; "Archived" plus the marker parameters for an archived one.
 */
export function exportFields(entry: ArchivableEntry): { label: string | null; params: VcardParams | null } {
  if (!entry.archivedAt) return { label: entry.label ?? null, params: entry.params ?? null };
  return {
    label: ARCHIVED_LABEL,
    params: {
      ...entry.params,
      [ARCHIVED_PARAM]: [entry.archivedAt.slice(0, 10)],
      ...(entry.label ? { [ARCHIVED_LABEL_PARAM]: [entry.label] } : {})
    }
  };
}

/**
 * Only an active row may be primary: archived rows lose the flag, and a
 * contact whose primary was archived gets its first active row instead.
 * Pass a contact id, or omit it to fix every contact.
 */
export function normalizeArchivedPrimary(db: DatabaseType, contactId?: number): void {
  const scope = contactId === undefined ? '' : 'AND contact_id = @contactId';
  const params = contactId === undefined ? {} : { contactId };
  for (const table of PRIMARY_TABLES) {
    db.prepare(`UPDATE ${table} SET is_primary = 0 WHERE detail_archived_at IS NOT NULL AND is_primary = 1 ${scope}`).run(params);
    db.prepare(`
      UPDATE ${table} SET is_primary = 1
      WHERE id IN (
        SELECT MIN(id) FROM ${table} t
        WHERE detail_archived_at IS NULL ${scope}
          AND NOT EXISTS (
            SELECT 1 FROM ${table} p
            WHERE p.contact_id = t.contact_id AND p.detail_archived_at IS NULL AND p.is_primary = 1
          )
        GROUP BY contact_id
      )
    `).run(params);
  }
}

/** What identifies a row of each archivable table, matching the merge's dedupe keys. */
const ENTRY_KEYS: Record<typeof ARCHIVABLE_TABLES[number], string> = {
  contact_emails: 'LOWER(email)',
  contact_phones: 'phone',
  contact_addresses: `LOWER(COALESCE(street, '')) || '|' || LOWER(COALESCE(city, '')) || '|' || LOWER(COALESCE(postal_code, ''))`,
  contact_urls: 'LOWER(url)',
  contact_social_profiles: `platform || ':' || username`,
  contact_instant_messages: `LOWER(service) || ':' || LOWER(handle)`
};

/**
 * Merging contacts: a detail archived on the primary that a secondary still
 * has as active is unarchived, so the active state wins. Run before the
 * secondaries' rows are copied (they are then skipped as duplicates).
 */
export function unarchiveDetailsActiveElsewhere(db: DatabaseType, primaryId: number, secondaryIds: number[]): void {
  if (secondaryIds.length === 0) return;
  const placeholders = secondaryIds.map(() => '?').join(',');
  for (const table of ARCHIVABLE_TABLES) {
    const key = ENTRY_KEYS[table];
    db.prepare(`
      UPDATE ${table} SET detail_archived_at = NULL
      WHERE contact_id = ? AND detail_archived_at IS NOT NULL
        AND ${key} IN (SELECT ${key} FROM ${table} WHERE contact_id IN (${placeholders}) AND detail_archived_at IS NULL)
    `).run(primaryId, ...secondaryIds);
  }
}

/**
 * Archives every row labelled Obsolete/Archived and clears the label. Rows
 * converted once no longer match, so it is safe to run on every connection.
 */
export function archiveObsoleteLabels(db: DatabaseType): void {
  db.transaction(() => {
    let converted = 0;
    for (const table of LABELLED_TABLES) {
      converted += db.prepare(`
        UPDATE ${table}
        SET detail_archived_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), label = NULL
        WHERE detail_archived_at IS NULL AND LOWER(TRIM(label)) IN ('obsolete', 'archived')
      `).run().changes;
    }
    if (converted > 0) normalizeArchivedPrimary(db);
  })();
}

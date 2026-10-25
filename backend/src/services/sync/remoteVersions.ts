import { getUserDatabase } from '../userDatabase.js';
import { parseSingleVcard, type ParsedContact } from '../vcardParser.js';
import { prepareContactStatements, replaceContactFields } from '../contactPersistence.js';
import { contactDataToParsed, SYNC_FIELDS, type SyncField } from './syncProjection.js';
import { personToContactData } from './googlePersonMapper.js';
import type { GooglePersonRaw } from './googlePeople.js';
import type { RemoteVersionReason } from './syncRuntime.js';
import type { SyncProvider } from './syncState.js';

/**
 * The remote versions sync overwrote (Yello won a conflict) or deleted, kept
 * in sync_remote_versions, as the contact page lists them. Restoring one
 * makes the contact look like that version again in Yello; the next sync
 * then writes it back to the address books.
 */

export interface RemoteVersionView {
  id: number;
  provider: SyncProvider;
  reason: RemoteVersionReason;
  createdAt: string;
  restoredAt: string | null;
  /** False for entries that hold only a field summary, not a whole card. */
  restorable: boolean;
  preview: { displayName: string; lines: string[] } | null;
}

interface VersionRow {
  id: number;
  contact_id: number | null;
  provider: SyncProvider;
  reason: RemoteVersionReason;
  payload: string;
  created_at: string;
  restored_at: string | null;
}

/** The families a restore writes for each provider (what that provider can hold). */
const FAMILIES: Record<SyncProvider, SyncField[]> = {
  icloud: [...SYNC_FIELDS],
  google: SYNC_FIELDS.filter(f => f !== 'categories' && f !== 'isCompany')
};

/** A stored payload as a contact: an iCloud card (vCard) or a Google Person (JSON). */
function parsePayload(provider: SyncProvider, payload: string): ParsedContact | null {
  try {
    if (provider === 'icloud' && /^BEGIN:VCARD/i.test(payload.trim())) return parseSingleVcard(payload);
    if (provider === 'google') {
      const person = JSON.parse(payload) as GooglePersonRaw;
      if (typeof person?.resourceName === 'string') return contactDataToParsed(personToContactData(person, { socialsFromUrls: true }));
    }
  } catch { /* not restorable */ }
  return null;
}

function previewOf(contact: ParsedContact): { displayName: string; lines: string[] } {
  const lines: string[] = [];
  const org = [contact.title, contact.company].filter(Boolean).join(', ');
  if (org) lines.push(org);
  if (contact.emails.length) lines.push(contact.emails.map(e => e.email).join(', '));
  if (contact.phones.length) lines.push(contact.phones.map(p => p.phoneDisplay || p.phone).join(', '));
  if (contact.addresses.length) lines.push(`${contact.addresses.length} address${contact.addresses.length === 1 ? '' : 'es'}`);
  return { displayName: contact.displayName, lines };
}

export function listRemoteVersions(userId: number, contactId: number): RemoteVersionView[] {
  const rows = getUserDatabase(userId).prepare(`
    SELECT id, contact_id, provider, reason, payload, created_at, restored_at
    FROM sync_remote_versions WHERE contact_id = ? ORDER BY created_at DESC, id DESC LIMIT 50
  `).all(contactId) as VersionRow[];
  return rows.map(row => {
    const parsed = parsePayload(row.provider, row.payload);
    return {
      id: row.id,
      provider: row.provider,
      reason: row.reason,
      createdAt: row.created_at,
      restoredAt: row.restored_at,
      restorable: parsed !== null,
      preview: parsed ? previewOf(parsed) : null
    };
  });
}

export class RemoteVersionError extends Error {}

/** Makes the contact match the stored version (unarchiving it if needed). Returns the contact id. */
export function restoreRemoteVersion(userId: number, versionId: number): number {
  const db = getUserDatabase(userId);
  const row = db.prepare('SELECT id, contact_id, provider, reason, payload, created_at, restored_at FROM sync_remote_versions WHERE id = ?')
    .get(versionId) as VersionRow | undefined;
  if (!row) throw new RemoteVersionError('Version not found');
  if (!row.contact_id) throw new RemoteVersionError('The contact this version belonged to no longer exists');
  const parsed = parsePayload(row.provider, row.payload);
  if (!parsed) throw new RemoteVersionError('This entry holds only a summary and cannot be restored');

  const contactId = row.contact_id;
  db.transaction(() => {
    db.prepare('UPDATE contacts SET archived_at = NULL WHERE id = ? AND archived_at IS NOT NULL').run(contactId);
    replaceContactFields(prepareContactStatements(db), db, contactId, parsed, FAMILIES[row.provider]);
    db.prepare("UPDATE sync_remote_versions SET restored_at = datetime('now') WHERE id = ?").run(versionId);
  })();
  return contactId;
}

/** Labels for the Recent card and page. */
import type { RecentChange, RecentKind } from '../api/dashboardHooks';
import type { ContactTile } from '../components/ContactTileGrid';
import { formatRelativeDay } from './relativeTime';

/** Display order on the Recent page. */
export const RECENT_KINDS: RecentKind[] = ['added', 'imported', 'synced', 'updated', 'archived'];

export const RECENT_KIND_LABELS: Record<RecentKind, string> = {
  added: 'Added',
  imported: 'Imported',
  synced: 'Synced',
  updated: 'Updated',
  archived: 'Archived',
};

export const RECENT_KIND_ICONS: Record<RecentKind, string> = {
  added: 'user-plus',
  imported: 'file-import',
  synced: 'arrows-rotate',
  updated: 'pen',
  archived: 'box-archive',
};

/** Where a contact came from (`contacts.created_via`), worded to follow "Imported" etc. */
const ORIGIN_LABELS: Record<string, string> = {
  vcf_import: 'from a VCF file',
  icloud_import: 'from iCloud',
  google_import: 'from Google',
  linkedin_import: 'from LinkedIn',
  icloud_sync: 'from iCloud',
  google_sync: 'from Google',
  demo: '(demo contact)',
  profile: '(your own card)',
};

/** "Imported from LinkedIn", "Added", "Updated". */
export function describeChange(change: RecentChange): string {
  const label = RECENT_KIND_LABELS[change.kind];
  if (change.kind === 'updated' || change.kind === 'archived') return label;
  const origin = change.createdVia ? ORIGIN_LABELS[change.createdVia] : undefined;
  return origin ? `${label} ${origin}` : label;
}

export function recentTile(change: RecentChange): ContactTile {
  return {
    key: `${change.kind}-${change.id}`,
    contactId: change.id,
    displayName: change.displayName,
    photoHash: change.photoHash,
    tipTitle: describeChange(change),
    tipText: formatRelativeDay(change.at),
  };
}

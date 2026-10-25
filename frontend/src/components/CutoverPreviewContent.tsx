import { useState } from 'react';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import {
  useCutoverItems,
  useLatestCutover,
  useStartCutoverPlan,
  type BackupProvider,
  type CutoverItem,
  type CutoverItemKind,
  type ProviderPlanSummary,
} from '../api/syncHooks';

const WINDOWS = [
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '12 months' },
];

const PROVIDER_NAMES: Record<BackupProvider, string> = { icloud: 'iCloud', google: 'Google' };

const FIELD_LABELS: Record<string, string> = {
  name: 'Name', nickname: 'Nickname', org: 'Company / title', notes: 'Notes', birthday: 'Birthday',
  gender: 'Gender', isCompany: 'Company card', emails: 'Emails', phones: 'Phones', addresses: 'Addresses',
  urls: 'Websites', socials: 'Social profiles', ims: 'Messaging', related: 'Related people', dates: 'Dates',
  categories: 'Groups',
};

const REASON_LABELS: Record<string, string> = {
  duplicate_of_yello_contact: 'duplicate of a Yello contact',
  removed_in_cleanup: 'removed in your Yello cleanup',
  removed_in_cleanup_but_edited: 'removed in your cleanup, but edited on the phone recently',
  old_remote_only: 'not in Yello, not changed recently',
  archived_in_yello: 'archived in Yello',
  edited_after_archived: 'archived in Yello, but edited on the phone afterwards',
  changed_remotely: 'changed there',
  added_remotely: 'added there',
  filled_remotely: 'empty in Yello',
  changed_on_both_sides: 'changed in both places',
  differs_no_baseline: 'differs',
  new_in_window: 'new or edited recently',
};

/** A projected field value as short text. */
function describe(value: unknown): string {
  if (value === null || value === undefined || value === false) return '—';
  if (value === true) return 'yes';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(entry => (typeof entry === 'object' && entry !== null
      ? Object.values(entry as Record<string, unknown>).filter(v => v !== null && !String(v).startsWith('label:')).join(' · ')
      : String(entry))).join(', ') || '—';
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).filter(v => v !== null).join(' · ') || '—';
  }
  return String(value);
}

function ItemList({ cutoverId, kind, provider, total }: {
  cutoverId: string;
  kind: CutoverItemKind;
  provider?: BackupProvider;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useCutoverItems(cutoverId, { kind, provider }, open);
  if (total === 0) return null;

  return (
    <details className="cutover-list" onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Show {total.toLocaleString()}</summary>
      {isLoading && <p className="backup-meta">Loading…</p>}
      {data && (
        <ul>
          {data.items.map(item => <ItemRow key={item.id} item={item} />)}
          {data.total > data.items.length && (
            <li className="backup-meta">…and {(data.total - data.items.length).toLocaleString()} more</li>
          )}
        </ul>
      )}
    </details>
  );
}

function ItemRow({ item }: { item: CutoverItem }) {
  const name = item.displayName || '(no name)';
  if (item.kind === 'update' || item.kind === 'conflict') {
    return (
      <li>
        <strong>{name}</strong> — {FIELD_LABELS[item.field ?? ''] ?? item.field}:{' '}
        {item.kind === 'conflict' ? (
          <>Yello “{describe(item.yelloValue)}” vs. “{describe(item.remoteValue)}”
            {item.suggested && <span className="backup-meta"> (suggested: {item.suggested === 'remote' ? 'theirs, it is newer' : 'Yello'})</span>}
          </>
        ) : (
          <>{item.reason === 'added_remotely' ? '+ ' : '→ '}{describe(item.remoteValue)}</>
        )}
      </li>
    );
  }
  if (item.kind === 'possible_match') {
    return <li><strong>{name}</strong> might be Yello’s “{describe(item.yelloValue)}” <span className="backup-meta">({item.reason})</span></li>;
  }
  return (
    <li>
      <strong>{name}</strong>
      {item.reason && REASON_LABELS[item.reason] && <span className="backup-meta"> — {REASON_LABELS[item.reason]}</span>}
    </li>
  );
}

function Row({ label, count, children }: { label: string; count: number; children?: React.ReactNode }) {
  return (
    <div className={`cutover-row${count === 0 ? ' cutover-row--zero' : ''}`}>
      <span className="cutover-count">{count.toLocaleString()}</span>
      <div>
        <span>{label}</span>
        {children}
      </div>
    </div>
  );
}

function ProviderPreview({ cutoverId, summary }: { cutoverId: string; summary: ProviderPlanSummary }) {
  const name = PROVIDER_NAMES[summary.provider];
  const p = summary.provider;
  if (summary.skipped) {
    return (
      <div className="cutover-provider">
        <h3>{name}</h3>
        <p className="backup-meta">{summary.skipped}. Back it up above to include it.</p>
      </div>
    );
  }
  const idShare = summary.matched ? Math.round((summary.matchedByIdentifier / summary.matched) * 100) : 0;

  return (
    <div className="cutover-provider">
      <h3>{name}</h3>
      <p className="backup-meta">
        {summary.remoteCards.toLocaleString()} cards in the backup of {new Date(summary.backupAt!).toLocaleString()}
        {summary.groups > 0 && <>, plus {summary.groups} groups</>}.
        {' '}{summary.matched.toLocaleString()} match a Yello contact ({idShare}% by their ID, the rest by email, phone or name).
      </p>
      {summary.unreadable.length > 0 && (
        <p className="backup-error">{summary.unreadable.length} cards could not be read; they will be left untouched.</p>
      )}

      <h4>Coming into Yello</h4>
      <Row label={`changes to existing contacts (${summary.updates.contacts.toLocaleString()} contacts)`} count={summary.updates.fields}>
        <ItemList cutoverId={cutoverId} kind="update" provider={p} total={summary.updates.fields} />
      </Row>
      <Row label="new contacts" count={summary.imports}>
        <ItemList cutoverId={cutoverId} kind="import" provider={p} total={summary.imports} />
      </Row>
      <Row label="conflicts to decide (changed in both places)" count={summary.conflicts}>
        <ItemList cutoverId={cutoverId} kind="conflict" provider={p} total={summary.conflicts} />
      </Row>
      <Row label="possible matches to confirm" count={summary.possibleMatches}>
        <ItemList cutoverId={cutoverId} kind="possible_match" provider={p} total={summary.possibleMatches} />
      </Row>
      <Row label="cards to look at (edited recently, but gone from Yello)" count={summary.restoreReview}>
        <ItemList cutoverId={cutoverId} kind="restore_review" provider={p} total={summary.restoreReview} />
      </Row>

      <h4>Removed from {name}</h4>
      <Row label="duplicates of a Yello contact" count={summary.deletes.mergedDuplicates}>
        <ItemList cutoverId={cutoverId} kind="merged_duplicate" provider={p} total={summary.deletes.mergedDuplicates} />
      </Row>
      <Row label="removed in your cleanup, old remote-only, or archived in Yello"
        count={summary.deletes.removedInCleanup + summary.deletes.oldRemoteOnly + summary.deletes.archivedInYello}>
        <ItemList cutoverId={cutoverId} kind="delete_remote" provider={p}
          total={summary.deletes.removedInCleanup + summary.deletes.oldRemoteOnly + summary.deletes.archivedInYello} />
      </Row>

      <h4>Written to {name}</h4>
      <Row label="new cards for Yello contacts not there yet" count={summary.creates} />
      <Row label="cards updated to Yello’s version" count={summary.pushUpdates} />
    </div>
  );
}

/**
 * The cutover dry run: what switching to Yello would do to each address book,
 * computed from the latest backups. Read-only.
 */
export function CutoverPreviewContent() {
  const [windowDays, setWindowDays] = useState(90);
  const { data } = useLatestCutover();
  const startPlan = useStartCutoverPlan();
  const { showToast } = useToast();
  const cutover = data?.cutover ?? null;
  const planning = cutover?.status === 'planning' || startPlan.isPending;
  const summary = cutover?.status === 'planned' ? cutover.summary : null;

  return (
    <>
      <p className="settings-description">
        See what switching to Yello would do before anything happens. Yello’s cleaned-up list stays the base:
        only contacts changed or added on your phone or in Gmail within the period below come in, and
        everything else in iCloud and Google is replaced by Yello’s version. This preview changes nothing.
      </p>

      <div className="cutover-controls">
        <label>
          Bring in changes from the last{' '}
          <select value={windowDays} onChange={e => setWindowDays(Number(e.target.value))} disabled={planning}>
            {WINDOWS.map(w => <option key={w.days} value={w.days}>{w.label}</option>)}
          </select>
        </label>
        <Button
          size="sm"
          icon="magnifying-glass-chart"
          loading={planning}
          onClick={() => startPlan.mutate(windowDays, { onError: error => showToast(error.message, { type: 'error' }) })}
        >
          {summary ? 'Preview again' : 'Preview'}
        </Button>
      </div>

      {cutover?.status === 'failed' && <p className="backup-error">{cutover.error}</p>}

      {summary && cutover && (
        <>
          <p className="backup-meta">
            Prepared {new Date(summary.generatedAt).toLocaleString()} with changes since{' '}
            {new Date(summary.windowStart).toLocaleDateString()}. Yello has {summary.yello.active.toLocaleString()} contacts
            ({summary.yello.archived.toLocaleString()} archived).
          </p>
          {summary.yello.groupCards > 0 && (
            <Row label="Apple groups that were imported as contacts (they will be archived)" count={summary.yello.groupCards}>
              <ItemList cutoverId={cutover.id} kind="group_card" total={summary.yello.groupCards} />
            </Row>
          )}
          {(['icloud', 'google'] as const).map(provider => (
            <ProviderPreview key={provider} cutoverId={cutover.id} summary={summary.providers[provider]} />
          ))}
          <p className="backup-meta">
            Nothing has been changed. Reviewing these lists and applying the switch come in a later step.
          </p>
        </>
      )}
    </>
  );
}

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
  new_in_window: 'new or edited recently',
};

/** Plain-English names for the normalised types in a projection. */
const TYPE_LABELS: Record<string, string> = {
  cell: 'mobile', iphone: 'iPhone', home: 'home', work: 'work', other: 'other', main: 'main',
  fax: 'fax', pager: 'pager', homepage: 'homepage',
};

function typeLabel(type: unknown): string | null {
  if (typeof type !== 'string' || !type) return null;
  if (type.startsWith('label:')) return type.slice('label:'.length);
  return TYPE_LABELS[type] ?? type;
}

const withType = (text: string, type: unknown) => {
  const label = typeLabel(type);
  return label ? `${text} (${label})` : text;
};

/**
 * vCard dates as people read them: `--08-08` (no year) → "8 August",
 * `1990-08-08` → "8 August 1990".
 */
function formatDate(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '');
  const noYear = value.match(/^--(\d{2})-(\d{2})$/);
  const full = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const [year, month, day] = noYear ? [2000, noYear[1], noYear[2]] : full ? [Number(full[1]), full[2], full[3]] : [];
  if (!month) return value;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const text = date.toLocaleDateString(undefined, {
    day: 'numeric', month: 'long', ...(noYear ? {} : { year: 'numeric' }), timeZone: 'UTC',
  });
  return noYear ? `${text} (no year)` : text;
}

type Entry = Record<string, unknown>;
const joined = (...parts: unknown[]) => parts.filter(p => typeof p === 'string' && p).join(', ');

/** One entry of a multi-value field as short text. */
function formatEntry(field: string, entry: unknown): string {
  if (typeof entry !== 'object' || entry === null) return String(entry);
  const e = entry as Entry;
  switch (field) {
    case 'emails':
    case 'phones':
    case 'urls':
      return withType(String(e.value), e.type);
    case 'addresses':
      return withType(joined(e.street, e.extended, e.poBox, e.city, e.region, e.postalCode, e.country) || '(empty address)', e.type);
    case 'socials':
      return `${e.platform}: ${e.value}`;
    case 'ims':
      return `${e.service}: ${e.handle}`;
    case 'related':
      return e.relation ? `${e.name} (${typeLabel(e.relation)})` : String(e.name);
    case 'dates':
      return e.label ? `${formatDate(e.date)} (${typeLabel(e.label)})` : formatDate(e.date);
    default:
      return Object.values(e).filter(Boolean).join(' · ');
  }
}

/** A projected field value as short text; null when the field is empty. */
function formatValue(field: string | null, value: unknown): string | null {
  if (value === null || value === undefined || value === false) return null;
  if (Array.isArray(value)) {
    return value.length ? value.map(entry => formatEntry(field ?? '', entry)).join('; ') : null;
  }
  if (field === 'birthday') return formatDate(value);
  if (field === 'isCompany') return value ? 'shown as a company' : null;
  if (field === 'name' && typeof value === 'object') {
    const n = value as Entry;
    return [n.prefix, n.first, n.middle, n.last, n.suffix].filter(Boolean).join(' ') || (n.display as string) || null;
  }
  if (field === 'org' && typeof value === 'object') {
    const o = value as Entry;
    const company = joined(o.company, o.department);
    if (o.title && company) return `${o.title}, ${company}`;
    return (o.title as string) || company || null;
  }
  if (typeof value === 'object') return Object.values(value as Entry).filter(Boolean).join(' · ') || null;
  return String(value);
}

function formatWhen(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
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
  const where = item.provider ? PROVIDER_NAMES[item.provider] : 'the address book';
  const edited = formatWhen(item.remoteTs);

  if (item.kind === 'update' || item.kind === 'conflict') {
    const field = FIELD_LABELS[item.field ?? ''] ?? item.field;
    const yello = formatValue(item.field, item.yelloValue);
    const remote = formatValue(item.field, item.remoteValue);
    let change: React.ReactNode;
    if (item.kind === 'conflict') {
      const pick = item.suggested === 'remote' ? `${where}’s (edited more recently)` : 'Yello’s';
      change = (
        <>
          Yello has <q>{yello ?? 'nothing'}</q>, {where} has <q>{remote ?? 'nothing'}</q>.
          <span className="backup-meta"> Suggested: keep {pick}.</span>
        </>
      );
    } else if (item.reason === 'added_remotely') {
      change = <>add <q>{remote}</q> <span className="backup-meta">(added in {where})</span></>;
    } else if (item.reason === 'filled_remotely' || !yello) {
      change = <>empty in Yello → <q>{remote ?? 'nothing'}</q> <span className="backup-meta">(from {where})</span></>;
    } else {
      change = <><q>{yello}</q> → <q>{remote ?? 'nothing'}</q> <span className="backup-meta">(changed in {where})</span></>;
    }
    return (
      <li>
        <strong>{name}</strong> — {field}: {change}
        {edited && <span className="backup-meta"> Card edited {edited}.</span>}
      </li>
    );
  }
  if (item.kind === 'possible_match') {
    return (
      <li>
        <strong>{name}</strong> might be Yello’s <q>{String(item.yelloValue ?? '')}</q>
        {item.reason && <span className="backup-meta"> (matched on {item.reason})</span>}
      </li>
    );
  }
  return (
    <li>
      <strong>{name}</strong>
      {item.reason && REASON_LABELS[item.reason] && <span className="backup-meta"> — {REASON_LABELS[item.reason]}</span>}
      {edited && (item.kind === 'import' || item.kind === 'restore_review') && <span className="backup-meta">, edited {edited}</span>}
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

import { createContext, useContext, useState } from 'react';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';
import {
  useApplyCutover,
  useCutoverItems,
  useLatestCutover,
  useRemoteBackups,
  useResolveAllCutoverItems,
  useResolveCutoverItems,
  useStartCutoverPlan,
  useSyncStatus,
  type BackupProvider,
  type CutoverItem,
  type CutoverItemKind,
  type CutoverRecord,
  type CutoverSummary,
  type ProviderPlanSummary,
} from '../api/syncHooks';

/** The preview being shown, and whether its choices can still be changed. */
const ReviewContext = createContext<{ cutoverId: string; editable: boolean }>({ cutoverId: '', editable: false });

/** What each choice does, in the reviewer's words. */
function choiceLabel(choice: string, where: string): string {
  switch (choice) {
    case 'apply': return 'Take it';
    case 'skip': return 'Keep Yello’s';
    case 'yello': return 'Keep Yello’s';
    case 'remote': return `Take ${where}’s`;
    case 'import': return 'Bring into Yello';
    case 'same': return 'Same person: remove this card';
    case 'delete': return `Remove from ${where}`;
    case 'restore': return 'Keep it (restore in Yello)';
    case 'archive': return 'Archive in Yello';
    case 'keep': return 'Keep as a contact';
    default: return choice;
  }
}

function ChoiceSelect({ item }: { item: CutoverItem }) {
  const { cutoverId, editable } = useContext(ReviewContext);
  const resolve = useResolveCutoverItems(cutoverId);
  const { showToast } = useToast();
  if (!item.choices.length) return null;
  const where = item.provider ? PROVIDER_NAMES[item.provider] : 'Yello';
  if (!editable) return <span className="cutover-choice-done"> → {choiceLabel(item.effective ?? '', where)}</span>;
  return (
    <select
      className="cutover-choice"
      aria-label={`What to do with ${item.displayName}`}
      value={item.effective ?? ''}
      disabled={resolve.isPending}
      onChange={e => resolve.mutate([{ id: item.id, resolution: e.target.value }], {
        onError: error => showToast(error.message, { type: 'error' }),
      })}
    >
      {item.choices.map(choice => <option key={choice} value={choice}>{choiceLabel(choice, where)}</option>)}
    </select>
  );
}

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

function ItemList({ kind, provider, total }: {
  kind: CutoverItemKind;
  provider?: BackupProvider;
  total: number;
}) {
  const { cutoverId } = useContext(ReviewContext);
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
        <ChoiceSelect item={item} />
      </li>
    );
  }
  if (item.kind === 'possible_match') {
    return (
      <li>
        <strong>{name}</strong> might be Yello’s <q>{String(item.yelloValue ?? '')}</q>
        {item.reason && <span className="backup-meta"> (matched on {item.reason})</span>}
        <ChoiceSelect item={item} />
      </li>
    );
  }
  return (
    <li>
      <strong>{name}</strong>
      {item.reason && REASON_LABELS[item.reason] && <span className="backup-meta"> — {REASON_LABELS[item.reason]}</span>}
      {edited && (item.kind === 'import' || item.kind === 'restore_review') && <span className="backup-meta">, edited {edited}</span>}
      <ChoiceSelect item={item} />
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

function ProviderPreview({ summary }: { summary: ProviderPlanSummary }) {
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
        <ItemList kind="update" provider={p} total={summary.updates.fields} />
      </Row>
      <Row label="new contacts" count={summary.imports}>
        <ItemList kind="import" provider={p} total={summary.imports} />
      </Row>
      <Row label="conflicts to decide (changed in both places)" count={summary.conflicts}>
        <ItemList kind="conflict" provider={p} total={summary.conflicts} />
      </Row>
      <Row label="possible matches to confirm" count={summary.possibleMatches}>
        <ItemList kind="possible_match" provider={p} total={summary.possibleMatches} />
      </Row>
      <Row label="cards to look at (edited recently, but gone from Yello)" count={summary.restoreReview}>
        <ItemList kind="restore_review" provider={p} total={summary.restoreReview} />
      </Row>

      <h4>Removed from {name}</h4>
      <Row label="duplicates of a Yello contact" count={summary.deletes.mergedDuplicates}>
        <ItemList kind="merged_duplicate" provider={p} total={summary.deletes.mergedDuplicates} />
      </Row>
      <Row label="removed in your cleanup, old remote-only, or archived in Yello"
        count={summary.deletes.removedInCleanup + summary.deletes.oldRemoteOnly + summary.deletes.archivedInYello}>
        <ItemList kind="delete_remote" provider={p}
          total={summary.deletes.removedInCleanup + summary.deletes.oldRemoteOnly + summary.deletes.archivedInYello} />
      </Row>

      <h4>Written to {name}</h4>
      <Row label="new cards for Yello contacts not there yet" count={summary.creates} />
      <Row label="cards updated to Yello’s version" count={summary.pushUpdates} />
    </div>
  );
}

const PHASE_LABELS: Record<string, string> = {
  pushedCreated: 'created', pushedUpdated: 'updated', pushedDeleted: 'removed',
  pulledCreated: 'brought in', pulledUpdated: 'changes brought in', pulledArchived: 'archived', conflicts: 'conflicts'
};

function ApplyPanel({ cutover, summary, applying }: { cutover: CutoverRecord; summary: CutoverSummary; applying: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [promised, setPromised] = useState(false);
  const status = useSyncStatus();
  const backups = useRemoteBackups();
  const apply = useApplyCutover(cutover.id);
  const acceptAll = useResolveAllCutoverItems(cutover.id);
  const { showToast } = useToast();

  const included = (['icloud', 'google'] as const).filter(p => !summary.providers[p].skipped);
  const gates = included.map(p => ({ provider: p, gate: backups.data?.gates[p] }));
  const gatesOpen = gates.every(g => g.gate?.allowed);
  const engineOn = status.data?.engineEnabled ?? false;
  const totals = included.reduce((acc, p) => {
    const s = summary.providers[p];
    acc.removed += s.deletes.total;
    acc.written += s.creates + s.pushUpdates;
    acc.incoming += s.updates.contacts + s.imports;
    return acc;
  }, { removed: 0, written: 0, incoming: 0 });

  if (cutover.status === 'done') {
    return (
      <div className="cutover-apply cutover-apply--done">
        <h3>Done: Yello is now the source of truth</h3>
        {included.map(p => {
          const counters = summary.apply?.results[p]?.counters;
          return counters && (
            <p key={p} className="backup-meta">
              {PROVIDER_NAMES[p]}: {Object.entries(counters).filter(([, n]) => n > 0).map(([k, n]) => `${n.toLocaleString()} ${PHASE_LABELS[k] ?? k}`).join(', ') || 'nothing to change'}.
            </p>
          );
        })}
        <ol className="cutover-next">
          {included.includes('google') && included.includes('icloud') && (
            <li>Turn off Contacts for your Google account on your iPhone (Settings › Apps › Contacts › Accounts › Gmail) and Mac (System Settings › Internet Accounts › Google), so nothing shows twice.</li>
          )}
          <li>Edit a test contact on your phone and in Yello and check the change arrives on the other side after a sync.</li>
          <li>Keep your backups for at least 90 days.</li>
        </ol>
      </div>
    );
  }

  if (applying || cutover.status === 'applying' || (cutover.status === 'pushing' && apply.isPending)) {
    return (
      <div className="cutover-apply">
        <h3>Switching…</h3>
        <p className="backup-meta">
          Yello is updating your contacts and writing to {included.map(p => PROVIDER_NAMES[p]).join(' and ')}. This can take a while
          (Google takes about a second per change). You can leave this page; it keeps going. Please don’t edit contacts on your phone or in Gmail until it is done.
        </p>
      </div>
    );
  }

  if (cutover.status === 'pushing') {
    return (
      <div className="cutover-apply">
        <h3>Not finished yet</h3>
        <p className="backup-error">{cutover.error ?? 'The first sync did not complete.'}</p>
        <Button variant="primary" icon="rotate-right" loading={apply.isPending}
          onClick={() => apply.mutate(undefined, { onError: error => showToast(error.message, { type: 'error' }) })}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="cutover-apply">
      <h3>Make the switch</h3>
      <p className="backup-meta">
        Each list above shows what will happen with its suggested choice; change any item there.{' '}
        <Button variant="ghost" size="sm" icon="arrow-rotate-left" loading={acceptAll.isPending}
          onClick={() => acceptAll.mutate({ resolution: null }, { onError: error => showToast(error.message, { type: 'error' }) })}>
          Reset every choice to the suggestion
        </Button>
      </p>
      <ul className="cutover-checklist">
        {gates.map(({ provider, gate }) => (
          <li key={provider} className={gate?.allowed ? 'ok' : 'todo'}>
            {gate?.allowed ? `${PROVIDER_NAMES[provider]} is backed up and confirmed.` : gate?.reason ?? 'Checking the backup…'}
          </li>
        ))}
        <li className={promised ? 'ok' : 'todo'}>
          <label>
            <input type="checkbox" checked={promised} onChange={e => setPromised(e.target.checked)} />{' '}
            I won’t edit contacts on my phone, Mac or in Gmail until the switch is done.
          </label>
        </li>
      </ul>
      {!engineOn && <p className="backup-meta">The switch is not enabled on this server yet (SYNC_ENGINE=1).</p>}
      {cutover.error && <p className="backup-error">{cutover.error}</p>}
      <Button variant="primary" icon="right-left" disabled={!gatesOpen || !promised || !engineOn} onClick={() => setConfirming(true)}>
        Switch to Yello
      </Button>

      {confirming && (
        <ConfirmDialog
          title="Switch to Yello?"
          danger
          confirmLabel="Switch now"
          confirmDisabled={apply.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => apply.mutate(undefined, {
            onSuccess: () => setConfirming(false),
            onError: error => { setConfirming(false); showToast(error.message, { type: 'error' }); },
          })}
        >
          <p>
            {totals.incoming.toLocaleString()} contacts in Yello get changes or are added,{' '}
            {totals.written.toLocaleString()} cards are written to {included.map(p => PROVIDER_NAMES[p]).join(' and ')}, and{' '}
            <strong>{totals.removed.toLocaleString()} are removed there</strong>. From then on Yello keeps them in sync.
          </p>
          <p className="backup-meta">Everything removed or overwritten stays in your backups and can be restored.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/**
 * The cutover: a preview of what switching to Yello would do to each address
 * book, computed from the latest backups, then the review of its lists and
 * the switch itself.
 */
export function CutoverPreviewContent() {
  const [windowDays, setWindowDays] = useState(90);
  const { data } = useLatestCutover();
  const startPlan = useStartCutoverPlan();
  const { showToast } = useToast();
  const cutover = data?.cutover ?? null;
  const planning = cutover?.status === 'planning' || startPlan.isPending;
  const summary = cutover && cutover.status !== 'planning' && cutover.status !== 'failed' ? cutover.summary : null;
  const editable = cutover?.status === 'planned' && !data?.applying;
  const settled = cutover?.status === 'done' || cutover?.status === 'pushing' || cutover?.status === 'applying';

  return (
    <>
      <p className="settings-description">
        See what switching to Yello would do before anything happens. Yello’s cleaned-up list stays the base:
        only contacts changed or added on your phone or in Gmail within the period below come in, and
        everything else in iCloud and Google is replaced by Yello’s version. The preview itself changes nothing.
      </p>

      {!settled && (
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
      )}

      {cutover?.status === 'failed' && <p className="backup-error">{cutover.error}</p>}

      {summary && cutover && (
        <ReviewContext.Provider value={{ cutoverId: cutover.id, editable }}>
          <p className="backup-meta">
            Prepared {new Date(summary.generatedAt).toLocaleString()} with changes since{' '}
            {new Date(summary.windowStart).toLocaleDateString()}. Yello has {summary.yello.active.toLocaleString()} contacts
            ({summary.yello.archived.toLocaleString()} archived).
          </p>
          {summary.yello.groupCards > 0 && (
            <Row label="Apple groups that were imported as contacts (they will be archived)" count={summary.yello.groupCards}>
              <ItemList kind="group_card" total={summary.yello.groupCards} />
            </Row>
          )}
          {(['icloud', 'google'] as const).map(provider => (
            <ProviderPreview key={provider} summary={summary.providers[provider]} />
          ))}
          <ApplyPanel cutover={cutover} summary={summary} applying={!!data?.applying} />
        </ReviewContext.Provider>
      )}
    </>
  );
}

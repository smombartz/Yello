import { createContext, useContext, useState } from 'react';
import { Icon } from './Icon';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';
import { useGoogleContactsStatus } from '../api/googleContactsHooks';
import {
  useApplyCutover,
  useCutoverItems,
  useCutoverSections,
  useCutoverTally,
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
  type TallyRow,
} from '../api/syncHooks';

/** The preview being shown, and whether its choices can still be changed. */
const ReviewContext = createContext<{
  cutoverId: string;
  editable: boolean;
  /** The choices of each item kind (the backend's RESOLUTIONS). */
  choices: Partial<Record<CutoverItemKind, string[]>>;
}>({ cutoverId: '', editable: false, choices: {} });

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

/** One dropdown for all of a contact's items in a list; changing it sets every one of them. */
function GroupChoice({ items }: { items: CutoverItem[] }) {
  const { cutoverId, editable } = useContext(ReviewContext);
  const resolve = useResolveCutoverItems(cutoverId);
  const { showToast } = useToast();
  const choices = items[0]?.choices ?? [];
  if (!choices.length) return null;
  const where = items[0].provider ? PROVIDER_NAMES[items[0].provider] : 'Yello';
  const values = new Set(items.map(i => i.effective ?? ''));
  const value = values.size === 1 ? [...values][0] : '';
  if (!editable) {
    return <span className="cutover-choice-done">→ {value ? choiceLabel(value, where) : 'mixed'}</span>;
  }
  return (
    <select
      className="cutover-choice"
      aria-label={`What to do with ${items[0].displayName}`}
      value={value}
      disabled={resolve.isPending}
      onChange={e => resolve.mutate(items.map(i => ({ id: i.id, resolution: e.target.value })), {
        onError: error => showToast(error.message, { type: 'error' }),
      })}
    >
      {!value && <option value="" disabled>Mixed</option>}
      {choices.map(choice => <option key={choice} value={choice}>{choiceLabel(choice, where)}</option>)}
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

function ItemList({ kind, provider }: { kind: CutoverItemKind; provider?: BackupProvider }) {
  const { cutoverId } = useContext(ReviewContext);
  const { data, isLoading } = useCutoverItems(cutoverId, { kind, provider }, true);
  const groups = data ? groupByContact(data.items) : [];

  return (
    <div className="cutover-list">
      {isLoading && <p className="backup-meta">Loading…</p>}
      {data && (
        <ul>
          {groups.map(group => <ItemGroup key={group.key} items={group.items} />)}
          {data.total > data.items.length && (
            <li className="backup-meta">…and {(data.total - data.items.length).toLocaleString()} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

/** One dropdown for a whole list: sets every item in it (or returns them all to the suggestions). */
function SectionChoice({ kind, provider }: { kind: CutoverItemKind; provider?: BackupProvider }) {
  const { cutoverId, editable, choices } = useContext(ReviewContext);
  const sections = useCutoverSections(cutoverId);
  const resolveAll = useResolveAllCutoverItems(cutoverId);
  const { showToast } = useToast();
  const options = choices[kind] ?? [];
  const section = sections.data?.sections.find(sec => sec.kind === kind && (sec.provider ?? undefined) === provider);
  if (!options.length || !section) return null;

  const where = provider ? PROVIDER_NAMES[provider] : 'Yello';
  const used = Object.entries(section.choices).filter(([, n]) => n > 0);
  const value = used.length === 1 && used[0][1] === section.total ? used[0][0] : '';
  if (!editable) return <span className="cutover-choice-done">→ {value ? choiceLabel(value, where) : 'mixed'}</span>;

  return (
    <select
      className="cutover-choice cutover-section-choice"
      aria-label="What to do with every item in this list"
      value={value}
      disabled={resolveAll.isPending}
      onChange={e => resolveAll.mutate(
        { kind, provider, resolution: e.target.value === '__suggested__' ? null : e.target.value },
        { onError: error => showToast(error.message, { type: 'error' }) }
      )}
    >
      {!value && <option value="" disabled>Mixed</option>}
      {options.map(choice => <option key={choice} value={choice}>All: {choiceLabel(choice, where)}</option>)}
      {section.suggested < section.total && <option value="__suggested__">All: back to the suggestion</option>}
    </select>
  );
}

/** A list's heading (caret, count, label, its dropdown) that opens onto its items. */
function SectionRow({ label, count, kind, provider }: {
  label: string;
  count: number;
  kind: CutoverItemKind;
  provider?: BackupProvider;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return <Row label={label} count={0} />;
  return (
    <div className="cutover-section">
      <div className="cutover-section-head">
        <button type="button" className="cutover-section-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="chevron-right" className={`cutover-caret${open ? ' open' : ''}`} />
          <span className="cutover-count">{count.toLocaleString()}</span>
          <span>{label}</span>
        </button>
        <SectionChoice kind={kind} provider={provider} />
      </div>
      {open && <ItemList kind={kind} provider={provider} />}
    </div>
  );
}

/** Items about the same Yello contact (or, without one, the same card), in list order. */
function groupByContact(items: CutoverItem[]): Array<{ key: string; items: CutoverItem[] }> {
  const groups = new Map<string, CutoverItem[]>();
  for (const item of items) {
    const key = item.contactId !== null ? `contact-${item.contactId}` : `card-${item.remoteId ?? item.id}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups].map(([key, grouped]) => ({ key, items: grouped }));
}

/** A contact, its choice next to the name, and what differs as sub-bullets. */
function ItemGroup({ items }: { items: CutoverItem[] }) {
  const first = items[0];
  const name = first.displayName || '(no name)';
  const latestEdit = items.map(i => i.remoteTs).filter((t): t is string => !!t).sort().pop() ?? null;
  const edited = formatWhen(latestEdit);
  const showEdited = edited && ['update', 'conflict', 'import', 'restore_review'].includes(first.kind);

  return (
    <li className="cutover-group">
      <div className="cutover-group-name">
        <strong>{name}</strong>
        <GroupChoice items={items} />
      </div>
      <ul className="cutover-sub">
        {items.map(item => <ItemDetail key={item.id} item={item} />)}
        {showEdited && <li className="backup-meta">Card edited {edited}</li>}
      </ul>
    </li>
  );
}

function ItemDetail({ item }: { item: CutoverItem }) {
  const where = item.provider ? PROVIDER_NAMES[item.provider] : 'the address book';

  if (item.kind === 'update' || item.kind === 'conflict') {
    const field = FIELD_LABELS[item.field ?? ''] ?? item.field;
    const yello = formatValue(item.field, item.yelloValue);
    const remote = formatValue(item.field, item.remoteValue);
    const lines: React.ReactNode[] = item.reason === 'added_remotely'
      ? [<>{where} adds <q>{remote}</q></>]
      : [<>Yello has {yello ? <q>{yello}</q> : 'nothing'}</>, <>{where} has {remote ? <q>{remote}</q> : 'nothing'}</>];
    if (item.kind === 'conflict') {
      lines.push(<span className="backup-meta">Changed in both places. Suggested: keep {item.suggested === 'remote' ? `${where}’s (edited more recently)` : 'Yello’s'}</span>);
    }
    return (
      <li>
        {field}:
        <ul className="cutover-sub">
          {lines.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </li>
    );
  }
  if (item.kind === 'possible_match') {
    return (
      <li>
        Might be Yello’s <q>{String(item.yelloValue ?? '')}</q>
        {item.reason && <span className="backup-meta"> (matched on {item.reason})</span>}
      </li>
    );
  }
  const reason = item.reason ? REASON_LABELS[item.reason] : null;
  return reason ? <li>{reason[0].toUpperCase() + reason.slice(1)}</li> : null;
}

function Row({ label, count, children }: { label: string; count: number; children?: React.ReactNode }) {
  return (
    <div className={`cutover-row${count === 0 ? ' cutover-row--zero' : ''}`}>
      <span aria-hidden="true" />
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
      <SectionRow label={`changes to existing contacts (${summary.updates.contacts.toLocaleString()} contacts)`} count={summary.updates.fields} kind="update" provider={p} />
      <SectionRow label="new contacts" count={summary.imports} kind="import" provider={p} />
      <SectionRow label="conflicts to decide (changed in both places)" count={summary.conflicts} kind="conflict" provider={p} />
      <SectionRow label="possible matches to confirm" count={summary.possibleMatches} kind="possible_match" provider={p} />
      <SectionRow label="cards to look at (edited recently, but gone from Yello)" count={summary.restoreReview} kind="restore_review" provider={p} />

      <h4>Removed from {name}</h4>
      <SectionRow label="duplicates of a Yello contact" count={summary.deletes.mergedDuplicates} kind="merged_duplicate" provider={p} />
      <SectionRow label="removed in your cleanup, old remote-only, or archived in Yello" count={summary.deletes.removedInCleanup + summary.deletes.oldRemoteOnly + summary.deletes.archivedInYello} kind="delete_remote" provider={p} />

      <h4>Written to {name}</h4>
      <Row label="new cards for Yello contacts not there yet" count={summary.creates} />
      <Row label="cards updated to Yello’s version" count={summary.pushUpdates} />
    </div>
  );
}

/**
 * What the switch leaves behind, per source, with the current choices:
 * counted by running the switch on a throwaway copy of the database.
 */
function CutoverTallyTable({ cutoverId, summary }: { cutoverId: string; summary: CutoverSummary }) {
  const { data, isFetching, error } = useCutoverTally(cutoverId, true);
  const rows: Array<{ label: string; counts: TallyRow | undefined }> = [
    { label: 'Yello', counts: data?.yello },
    ...(['icloud', 'google'] as const)
      .filter(p => !summary.providers[p].skipped)
      .map(p => ({ label: PROVIDER_NAMES[p], counts: data?.providers[p] })),
  ];

  return (
    <div className="cutover-tally">
      <h3>After the switch {isFetching && <span className="backup-meta">· counting…</span>}</h3>
      {error && <p className="backup-error">{error.message}</p>}
      <table>
        <thead>
          <tr><th scope="col">Contacts</th><th scope="col">Unchanged</th><th scope="col">Updated</th><th scope="col">New</th><th scope="col">Deleted</th></tr>
        </thead>
        <tbody>
          {rows.map(({ label, counts }) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {(['unchanged', 'updated', 'new', 'deleted'] as const).map(column => (
                <td key={column}>{counts ? counts[column].toLocaleString() : '…'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="backup-meta">
        With your current choices. Yello: deleted means archived (Yello never deletes). iCloud and Google:
        updated cards get Yello’s version, new ones are created, deleted ones are removed there.
      </p>
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
  const googleAccess = useGoogleContactsStatus();
  const needsGoogleWrite = included.includes('google');
  const googleWrite = googleAccess.data?.scope === 'write';
  const gatesOpen = gates.every(g => g.gate?.allowed) && (!needsGoogleWrite || googleWrite);
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
        {needsGoogleWrite && (
          <li className={googleWrite ? 'ok' : 'todo'}>
            {googleWrite
              ? 'Yello has full access to your Google Contacts.'
              : <>Yello needs full access to your Google Contacts. <a href="/api/auth/google/contacts?write=1">Grant Google access</a></>}
          </li>
        )}
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
        <ReviewContext.Provider value={{ cutoverId: cutover.id, editable, choices: data?.choices ?? {} }}>
          {summary.carriedChoices && summary.carriedChoices.previous > 0 && (
            <p className="backup-meta">
              {summary.carriedChoices.carried.toLocaleString()} of your {summary.carriedChoices.previous.toLocaleString()} choices
              from the previous preview were kept{summary.carriedChoices.carried < summary.carriedChoices.previous && ' (the rest no longer apply)'}.
            </p>
          )}
          <p className="backup-meta">
            Prepared {new Date(summary.generatedAt).toLocaleString()} with changes since{' '}
            {new Date(summary.windowStart).toLocaleDateString()}. Yello has {summary.yello.active.toLocaleString()} contacts
            ({summary.yello.archived.toLocaleString()} archived).
          </p>
          {summary.yello.groupCards > 0 && (
            <SectionRow label="Apple groups that were imported as contacts (they will be archived)" count={summary.yello.groupCards} kind="group_card" />
          )}
          {(['icloud', 'google'] as const).map(provider => (
            <ProviderPreview key={provider} summary={summary.providers[provider]} />
          ))}
          <ApplyPanel cutover={cutover} summary={summary} applying={!!data?.applying} />
          {cutover.status === 'planned' && <CutoverTallyTable cutoverId={cutover.id} summary={summary} />}
        </ReviewContext.Provider>
      )}
    </>
  );
}

import { useState } from 'react';
import { Icon, type IconName } from './Icon';
import { Avatar } from './Avatar';
import { Pagination } from './ui/Pagination';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { EmptyState } from './ui/EmptyState';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { useToast } from './ui/Toast';
import {
  useContactKindSummary,
  useContactKindSuggestions,
  useApplyContactKind,
  useApplyAllContactKinds
} from '../api/contactKindCleanupHooks';
import type { ContactKind, ContactKindSuggestion, SuggestedKind } from '../api/types';

const PAGE_SIZE = 50;

const KIND_LABEL: Record<ContactKind, string> = { person: 'Person', company: 'Company', generic: 'Generic' };

const FILTERS: { kind: SuggestedKind | null; label: string; icon: IconName }[] = [
  { kind: null, label: 'All', icon: 'list' },
  { kind: 'company', label: 'Company', icon: 'building' },
  { kind: 'generic', label: 'Generic', icon: 'address-card' },
];

interface SuggestionRowProps {
  suggestion: ContactKindSuggestion;
  onApply: (kind: ContactKind) => void;
  onSkip: () => void;
  disabled: boolean;
}

function SuggestionRow({ suggestion, onApply, onSkip, disabled }: SuggestionRowProps) {
  const suggested = suggestion.suggestedKind;
  const other: SuggestedKind = suggested === 'company' ? 'generic' : 'company';
  const subtitle = [suggestion.title, suggestion.company !== suggestion.displayName ? suggestion.company : null, suggestion.primaryEmail]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="card kind-suggestion-row">
      <Avatar photoUrl={suggestion.photoUrl} name={suggestion.displayName} kind={suggested} size={40} />
      <div className="kind-suggestion-info">
        <div className="kind-suggestion-name">
          {suggestion.displayName}
          <Badge variant={suggestion.confidence === 'strong' ? 'brand' : 'neutral'}>
            {suggestion.confidence === 'strong' ? KIND_LABEL[suggested] : `Maybe ${KIND_LABEL[suggested].toLowerCase()}`}
          </Badge>
        </div>
        {subtitle && <div className="kind-suggestion-subtitle">{subtitle}</div>}
        <div className="kind-suggestion-reasons">{suggestion.reasons.join(' · ')}</div>
      </div>
      <div className="kind-suggestion-actions">
        <Button size="sm" variant="ghost" onClick={onSkip} disabled={disabled}>Skip</Button>
        <Button size="sm" onClick={() => onApply('person')} disabled={disabled}>Person</Button>
        <Button size="sm" onClick={() => onApply(other)} disabled={disabled}>{KIND_LABEL[other]}</Button>
        <Button size="sm" variant="primary" icon={suggested === 'company' ? 'building' : 'address-card'} onClick={() => onApply(suggested)} disabled={disabled}>
          {KIND_LABEL[suggested]}
        </Button>
      </div>
    </div>
  );
}

/**
 * Cleanup's "Company or Generic" tab: contacts the keyword rules think are a
 * company or generic (backend/src/services/contactKindSuggestions.ts). Skip
 * hides a row until the page reloads; it isn't saved.
 */
export function ContactKindCleanup() {
  const { showToast } = useToast();
  const [filter, setFilter] = useState<SuggestedKind | null>(null);
  const [page, setPage] = useState(1);
  // Skipped rows and their suggested kind, so each filter's count leaves out its own
  const [skipped, setSkipped] = useState<Map<number, SuggestedKind>>(new Map());
  const [showApplyAll, setShowApplyAll] = useState(false);

  const { data: summary } = useContactKindSummary();
  const { data, isLoading, isFetching } = useContactKindSuggestions(filter, page, PAGE_SIZE);
  const applyMutation = useApplyContactKind();
  const applyAllMutation = useApplyAllContactKinds();
  const busy = applyMutation.isPending || applyAllMutation.isPending;

  const contacts = (data?.contacts ?? []).filter(c => !skipped.has(c.id));
  const skippedHere = (data?.contacts ?? []).length - contacts.length;
  const skippedInFilter = [...skipped.values()].filter(kind => !filter || kind === filter).length;
  const total = Math.max(0, (data?.total ?? 0) - skippedInFilter);
  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  const changeFilter = (kind: SuggestedKind | null) => {
    setFilter(kind);
    setPage(1);
  };

  const apply = (suggestion: ContactKindSuggestion, kind: ContactKind) => {
    applyMutation.mutate([{ id: suggestion.id, kind }], {
      onSuccess: () => showToast(`${suggestion.displayName} marked as ${KIND_LABEL[kind].toLowerCase()}`),
      onError: () => showToast('Could not save the change', { type: 'error' }),
    });
  };

  const skip = (suggestion: ContactKindSuggestion) =>
    setSkipped(prev => new Map(prev).set(suggestion.id, suggestion.suggestedKind));

  const applyAll = () => {
    setShowApplyAll(false);
    applyAllMutation.mutate({ kind: filter, excludeIds: [...skipped.keys()] }, {
      onSuccess: ({ updated }) => {
        showToast(`Marked ${updated} contact${updated !== 1 ? 's' : ''} as suggested`);
        setPage(1);
      },
      onError: () => showToast('Could not save the changes', { type: 'error' }),
    });
  };

  const countFor = (kind: SuggestedKind | null) => (kind ? summary?.[kind] : summary?.total) ?? 0;
  const scope = filter ? `${KIND_LABEL[filter].toLowerCase()} suggestion` : 'suggestion';

  return (
    <div className="normalize-view kind-cleanup">
      <div className="normalize-description">
        <p>
          Contacts that look like a company (a business name, "GmbH", info@) or generic, neither a person
          nor a company (Front Desk, Support line, noreply@). Companies sync to iCloud as Show as Company;
          Generic is Yello's own and syncs as a normal card. Skip hides a contact until you reload.
        </p>
      </div>

      <div className="address-subtabs">
        {FILTERS.map(f => (
          <button
            key={f.label}
            className={`address-subtab ${filter === f.kind ? 'active' : ''}`}
            onClick={() => changeFilter(f.kind)}
          >
            <Icon name={f.icon} />
            {f.label}
            {countFor(f.kind) > 0 && <span className="subtab-badge">{countFor(f.kind)}</span>}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner message="Looking for companies and generic contacts..." />
      ) : total === 0 && !isFetching ? (
        <EmptyState icon="circle-check" title="Nothing to suggest" />
      ) : (
        <>
          <div className="normalize-header">
            <div className="normalize-stats">
              {total} {scope}{total !== 1 ? 's' : ''}
            </div>
            <Button
              variant="primary"
              icon="wand-magic-sparkles"
              onClick={() => setShowApplyAll(true)}
              disabled={busy || total === 0}
              loading={applyAllMutation.isPending}
            >
              Mark all {total} as suggested
            </Button>
          </div>

          <div className="kind-suggestion-list">
            {contacts.map(suggestion => (
              <SuggestionRow
                key={suggestion.id}
                suggestion={suggestion}
                onApply={kind => apply(suggestion, kind)}
                onSkip={() => skip(suggestion)}
                disabled={busy}
              />
            ))}
            {contacts.length === 0 && skippedHere > 0 && (
              <p className="kind-suggestion-skipped">Everything on this page is skipped.</p>
            )}
          </div>

          {totalPages > 1 && (
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} isLoading={isFetching} />
          )}
        </>
      )}

      {showApplyAll && (
        <ConfirmDialog
          title={`Mark ${total} contact${total !== 1 ? 's' : ''} as suggested?`}
          message={`Each ${scope} is marked as its suggested kind${skippedInFilter ? `, leaving out the ${skippedInFilter} you skipped` : ''}. Companies are sent to iCloud as Show as Company. You can change any contact back from its edit form.`}
          confirmLabel="Mark all"
          onConfirm={applyAll}
          onCancel={() => setShowApplyAll(false)}
        />
      )}
    </div>
  );
}

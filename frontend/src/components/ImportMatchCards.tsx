import { Icon } from './Icon';
import type { IncomingMatch, ParsedContact } from '../api/icloudHooks';

/**
 * Shared match/new-contact cards for the iCloud and Google import flows.
 * (Both flows use structurally identical data; only the source label differs.)
 */

export type MatchDecision = 'merge' | 'new' | 'skip';

const CONFIDENCE_COLORS: Record<string, string> = {
  very_high: 'var(--ds-color-success)',
  high: 'var(--ds-color-warning)',
  medium: 'var(--ds-color-info)',
};

export function MatchCard({
  match,
  index,
  decision,
  onDecisionChange,
  sourceLabel,
}: {
  match: IncomingMatch;
  index: number;
  decision: MatchDecision;
  onDecisionChange: (index: number, decision: MatchDecision) => void;
  /** Label for the incoming side, e.g. "iCloud" or "Google" */
  sourceLabel: string;
}) {
  return (
    <div className={`icloud-match-card ${decision === 'skip' ? 'skipped' : ''}`}>
      <div className="icloud-match-header">
        <span
          className="icloud-confidence-badge"
          style={{ backgroundColor: CONFIDENCE_COLORS[match.confidence] }}
        >
          {match.confidence.replace('_', ' ')}
        </span>
        <div className="icloud-match-reasons">
          {match.matchReasons.map((reason, i) => (
            <span key={i} className="icloud-reason-tag">{reason}</span>
          ))}
        </div>
      </div>
      <div className="icloud-match-comparison">
        <div className="icloud-match-side">
          <div className="icloud-match-label">{sourceLabel}</div>
          <div className="icloud-match-name">{match.incoming.displayName}</div>
          {match.incoming.emails[0] && (
            <div className="icloud-match-detail">{match.incoming.emails[0].email}</div>
          )}
          {match.incoming.phones[0] && (
            <div className="icloud-match-detail">{match.incoming.phones[0].phoneDisplay || match.incoming.phones[0].phone}</div>
          )}
          {match.incoming.company && (
            <div className="icloud-match-detail">{match.incoming.company}</div>
          )}
        </div>
        <div className="icloud-match-divider">
          <Icon name="arrows-left-right" />
        </div>
        <div className="icloud-match-side">
          <div className="icloud-match-label">Existing</div>
          <div className="icloud-match-name">{match.existingDisplayName}</div>
        </div>
      </div>
      <div className="icloud-match-actions">
        <button
          type="button"
          className={`icloud-action-btn ${decision === 'merge' ? 'active' : ''}`}
          onClick={() => onDecisionChange(index, 'merge')}
        >
          <Icon name="code-merge" /> Merge
        </button>
        <button
          type="button"
          className={`icloud-action-btn ${decision === 'new' ? 'active' : ''}`}
          onClick={() => onDecisionChange(index, 'new')}
        >
          <Icon name="plus" /> Import as New
        </button>
        <button
          type="button"
          className={`icloud-action-btn ${decision === 'skip' ? 'active' : ''}`}
          onClick={() => onDecisionChange(index, 'skip')}
        >
          <Icon name="forward" /> Skip
        </button>
      </div>
    </div>
  );
}

export function NewContactCard({
  contact,
  selected,
  onToggle,
}: {
  contact: ParsedContact;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`icloud-new-contact-card ${selected ? '' : 'deselected'}`} onClick={onToggle}>
      <input type="checkbox" checked={selected} onChange={onToggle} />
      <div className="icloud-new-contact-info">
        <div className="icloud-match-name">{contact.displayName}</div>
        {contact.emails[0] && (
          <div className="icloud-match-detail">{contact.emails[0].email}</div>
        )}
        {contact.company && (
          <div className="icloud-match-detail">{contact.company}</div>
        )}
      </div>
    </div>
  );
}

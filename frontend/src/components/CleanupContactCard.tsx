import { Avatar } from './Avatar';
import type { CleanupContact } from '../api/types';

interface CleanupContactCardProps {
  contact: CleanupContact;
  isSelected: boolean;
  onToggleSelect: (contactId: number) => void;
}

const ISSUE_BADGES: Record<string, { label: string; className: string }> = {
  truly_empty: { label: 'Truly Empty', className: 'badge-empty' },
  name_only: { label: 'Name Only', className: 'badge-name-only' },
  many_domains: { label: 'Many Domains', className: 'badge-many-domains' },
  same_domain: { label: 'Same Domain', className: 'badge-same-domain' },
};

export function CleanupContactCard({
  contact,
  isSelected,
  onToggleSelect,
}: CleanupContactCardProps) {
  const badge = ISSUE_BADGES[contact.issueType];

  return (
    <div
      className={`cleanup-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onToggleSelect(contact.id)}
      style={{ cursor: 'pointer' }}
    >
      <div className="cleanup-card-checkbox">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(contact.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${contact.displayName || 'unnamed contact'}`}
        />
      </div>

      <div className="cleanup-card-content">
        <div className="cleanup-card-header">
          <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={40} />
          <div className="cleanup-card-name">
            <span className="name">{contact.displayName || '(No name)'}</span>
            {contact.company && <span className="company">{contact.company}</span>}
          </div>
          <span className={`cleanup-badge ${badge.className}`}>
            {badge.label}
          </span>
        </div>

        {contact.issueDetails && (
          <div className="cleanup-card-issue">
            <span className="material-symbols-outlined">info</span>
            <span>{contact.issueDetails}</span>
          </div>
        )}

        {/* Show emails for problematic contacts */}
        {(contact.issueType === 'many_domains' || contact.issueType === 'same_domain') && (
          <div className="cleanup-card-emails">
            {contact.emails.map((email, idx) => (
              <div key={idx} className="cleanup-card-email">
                <span className="material-symbols-outlined">mail</span>
                <span className="value">{email.email}</span>
                {email.type && <span className="type">{email.type}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Show summary for empty contacts */}
        {(contact.issueType === 'truly_empty' || contact.issueType === 'name_only') && (
          <div className="cleanup-card-summary">
            {contact.title && (
              <div className="cleanup-card-field">
                <span className="material-symbols-outlined">work</span>
                <span>{contact.title}</span>
              </div>
            )}
            {contact.notes && (
              <div className="cleanup-card-field">
                <span className="material-symbols-outlined">notes</span>
                <span className="notes-preview">{contact.notes.slice(0, 100)}{contact.notes.length > 100 ? '...' : ''}</span>
              </div>
            )}
            {!contact.title && !contact.notes && contact.issueType === 'truly_empty' && (
              <div className="cleanup-card-field empty">
                <span>No information available</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import type { ContactListItem } from '../api/types';
import { Avatar } from './Avatar';

interface ContactGridCardProps {
  contact: ContactListItem;
  onClick: () => void;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
  selectionEnabled?: boolean;
}

export function ContactGridCard({
  contact,
  onClick,
  isSelected = false,
  onToggleSelect,
  selectionEnabled = false
}: ContactGridCardProps) {
  return (
    <div className={`contact-grid-card ${isSelected ? 'selected' : ''}`} onClick={onClick}>
      {selectionEnabled && (
        <div className="contact-grid-card-checkbox">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect?.(contact.id)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={64} />
      <div className="contact-grid-card-info">
        <div className="contact-grid-card-name">{contact.displayName}</div>
        {contact.company && (
          <div className="contact-grid-card-company">{contact.company}</div>
        )}
      </div>
      <div className="contact-grid-card-details">
        {contact.primaryEmail && (
          <div className="contact-grid-card-detail">
            <span className="material-symbols-outlined">mail</span>
            <span className="value">{contact.primaryEmail}</span>
          </div>
        )}
        {contact.primaryPhone && (
          <div className="contact-grid-card-detail">
            <span className="material-symbols-outlined">call</span>
            <span className="value">{contact.primaryPhone}</span>
          </div>
        )}
      </div>
    </div>
  );
}

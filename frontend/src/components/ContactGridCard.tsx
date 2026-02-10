import type { ContactListItem } from '../api/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

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
    <div className={`card contact-grid-card ${isSelected ? 'selected' : ''}`} onClick={onClick}>
      <Avatar
        photoUrl={contact.photoUrl}
        name={contact.displayName}
        size={64}
        selectable={selectionEnabled}
        isSelected={isSelected}
        onToggleSelect={() => onToggleSelect?.(contact.id)}
      />
      <div className="contact-grid-card-info">
        <div className="contact-grid-card-name">{contact.displayName}</div>
        {contact.company && (
          <div className="contact-grid-card-company">{contact.company}</div>
        )}
      </div>
      <div className="contact-grid-card-details">
        {contact.primaryEmail && (
          <div className="contact-grid-card-detail">
            <Icon name="envelope" />
            <span className="value">{contact.primaryEmail}</span>
          </div>
        )}
        {contact.primaryPhone && (
          <div className="contact-grid-card-detail">
            <Icon name="phone" />
            <span className="value">{contact.primaryPhone}</span>
          </div>
        )}
      </div>
    </div>
  );
}

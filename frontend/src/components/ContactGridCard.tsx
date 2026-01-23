import type { ContactListItem } from '../api/types';
import { Avatar } from './Avatar';

interface ContactGridCardProps {
  contact: ContactListItem;
  onClick: () => void;
}

export function ContactGridCard({ contact, onClick }: ContactGridCardProps) {
  return (
    <div className="contact-grid-card" onClick={onClick}>
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

import { Avatar } from './Avatar';
import type { ContactListItem } from '../api/types';

interface ContactRowProps {
  contact: ContactListItem;
  onClick: (id: number) => void;
  style?: React.CSSProperties;
}

export function ContactRow({ contact, onClick, style }: ContactRowProps) {
  return (
    <div
      className="contact-card"
      onClick={() => onClick(contact.id)}
      style={style}
    >
      <div className="contact-card-main">
        <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={48} />
        <div className="contact-info">
          <h3 className="contact-name">{contact.displayName}</h3>
          {contact.company && (
            <p className="contact-role">{contact.company}</p>
          )}
        </div>
      </div>
      <div className="contact-details">
        {contact.primaryEmail && (
          <div className="contact-detail-item">
            <span className="material-symbols-outlined">mail</span>
            <span>{contact.primaryEmail}</span>
          </div>
        )}
        {contact.primaryPhone && (
          <div className="contact-detail-item">
            <span className="material-symbols-outlined">call</span>
            <span>{contact.primaryPhone}</span>
          </div>
        )}
      </div>
      <div className="contact-actions">
        <button
          className="icon-button"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <span className="material-symbols-outlined">more_vert</span>
        </button>
      </div>
    </div>
  );
}

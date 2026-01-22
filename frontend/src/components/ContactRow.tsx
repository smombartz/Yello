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
      onClick={() => onClick(contact.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 16px',
        gap: '12px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--pico-muted-border-color)',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--pico-card-background-color)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {contact.displayName}
        </div>
        {contact.company && (
          <div style={{ fontSize: '0.875rem', color: 'var(--pico-muted-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {contact.company}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
        {contact.primaryEmail && (
          <div style={{ color: 'var(--pico-muted-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
            {contact.primaryEmail}
          </div>
        )}
        {contact.primaryPhone && (
          <div style={{ color: 'var(--pico-muted-color)' }}>
            {contact.primaryPhone}
          </div>
        )}
      </div>
    </div>
  );
}

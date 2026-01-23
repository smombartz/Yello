import { Avatar } from './Avatar';
import { useContactDetail } from '../api/hooks';
import type { ContactEmail, ContactPhone, ContactAddress } from '../api/types';

interface ContactDetailProps {
  contactId: number;
  onClose: () => void;
}

function EmailList({ emails }: { emails: ContactEmail[] }) {
  if (!emails.length) return null;
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: 'var(--pico-muted-color)' }}>Email</h4>
      {emails.map((email, i) => (
        <div key={i} style={{ marginBottom: '0.25rem' }}>
          <a href={`mailto:${email.email}`}>{email.email}</a>
          {email.type && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--pico-muted-color)' }}>({email.type})</span>}
        </div>
      ))}
    </div>
  );
}

function PhoneList({ phones }: { phones: ContactPhone[] }) {
  if (!phones.length) return null;
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: 'var(--pico-muted-color)' }}>Phone</h4>
      {phones.map((phone, i) => (
        <div key={i} style={{ marginBottom: '0.25rem' }}>
          <a href={`tel:${phone.phone}`}>{phone.phoneDisplay}</a>
          {phone.type && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--pico-muted-color)' }}>({phone.type})</span>}
        </div>
      ))}
    </div>
  );
}

function AddressList({ addresses }: { addresses: ContactAddress[] }) {
  if (!addresses.length) return null;
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: 'var(--pico-muted-color)' }}>Address</h4>
      {addresses.map((addr, i) => {
        const parts = [addr.street, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean);
        if (!parts.length) return null;
        return (
          <div key={i} style={{ marginBottom: '0.5rem' }}>
            <div>{parts.join(', ')}</div>
            {addr.type && <span style={{ fontSize: '0.75rem', color: 'var(--pico-muted-color)' }}>({addr.type})</span>}
          </div>
        );
      })}
    </div>
  );
}

export function ContactDetail({ contactId, onClose }: ContactDetailProps) {
  const { data: contact, isLoading, error } = useContactDetail(contactId);

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '400px',
        maxWidth: '100vw',
        backgroundColor: 'var(--pico-background-color)',
        boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
        overflow: 'auto',
        zIndex: 100,
      }}
    >
      <header style={{ padding: '1rem', borderBottom: '1px solid var(--pico-muted-border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Contact Details</h3>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem' }}
        >
          ×
        </button>
      </header>

      <div style={{ padding: '1.5rem' }}>
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <span aria-busy="true">Loading...</span>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--pico-del-color)' }}>
            Error loading contact: {error.message}
          </div>
        )}

        {contact && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={120} />
              <h2 style={{ margin: '1rem 0 0.25rem' }}>{contact.displayName}</h2>
              {contact.title && <div style={{ color: 'var(--pico-muted-color)' }}>{contact.title}</div>}
              {contact.company && <div style={{ color: 'var(--pico-muted-color)' }}>{contact.company}</div>}
            </div>

            <EmailList emails={contact.emails} />
            <PhoneList phones={contact.phones} />
            <AddressList addresses={contact.addresses} />

            {contact.notes && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: 'var(--pico-muted-color)' }}>Notes</h4>
                <div style={{ whiteSpace: 'pre-wrap' }}>{contact.notes}</div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

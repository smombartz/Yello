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
    <div className="contact-detail-section">
      <h4>Email</h4>
      {emails.map((email, i) => (
        <div key={i} className="contact-detail-item">
          <a href={`mailto:${email.email}`}>{email.email}</a>
          {email.type && <span className="type">({email.type})</span>}
        </div>
      ))}
    </div>
  );
}

function PhoneList({ phones }: { phones: ContactPhone[] }) {
  if (!phones.length) return null;
  return (
    <div className="contact-detail-section">
      <h4>Phone</h4>
      {phones.map((phone, i) => (
        <div key={i} className="contact-detail-item">
          <a href={`tel:${phone.phone}`}>{phone.phoneDisplay}</a>
          {phone.type && <span className="type">({phone.type})</span>}
        </div>
      ))}
    </div>
  );
}

function AddressList({ addresses }: { addresses: ContactAddress[] }) {
  if (!addresses.length) return null;
  return (
    <div className="contact-detail-section">
      <h4>Address</h4>
      {addresses.map((addr, i) => {
        const parts = [addr.street, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean);
        if (!parts.length) return null;
        return (
          <div key={i} className="contact-detail-item">
            <div>{parts.join(', ')}</div>
            {addr.type && <span className="type">({addr.type})</span>}
          </div>
        );
      })}
    </div>
  );
}

export function ContactDetail({ contactId, onClose }: ContactDetailProps) {
  const { data: contact, isLoading, error } = useContactDetail(contactId);

  return (
    <aside className="contact-detail-panel">
      <header className="contact-detail-header">
        <h3>Contact Details</h3>
        <button className="icon-button" onClick={onClose}>
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>

      <div className="contact-detail-body">
        {isLoading && (
          <div className="loading-state">
            <span aria-busy="true">Loading...</span>
          </div>
        )}

        {error && (
          <div className="error-state">
            Error loading contact: {error.message}
          </div>
        )}

        {contact && (
          <>
            <div className="contact-detail-profile">
              <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={120} />
              <h2>{contact.displayName}</h2>
              {contact.title && <p className="subtitle">{contact.title}</p>}
              {contact.company && <p className="subtitle">{contact.company}</p>}
            </div>

            <EmailList emails={contact.emails} />
            <PhoneList phones={contact.phones} />
            <AddressList addresses={contact.addresses} />

            {contact.notes && (
              <div className="contact-detail-section">
                <h4>Notes</h4>
                <div style={{ whiteSpace: 'pre-wrap' }}>{contact.notes}</div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

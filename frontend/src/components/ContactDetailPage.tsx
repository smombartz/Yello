import { useEffect, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useContactDetail } from '../api/hooks';
import { ContactRowExpanded } from './ContactRowExpanded';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import type { OutletContext } from './Layout';

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const contactId = id ? parseInt(id, 10) : null;

  const { data: contact, isLoading, error } = useContactDetail(contactId);

  const handleBack = useCallback(() => {
    navigate('/contacts');
  }, [navigate]);

  useEffect(() => {
    setHeaderConfig({
      title: contact?.displayName || 'Contact',
      actions: (
        <button className="header-action-btn secondary" onClick={handleBack}>
          <Icon name="arrow-left" />
          Back
        </button>
      ),
    });
  }, [setHeaderConfig, contact?.displayName, handleBack]);

  if (isLoading) {
    return (
      <>
        <div className="page-content">
          <div className="loading-state">
            <span aria-busy="true">Loading contact...</span>
          </div>
        </div>
      </>
    );
  }

  if (error || !contact) {
    return (
      <>
        <div className="page-content">
          <div className="error-state">
            {error ? `Error loading contact: ${error.message}` : 'Contact not found'}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-content">
        <button className="contact-detail-back" onClick={handleBack}>
          <Icon name="arrow-left" />
          Back to Contacts
        </button>
        <div className="contact-detail-content">
          <div className="contact-detail-identity">
            <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={96} />
            <div className="contact-detail-name-section">
              <h2 className="contact-detail-name">{contact.displayName}</h2>
              {contact.company && (
                <p className="contact-detail-company">{contact.company}</p>
              )}
            </div>
          </div>

          <ContactRowExpanded contact={contact} />
        </div>
      </div>
    </>
  );
}

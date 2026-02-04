import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useContactDetail } from '../api/hooks';
import { ContactRowExpanded } from './ContactRowExpanded';
import { Avatar } from './Avatar';
import { MobileHeader } from './MobileHeader';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isMobile } = useOutletContext<OutletContext>();
  const contactId = id ? parseInt(id, 10) : null;

  const { data: contact, isLoading, error } = useContactDetail(contactId);

  const handleBack = () => {
    navigate('/contacts');
  };

  const handleEdit = () => {
    // TODO: Navigate to edit page when implemented
    console.log('Edit contact:', contactId);
  };

  if (isLoading) {
    return (
      <>
        {isMobile ? (
          <MobileHeader title="Contact" showBack />
        ) : (
          <header className="top-header">
            <div className="page-header">
              <button className="back-button" onClick={handleBack}>
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <h1>Contact</h1>
            </div>
          </header>
        )}
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
        {isMobile ? (
          <MobileHeader title="Contact" showBack />
        ) : (
          <header className="top-header">
            <div className="page-header">
              <button className="back-button" onClick={handleBack}>
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <h1>Contact</h1>
            </div>
          </header>
        )}
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
      {isMobile ? (
        <MobileHeader
          title={contact.displayName}
          showBack
          onEdit={handleEdit}
        />
      ) : (
        <header className="top-header">
          <div className="page-header">
            <button className="back-button" onClick={handleBack}>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1>{contact.displayName}</h1>
          </div>
        </header>
      )}

      <div className="page-content">
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

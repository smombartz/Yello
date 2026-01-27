import { Avatar } from './Avatar';
import { ContactRowExpanded } from './ContactRowExpanded';
import { useContactDetail } from '../api/hooks';
import type { ContactListItem } from '../api/types';
import { getCountryFlag, getCountryName } from '../lib/phoneUtils';

interface ContactRowProps {
  contact: ContactListItem;
  isExpanded: boolean;
  onToggle: (id: number) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
  selectionEnabled?: boolean;
}

export function ContactRow({
  contact,
  isExpanded,
  onToggle,
  isSelected = false,
  onToggleSelect,
  selectionEnabled = false
}: ContactRowProps) {
  const { data: detailedContact, isLoading } = useContactDetail(isExpanded ? contact.id : null);

  return (
    <div
      className={`contact-card ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={() => onToggle(contact.id)}
    >
      <div className="collapsed-content">
        <div className="contact-card-main">
          {selectionEnabled && (
            <div className="contact-card-checkbox">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect?.(contact.id)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
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
              <span className="phone-display">
                {contact.primaryPhoneCountryCode && (
                  <span className="phone-flag" title={getCountryName(contact.primaryPhoneCountryCode)}>
                    {getCountryFlag(contact.primaryPhoneCountryCode)}
                  </span>
                )}
                <span>{contact.primaryPhone}</span>
              </span>
            </div>
          )}
        </div>
        <div className="contact-actions">
          <button className="icon-button">
            <span className="material-symbols-outlined">
              {isExpanded ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          {isLoading && (
            <div className="expanded-content">
              <div className="loading-state" style={{ padding: '2rem' }}>
                <span aria-busy="true">Loading details...</span>
              </div>
            </div>
          )}
          {detailedContact && (
            <ContactRowExpanded contact={detailedContact} />
          )}
        </>
      )}
    </div>
  );
}

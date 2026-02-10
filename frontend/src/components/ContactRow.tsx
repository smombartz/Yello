import { Avatar } from './Avatar';
import { ContactRowExpanded } from './ContactRowExpanded';
import { Icon } from './Icon';
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
      className={`card contact-card ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={() => onToggle(contact.id)}
    >
      <div className="collapsed-content">
        <div className="contact-card-main">
          <Avatar
            photoUrl={contact.photoUrl}
            name={contact.displayName}
            size={48}
            selectable={selectionEnabled}
            isSelected={isSelected}
            onToggleSelect={() => onToggleSelect?.(contact.id)}
          />
          <div className="contact-info">
            <h3 className="contact-name">{contact.displayName}</h3>
            {(contact.title || contact.company) && (
              <p className="contact-role">
                {[contact.title, contact.company].filter(Boolean).join(' \u2022 ')}
              </p>
            )}
          </div>
        </div>
        <div className="contact-details">
          <div className="contact-detail-item">
            {contact.primaryEmail && (
              <>
                <Icon name="envelope" />
                <span>{contact.primaryEmail}</span>
              </>
            )}
          </div>
          <div className="contact-detail-item">
            {contact.primaryPhone && (
              <>
                {contact.primaryPhoneCountryCode ? (
                  <span className="phone-flag" title={getCountryName(contact.primaryPhoneCountryCode)}>
                    {getCountryFlag(contact.primaryPhoneCountryCode)}
                  </span>
                ) : (
                  <Icon name="phone" />
                )}
                <span>{contact.primaryPhone}</span>
              </>
            )}
          </div>
        </div>
        <div className="contact-card-actions">
          <span className="contact-action-icon">
            {contact.linkedinUrl ? (
              <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer"
                 onClick={(e) => e.stopPropagation()}>
                <Icon name="linkedin" style="brands" />
              </a>
            ) : null}
          </span>
          <span className="contact-action-icon">
            {contact.websiteUrl ? (
              <a href={contact.websiteUrl} target="_blank" rel="noopener noreferrer"
                 onClick={(e) => e.stopPropagation()}>
                <Icon name="globe" />
              </a>
            ) : null}
          </span>
          <button className="contact-action-icon" onClick={(e) => e.stopPropagation()}>
            <Icon name="ellipsis-vertical" />
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

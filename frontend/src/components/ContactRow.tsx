import { useState } from 'react';
import { Avatar } from './Avatar';
import { ContactRowExpanded } from './ContactRowExpanded';
import { Icon } from './Icon';
import { ActionMenu } from './ui/ActionMenu';
import type { ActionMenuItem } from './ui/ActionMenu';
import { useContactDetail } from '../api/hooks';
import type { ContactListItem } from '../api/types';
import { getCountryFlag, getCountryName } from '../lib/phoneUtils';
import { useCopyLink } from '../hooks/useCopyLink';
import { EXPANDED_CONTACT_PARAM } from '../hooks/useSearchParamUpdater';

interface ContactRowProps {
  contact: ContactListItem;
  isExpanded: boolean;
  onToggle: (id: number) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
  selectionEnabled?: boolean;
  onArchive?: (contact: ContactListItem) => void;
}

export function ContactRow({
  contact,
  isExpanded,
  onToggle,
  isSelected = false,
  onToggleSelect,
  selectionEnabled = false,
  onArchive
}: ContactRowProps) {
  const { data: detailedContact, isLoading } = useContactDetail(isExpanded ? contact.id : null);
  const copyLink = useCopyLink();

  // Bumped by the menu's Edit. Reset on collapse (tracked during render, not in an
  // effect), so re-expanding the card later opens it in view mode.
  const [editRequest, setEditRequest] = useState(0);
  const [wasExpanded, setWasExpanded] = useState(isExpanded);
  if (isExpanded !== wasExpanded) {
    setWasExpanded(isExpanded);
    if (!isExpanded) setEditRequest(0);
  }

  const menuItems: ActionMenuItem[] = [
    {
      label: 'Open contact page',
      icon: 'up-right-and-down-left-from-center',
      to: `/contacts/${contact.id}`,
    },
    {
      label: 'Edit',
      icon: 'pen',
      onSelect: () => {
        if (!isExpanded) onToggle(contact.id);
        setEditRequest(n => n + 1);
      },
    },
    {
      label: 'Copy link',
      icon: 'link',
      // The same link the expanded card's Copy link gives: this list, with the row open
      onSelect: () => {
        const url = new URL(window.location.href);
        url.searchParams.set(EXPANDED_CONTACT_PARAM, String(contact.id));
        copyLink(url.toString());
      },
    },
    ...(onArchive ? [{
      label: 'Archive',
      icon: 'box-archive',
      dividerBefore: true,
      onSelect: () => onArchive(contact),
    }] : []),
  ];

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
          <ActionMenu
            items={menuItems}
            label={`Actions for ${contact.displayName}`}
            triggerClassName="contact-action-icon"
          />
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
            <ContactRowExpanded contact={detailedContact} editRequest={editRequest} />
          )}
        </>
      )}
    </div>
  );
}

import { useState, useCallback } from 'react';
import type { AddressCleanupContact, AddressWithIssues, AddressFix } from '../api/types';

interface AddressCleanupCardProps {
  contact: AddressCleanupContact;
  onApplyFix: (fix: AddressFix) => void;
  onSkip: () => void;
  isApplying: boolean;
}

function formatAddress(address: AddressWithIssues): string {
  const parts = [
    address.street,
    address.city,
    address.state,
    address.postalCode,
    address.country
  ].filter(Boolean);

  return parts.join(', ') || '(Empty address)';
}

function getIssueLabel(issue: 'no_street' | 'duplicate'): { text: string; className: string } {
  switch (issue) {
    case 'no_street':
      return { text: 'No street', className: 'issue-no-street' };
    case 'duplicate':
      return { text: 'Duplicate', className: 'issue-duplicate' };
  }
}

export function AddressCleanupCard({
  contact,
  onApplyFix,
  onSkip,
  isApplying
}: AddressCleanupCardProps) {
  // Track which address is selected within each group
  const [selectedAddresses, setSelectedAddresses] = useState<Map<string, number>>(() => {
    const initial = new Map<string, number>();
    for (const group of contact.addressGroups) {
      // Default to recommended address
      const recommended = group.addresses.find(a => a.isRecommended);
      if (recommended) {
        initial.set(group.fingerprint, recommended.id);
      } else if (group.addresses.length > 0) {
        initial.set(group.fingerprint, group.addresses[0].id);
      }
    }
    return initial;
  });

  const handleToggleAddress = useCallback((fingerprint: string, addressId: number) => {
    setSelectedAddresses(prev => {
      const next = new Map(prev);
      next.set(fingerprint, addressId);
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    const keepIds: number[] = [];
    const removeIds: number[] = [];

    for (const group of contact.addressGroups) {
      const selectedId = selectedAddresses.get(group.fingerprint);

      for (const addr of group.addresses) {
        if (addr.id === selectedId) {
          // Only keep if it doesn't have no_street issue
          if (!addr.issues.includes('no_street')) {
            keepIds.push(addr.id);
          } else {
            // Still remove no_street addresses even if selected
            removeIds.push(addr.id);
          }
        } else {
          removeIds.push(addr.id);
        }
      }
    }

    onApplyFix({
      contactId: contact.id,
      keepAddressIds: keepIds,
      removeAddressIds: removeIds
    });
  }, [contact, selectedAddresses, onApplyFix]);

  // Count total issues for the header badge
  const totalIssues = contact.addressGroups.reduce(
    (sum, g) => sum + g.addresses.filter(a => a.issues.length > 0).length,
    0
  );

  const issueText = totalIssues === 1 ? '1 address issue' : `${totalIssues} address issues`;

  return (
    <div className="address-cleanup-card">
      <div className="address-cleanup-card-header">
        <div className="address-cleanup-contact-info">
          {contact.photoUrl ? (
            <img
              src={contact.photoUrl}
              alt=""
              className="address-cleanup-avatar"
            />
          ) : (
            <div className="address-cleanup-avatar placeholder">
              <span className="material-symbols-outlined">person</span>
            </div>
          )}
          <div className="address-cleanup-contact-details">
            <div className="address-cleanup-contact-name">{contact.displayName}</div>
            {contact.company && (
              <div className="address-cleanup-contact-company">{contact.company}</div>
            )}
          </div>
        </div>
        <span className="address-cleanup-badge">{issueText}</span>
      </div>

      <div className="address-cleanup-groups">
        {contact.addressGroups.map((group) => (
          <div key={group.fingerprint} className="address-group">
            {group.addresses.length > 1 && (
              <div className="address-group-label">
                <span className="material-symbols-outlined">content_copy</span>
                Duplicate addresses - select one to keep:
              </div>
            )}
            {group.addresses.length === 1 && group.addresses[0].issues.includes('no_street') && (
              <div className="address-group-label">
                <span className="material-symbols-outlined">warning</span>
                Address with "No street" artifact - will be removed:
              </div>
            )}
            <div className="address-options">
              {group.addresses.map((addr) => {
                const isSelected = selectedAddresses.get(group.fingerprint) === addr.id;
                const isOnlyNoStreet = group.addresses.length === 1 && addr.issues.includes('no_street');

                return (
                  <div
                    key={addr.id}
                    className={`address-option ${isSelected ? 'selected' : ''} ${isOnlyNoStreet ? 'to-remove' : ''}`}
                    onClick={() => !isOnlyNoStreet && handleToggleAddress(group.fingerprint, addr.id)}
                  >
                    {!isOnlyNoStreet && (
                      <div className="address-radio">
                        <span className="material-symbols-outlined">
                          {isSelected ? 'radio_button_checked' : 'radio_button_unchecked'}
                        </span>
                      </div>
                    )}
                    <div className="address-content">
                      <div className="address-text">{formatAddress(addr)}</div>
                      <div className="address-meta">
                        {addr.type && <span className="address-type">{addr.type}</span>}
                        {addr.issues.map((issue) => {
                          const { text, className } = getIssueLabel(issue);
                          return (
                            <span key={issue} className={`address-issue ${className}`}>
                              {text}
                            </span>
                          );
                        })}
                        {addr.isRecommended && (
                          <span className="address-recommended">
                            <span className="material-symbols-outlined">recommend</span>
                            Recommended
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="address-cleanup-actions">
        <button
          className="address-skip-button"
          onClick={onSkip}
          disabled={isApplying}
        >
          Skip
        </button>
        <button
          className="address-apply-button"
          onClick={handleApply}
          disabled={isApplying}
        >
          <span className="material-symbols-outlined">check</span>
          {isApplying ? 'Applying...' : 'Apply Changes'}
        </button>
      </div>
    </div>
  );
}

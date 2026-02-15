import { useState, useCallback } from 'react';
import { Icon } from './Icon';
import type { AddressCleanupContact, AddressFix, AddressWithIssues, DuplicateAddressConfidence } from '../api/types';
import { formatAddress } from '../lib/addressUtils';

interface AddressEditValues {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

const CUSTOM_SELECTION = -1;

interface AddressCleanupCardProps {
  contact: AddressCleanupContact;
  onApplyFix: (fix: AddressFix) => void;
  onSkip: () => void;
  isApplying: boolean;
}

function getIssueLabel(issue: 'no_street' | 'duplicate'): { text: string; className: string } {
  switch (issue) {
    case 'no_street':
      return { text: 'No street', className: 'issue-no-street' };
    case 'duplicate':
      return { text: 'Duplicate', className: 'issue-duplicate' };
  }
}

function getConfidenceLabel(confidence: DuplicateAddressConfidence | undefined): { text: string; className: string } | null {
  if (!confidence || confidence === 'exact') return null;
  switch (confidence) {
    case 'high':
      return { text: 'High confidence', className: 'confidence-high' };
    case 'medium':
      return { text: 'Medium confidence', className: 'confidence-medium' };
    default:
      return null;
  }
}

function addressToEditValues(addr: AddressWithIssues): AddressEditValues {
  return {
    street: addr.street || '',
    city: addr.city || '',
    state: addr.state || '',
    postalCode: addr.postalCode || '',
    country: addr.country || '',
  };
}

function DuplicateEditForm({
  values,
  onChange,
}: {
  values: AddressEditValues;
  onChange: (values: AddressEditValues) => void;
}) {
  return (
    <div className="address-edit-form">
      <input
        className="address-edit-input"
        placeholder="Street"
        value={values.street}
        onChange={(e) => onChange({ ...values, street: e.target.value })}
      />
      <div className="address-edit-row">
        <input
          className="address-edit-input"
          placeholder="City"
          value={values.city}
          onChange={(e) => onChange({ ...values, city: e.target.value })}
        />
        <input
          className="address-edit-input address-edit-short"
          placeholder="State"
          value={values.state}
          onChange={(e) => onChange({ ...values, state: e.target.value })}
        />
      </div>
      <div className="address-edit-row">
        <input
          className="address-edit-input address-edit-short"
          placeholder="Postal Code"
          value={values.postalCode}
          onChange={(e) => onChange({ ...values, postalCode: e.target.value })}
        />
        <input
          className="address-edit-input"
          placeholder="Country"
          value={values.country}
          onChange={(e) => onChange({ ...values, country: e.target.value })}
        />
      </div>
    </div>
  );
}

export function AddressCleanupCard({
  contact,
  onApplyFix,
  onSkip,
  isApplying
}: AddressCleanupCardProps) {
  // Track which address is selected within each group (CUSTOM_SELECTION = custom edit)
  const [selectedAddresses, setSelectedAddresses] = useState<Map<string, number>>(() => {
    const initial = new Map<string, number>();
    for (const group of contact.addressGroups) {
      const recommended = group.addresses.find(a => a.isRecommended);
      if (recommended) {
        initial.set(group.fingerprint, recommended.id);
      } else if (group.addresses.length > 0) {
        initial.set(group.fingerprint, group.addresses[0].id);
      }
    }
    return initial;
  });

  // Track custom edit values per group
  const [customValues, setCustomValues] = useState<Map<string, AddressEditValues>>(() => {
    const initial = new Map<string, AddressEditValues>();
    for (const group of contact.addressGroups) {
      const recommended = group.addresses.find(a => a.isRecommended) || group.addresses[0];
      if (recommended) {
        initial.set(group.fingerprint, addressToEditValues(recommended));
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

  const handleCustomValuesChange = useCallback((fingerprint: string, values: AddressEditValues) => {
    setCustomValues(prev => {
      const next = new Map(prev);
      next.set(fingerprint, values);
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    const keepIds: number[] = [];
    const removeIds: number[] = [];
    let updatedAddress: AddressFix['updatedAddress'];

    for (const group of contact.addressGroups) {
      const selectedId = selectedAddresses.get(group.fingerprint);
      const isCustom = selectedId === CUSTOM_SELECTION;

      // For custom selection, keep the recommended address and update it
      const recommended = group.addresses.find(a => a.isRecommended) || group.addresses[0];

      for (const addr of group.addresses) {
        if (isCustom) {
          if (addr.id === recommended.id) {
            keepIds.push(addr.id);
            // Set the update data for this address
            const vals = customValues.get(group.fingerprint);
            if (vals) {
              updatedAddress = {
                addressId: addr.id,
                street: vals.street || null,
                city: vals.city || null,
                state: vals.state || null,
                postalCode: vals.postalCode || null,
                country: vals.country || null,
              };
            }
          } else {
            removeIds.push(addr.id);
          }
        } else if (addr.id === selectedId) {
          if (!addr.issues.includes('no_street')) {
            keepIds.push(addr.id);
          } else {
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
      removeAddressIds: removeIds,
      updatedAddress,
    });
  }, [contact, selectedAddresses, customValues, onApplyFix]);

  // Count total issues for the header badge
  const totalIssues = contact.addressGroups.reduce(
    (sum, g) => sum + g.addresses.filter(a => a.issues.length > 0).length,
    0
  );

  const issueText = totalIssues === 1 ? '1 address issue' : `${totalIssues} address issues`;

  return (
    <div className="card address-cleanup-card">
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
              <Icon name="user" />
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
        {contact.addressGroups.map((group) => {
          const confidenceInfo = getConfidenceLabel(group.confidence);
          return (
          <div key={group.fingerprint} className="address-group">
            {group.addresses.length > 1 && (
              <div className="address-group-label">
                <Icon name="copy" />
                Duplicate addresses - select one to keep:
                {confidenceInfo && (
                  <span className={`confidence-badge ${confidenceInfo.className}`}>
                    {confidenceInfo.text}
                  </span>
                )}
              </div>
            )}
            {group.addresses.length === 1 && group.addresses[0].issues.includes('no_street') && (
              <div className="address-group-label">
                <Icon name="triangle-exclamation" />
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
                        {isSelected
                          ? <Icon name="circle-dot" />
                          : <Icon name="circle" style="regular" />
                        }
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
                            <Icon name="thumbs-up" />
                            Recommended
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {group.addresses.length > 1 && (() => {
                const isCustomSelected = selectedAddresses.get(group.fingerprint) === CUSTOM_SELECTION;
                return (
                  <>
                    <div
                      className={`address-option ${isCustomSelected ? 'selected' : ''}`}
                      onClick={() => handleToggleAddress(group.fingerprint, CUSTOM_SELECTION)}
                    >
                      <div className="address-radio">
                        {isCustomSelected
                          ? <Icon name="circle-dot" />
                          : <Icon name="circle" style="regular" />
                        }
                      </div>
                      <div className="address-content">
                        <div className="address-text">
                          <Icon name="pen" /> Custom
                        </div>
                      </div>
                    </div>
                    {isCustomSelected && (
                      <DuplicateEditForm
                        values={customValues.get(group.fingerprint) || { street: '', city: '', state: '', postalCode: '', country: '' }}
                        onChange={(vals) => handleCustomValuesChange(group.fingerprint, vals)}
                      />
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        );
        })}
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
          <Icon name="check" />
          {isApplying ? 'Applying...' : 'Apply Changes'}
        </button>
      </div>
    </div>
  );
}

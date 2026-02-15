import { useState, useCallback, useEffect } from 'react';
import { Icon } from './Icon';
import { Pagination } from './Pagination';
import {
  useNormalizeContacts,
  useRemoveJunkAddresses,
  useUpdateAddress,
  fetchAllJunkAddressIds
} from '../api/addressCleanupHooks';
import type { JunkIssueType, NormalizeContact, JunkAddress } from '../api/types';
import { formatAddress } from '../lib/addressUtils';

interface ToastState {
  message: string;
  timeout: ReturnType<typeof setTimeout>;
}

const PAGE_SIZE = 20;

function getIssueLabel(issue: JunkIssueType): { text: string; className: string } {
  switch (issue) {
    case 'no_street':
      return { text: 'No street', className: 'issue-no-street' };
    case 'empty':
      return { text: 'Empty', className: 'issue-empty' };
    case 'placeholder':
      return { text: 'Placeholder', className: 'issue-placeholder' };
    case 'missing_street':
      return { text: 'Missing street', className: 'issue-missing-street' };
  }
}

interface AddressEditValues {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

function AddressEditForm({
  values,
  onChange,
  onSave,
  onCancel,
  isSaving
}: {
  values: AddressEditValues;
  onChange: (values: AddressEditValues) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
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
      <div className="address-edit-actions">
        <button
          className="address-edit-cancel"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          className="address-edit-save"
          onClick={onSave}
          disabled={isSaving}
        >
          <Icon name="check" />
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function addressToEditValues(addr: JunkAddress): AddressEditValues {
  return {
    street: addr.street || '',
    city: addr.city || '',
    state: addr.state || '',
    postalCode: addr.postalCode || '',
    country: addr.country || '',
  };
}

interface NormalizeCardProps {
  contact: NormalizeContact;
  onRemove: (addressIds: number[]) => void;
  onSkip: () => void;
  onEdit: (addressId: number, values: AddressEditValues) => void;
  isRemoving: boolean;
  isEditing: boolean;
}

function NormalizeCard({ contact, onRemove, onSkip, onEdit, isRemoving, isEditing }: NormalizeCardProps) {
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<AddressEditValues>({ street: '', city: '', state: '', postalCode: '', country: '' });

  const handleRemoveAll = () => {
    const ids = contact.junkAddresses.map(a => a.id);
    onRemove(ids);
  };

  const handleRemoveSingle = (addressId: number) => {
    onRemove([addressId]);
  };

  const handleStartEdit = (addr: JunkAddress) => {
    setEditingAddressId(addr.id);
    setEditValues(addressToEditValues(addr));
  };

  const handleCancelEdit = () => {
    setEditingAddressId(null);
  };

  const handleSaveEdit = () => {
    if (editingAddressId !== null) {
      onEdit(editingAddressId, editValues);
      setEditingAddressId(null);
    }
  };

  const issueCount = contact.junkAddresses.length;
  const issueText = issueCount === 1 ? '1 junk address' : `${issueCount} junk addresses`;

  return (
    <div className="card normalize-card">
      <div className="normalize-card-header">
        <div className="normalize-contact-info">
          {contact.photoUrl ? (
            <img
              src={contact.photoUrl}
              alt=""
              className="normalize-avatar"
            />
          ) : (
            <div className="normalize-avatar placeholder">
              <Icon name="user" />
            </div>
          )}
          <div className="normalize-contact-details">
            <div className="normalize-contact-name">{contact.displayName}</div>
            {contact.company && (
              <div className="normalize-contact-company">{contact.company}</div>
            )}
          </div>
        </div>
        <span className="normalize-badge">{issueText}</span>
      </div>

      <div className="normalize-addresses">
        {contact.junkAddresses.map((addr) => {
          const { text, className } = getIssueLabel(addr.issue);
          const isEditingThis = editingAddressId === addr.id;

          return (
            <div key={addr.id} className="normalize-address-item">
              {isEditingThis ? (
                <AddressEditForm
                  values={editValues}
                  onChange={setEditValues}
                  onSave={handleSaveEdit}
                  onCancel={handleCancelEdit}
                  isSaving={isEditing}
                />
              ) : (
                <>
                  <div className="normalize-address-content">
                    <div className="normalize-address-text">{formatAddress(addr)}</div>
                    <div className="normalize-address-meta">
                      {addr.type && <span className="normalize-address-type">{addr.type}</span>}
                      <span className={`normalize-address-issue ${className}`}>{text}</span>
                    </div>
                  </div>
                  <div className="normalize-address-buttons">
                    <button
                      className="normalize-edit-single"
                      onClick={() => handleStartEdit(addr)}
                      disabled={isRemoving || isEditing}
                      title="Edit this address"
                    >
                      <Icon name="pen" />
                    </button>
                    <button
                      className="normalize-remove-single"
                      onClick={() => handleRemoveSingle(addr.id)}
                      disabled={isRemoving || isEditing}
                      title="Remove this address"
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="normalize-card-actions">
        <button
          className="normalize-skip-button"
          onClick={onSkip}
          disabled={isRemoving || isEditing}
        >
          Skip
        </button>
        <button
          className="normalize-remove-button"
          onClick={handleRemoveAll}
          disabled={isRemoving || isEditing}
        >
          <Icon name="trash" />
          {isRemoving ? 'Removing...' : `Remove All (${issueCount})`}
        </button>
      </div>
    </div>
  );
}

export function AddressNormalize() {
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showFixAllConfirm, setShowFixAllConfirm] = useState(false);
  const [skippedIds, setSkippedIds] = useState<Set<number>>(new Set());
  const [isFixingAll, setIsFixingAll] = useState(false);

  const {
    data,
    isLoading,
    isFetching,
  } = useNormalizeContacts(currentPage, PAGE_SIZE);

  const removeMutation = useRemoveJunkAddresses();
  const updateMutation = useUpdateAddress();

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toast?.timeout) {
        clearTimeout(toast.timeout);
      }
    };
  }, [toast]);

  const showToast = useCallback((message: string) => {
    if (toast?.timeout) {
      clearTimeout(toast.timeout);
    }
    const timeout = setTimeout(() => setToast(null), 5000);
    setToast({ message, timeout });
  }, [toast]);

  const handleRemove = useCallback((addressIds: number[]) => {
    removeMutation.mutate(addressIds, {
      onSuccess: (result) => {
        showToast(`Removed ${result.removed} address${result.removed !== 1 ? 'es' : ''}`);
      },
    });
  }, [removeMutation, showToast]);

  const handleSkip = useCallback((contactId: number) => {
    setSkippedIds(prev => {
      const next = new Set(prev);
      next.add(contactId);
      return next;
    });
  }, []);

  const handleEdit = useCallback((addressId: number, values: AddressEditValues) => {
    updateMutation.mutate({
      addressId,
      street: values.street || null,
      city: values.city || null,
      state: values.state || null,
      postalCode: values.postalCode || null,
      country: values.country || null,
    }, {
      onSuccess: () => {
        showToast('Address updated');
      },
    });
  }, [updateMutation, showToast]);

  const handleFixAll = useCallback(async () => {
    setIsFixingAll(true);
    setShowFixAllConfirm(false);

    try {
      // Fetch all junk address IDs
      const allIds = await fetchAllJunkAddressIds();

      // Remove all junk addresses
      removeMutation.mutate(allIds, {
        onSuccess: (result) => {
          showToast(`Removed ${result.removed} junk address${result.removed !== 1 ? 'es' : ''}`);
          setSkippedIds(new Set());
        },
        onSettled: () => {
          setIsFixingAll(false);
        }
      });
    } catch (error) {
      console.error('Failed to remove all junk addresses:', error);
      setIsFixingAll(false);
      showToast('Failed to remove addresses');
    }
  }, [removeMutation, showToast]);

  // Filter out skipped contacts
  const contacts = (data?.contacts ?? []).filter(c => !skippedIds.has(c.id));
  const total = (data?.total ?? 0) - skippedIds.size;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="normalize-loading">
        <Icon name="arrows-rotate" className="spinning" />
        <p>Finding junk addresses...</p>
      </div>
    );
  }

  if (total === 0 && !isFetching) {
    return (
      <div className="normalize-empty">
        <Icon name="circle-check" />
        <p>No junk addresses found</p>
      </div>
    );
  }

  return (
    <div className="normalize-view">
      <div className="normalize-description">
        <p>
          This cleanup finds addresses with "No street" artifacts, empty addresses, placeholder values,
          and addresses missing a street (only city/state/country). These entries will be removed from your contacts.
        </p>
      </div>

      <div className="normalize-header">
        <div className="normalize-stats">
          {total} contact{total !== 1 ? 's' : ''} with junk addresses
        </div>
        <button
          className="fix-all-button"
          onClick={() => setShowFixAllConfirm(true)}
          disabled={removeMutation.isPending || isFixingAll}
        >
          <Icon name="wand-magic-sparkles" />
          {isFixingAll ? 'Removing...' : `Remove All Junk (${total})`}
        </button>
      </div>

      <div className="normalize-list">
        {contacts.map((contact) => (
          <NormalizeCard
            key={contact.id}
            contact={contact}
            onRemove={handleRemove}
            onSkip={() => handleSkip(contact.id)}
            onEdit={handleEdit}
            isRemoving={removeMutation.isPending}
            isEditing={updateMutation.isPending}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          isLoading={isFetching}
        />
      )}

      {toast && (
        <div className="undo-toast">
          <Icon name="circle-check" />
          <span className="message">{toast.message}</span>
          <button
            className="dismiss"
            onClick={() => {
              if (toast.timeout) clearTimeout(toast.timeout);
              setToast(null);
            }}
          >
            <Icon name="xmark" />
          </button>
        </div>
      )}

      {showFixAllConfirm && (
        <div className="modal-overlay" onClick={() => setShowFixAllConfirm(false)}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Remove All Junk Addresses?</h3>
            <p>
              This will remove junk addresses from {total} contact{total !== 1 ? 's' : ''}:
            </p>
            <ul className="fix-all-details">
              <li>Addresses with "No street" artifacts</li>
              <li>Empty addresses</li>
              <li>Addresses with only placeholder values</li>
              <li>Addresses missing street (only city/state/country)</li>
            </ul>
            <div className="confirm-actions">
              <button className="cancel-button" onClick={() => setShowFixAllConfirm(false)}>
                Cancel
              </button>
              <button
                className="confirm-button danger"
                onClick={handleFixAll}
              >
                Remove All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

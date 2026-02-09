import { useState, useCallback, useEffect } from 'react';
import { Icon } from './Icon';
import { Pagination } from './Pagination';
import {
  useNormalizeContacts,
  useRemoveJunkAddresses,
  fetchAllJunkAddressIds
} from '../api/addressCleanupHooks';
import type { JunkIssueType, NormalizeContact } from '../api/types';
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

interface NormalizeCardProps {
  contact: NormalizeContact;
  onRemove: (addressIds: number[]) => void;
  onSkip: () => void;
  isRemoving: boolean;
}

function NormalizeCard({ contact, onRemove, onSkip, isRemoving }: NormalizeCardProps) {
  const handleRemoveAll = () => {
    const ids = contact.junkAddresses.map(a => a.id);
    onRemove(ids);
  };

  const handleRemoveSingle = (addressId: number) => {
    onRemove([addressId]);
  };

  const issueCount = contact.junkAddresses.length;
  const issueText = issueCount === 1 ? '1 junk address' : `${issueCount} junk addresses`;

  return (
    <div className="normalize-card">
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
          return (
            <div key={addr.id} className="normalize-address-item">
              <div className="normalize-address-content">
                <div className="normalize-address-text">{formatAddress(addr)}</div>
                <div className="normalize-address-meta">
                  {addr.type && <span className="normalize-address-type">{addr.type}</span>}
                  <span className={`normalize-address-issue ${className}`}>{text}</span>
                </div>
              </div>
              <button
                className="normalize-remove-single"
                onClick={() => handleRemoveSingle(addr.id)}
                disabled={isRemoving}
                title="Remove this address"
              >
                <Icon name="trash" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="normalize-card-actions">
        <button
          className="normalize-skip-button"
          onClick={onSkip}
          disabled={isRemoving}
        >
          Skip
        </button>
        <button
          className="normalize-remove-button"
          onClick={handleRemoveAll}
          disabled={isRemoving}
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
            isRemoving={removeMutation.isPending}
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

import { useState, useCallback, useEffect } from 'react';
import { Icon } from './Icon';
import { Pagination } from './Pagination';
import { AddressCleanupCard } from './AddressCleanupCard';
import {
  useDuplicatesContacts,
  useFixDuplicateAddresses,
  fetchAllDuplicateContacts,
  type DuplicatesConfidenceFilter
} from '../api/addressCleanupHooks';
import type { AddressFix, AddressCleanupContact } from '../api/types';

interface ToastState {
  message: string;
  timeout: ReturnType<typeof setTimeout>;
}

const PAGE_SIZE = 20;

export function AddressDuplicates() {
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showFixAllConfirm, setShowFixAllConfirm] = useState(false);
  const [skippedIds, setSkippedIds] = useState<Set<number>>(new Set());
  const [isFixingAll, setIsFixingAll] = useState(false);
  const [confidenceFilter, setConfidenceFilter] = useState<DuplicatesConfidenceFilter>('all');

  const {
    data,
    isLoading,
    isFetching,
  } = useDuplicatesContacts(currentPage, PAGE_SIZE, confidenceFilter);

  const fixMutation = useFixDuplicateAddresses();

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

  const handleApplyFix = useCallback((fix: AddressFix) => {
    fixMutation.mutate([fix], {
      onSuccess: (result) => {
        showToast(`Removed ${result.removed} address${result.removed !== 1 ? 'es' : ''}`);
      },
    });
  }, [fixMutation, showToast]);

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
      // Fetch all contacts with duplicates (respecting current filter)
      const allContacts = await fetchAllDuplicateContacts(confidenceFilter);

      // Convert to fixes
      const fixes: AddressFix[] = allContacts.map(c => ({
        contactId: c.id,
        keepAddressIds: c.keepAddressIds,
        removeAddressIds: c.removeAddressIds
      }));

      // Apply all fixes
      fixMutation.mutate(fixes, {
        onSuccess: (result) => {
          showToast(`Fixed ${result.fixed} contact${result.fixed !== 1 ? 's' : ''}, removed ${result.removed} address${result.removed !== 1 ? 'es' : ''}`);
          setSkippedIds(new Set());
        },
        onSettled: () => {
          setIsFixingAll(false);
        }
      });
    } catch (error) {
      console.error('Failed to fix all addresses:', error);
      setIsFixingAll(false);
      showToast('Failed to fix addresses');
    }
  }, [fixMutation, showToast, confidenceFilter]);

  // Transform DuplicatesContact to AddressCleanupContact for the card
  const transformedContacts: AddressCleanupContact[] = (data?.contacts ?? []).map(c => ({
    ...c,
    photoHash: c.photoHash
  }));

  // Filter out skipped contacts
  const contacts = transformedContacts.filter(c => !skippedIds.has(c.id));
  const total = (data?.total ?? 0) - skippedIds.size;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="duplicates-loading">
        <Icon name="arrows-rotate" className="spinning" />
        <p>Finding duplicate addresses...</p>
      </div>
    );
  }

  const isEmpty = total === 0 && !isFetching;

  return (
    <div className="duplicates-view">
      <div className="duplicates-description">
        <p>
          This cleanup finds duplicate addresses on the same contact.
          Select which address to keep for each contact, or use Fix All to automatically keep the best address.
        </p>
      </div>

      <div className="duplicates-header">
        <div className="duplicates-stats">
          {total} contact{total !== 1 ? 's' : ''} with duplicate addresses
        </div>
        <div className="duplicates-actions">
          <div className="confidence-filter">
            <label htmlFor="confidence-filter">Show:</label>
            <select
              id="confidence-filter"
              value={confidenceFilter}
              onChange={(e) => {
                setConfidenceFilter(e.target.value as DuplicatesConfidenceFilter);
                setCurrentPage(1);
                setSkippedIds(new Set());
              }}
            >
              <option value="all">All duplicates</option>
              <option value="exact">Exact matches only</option>
              <option value="high">High confidence</option>
              <option value="medium">Medium confidence</option>
            </select>
          </div>
          <button
            className="fix-all-button"
            onClick={() => setShowFixAllConfirm(true)}
            disabled={fixMutation.isPending || isFixingAll || isEmpty}
          >
            <Icon name="wand-magic-sparkles" />
            {isFixingAll ? 'Fixing...' : `Fix All Contacts (${total})`}
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="duplicates-empty">
          <Icon name="circle-check" />
          <p>No duplicate addresses found{confidenceFilter !== 'all' ? ` for "${confidenceFilter}" confidence` : ''}</p>
        </div>
      ) : (
      <div className="duplicates-list">
        {contacts.map((contact) => (
          <AddressCleanupCard
            key={contact.id}
            contact={contact}
            onApplyFix={handleApplyFix}
            onSkip={() => handleSkip(contact.id)}
            isApplying={fixMutation.isPending}
          />
        ))}
      </div>
      )}

      {!isEmpty && totalPages > 1 && (
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
            <h3>Fix All Duplicate Addresses?</h3>
            <p>
              This will automatically fix {total} contact{total !== 1 ? 's' : ''}:
            </p>
            <ul className="fix-all-details">
              <li>Keep the best address when duplicates exist (prefers addresses with postal codes and more detail)</li>
              <li>Remove duplicate addresses</li>
            </ul>
            <div className="confirm-actions">
              <button className="cancel-button" onClick={() => setShowFixAllConfirm(false)}>
                Cancel
              </button>
              <button
                className="confirm-button"
                onClick={handleFixAll}
              >
                Fix All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

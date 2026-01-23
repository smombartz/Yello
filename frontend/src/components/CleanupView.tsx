import { useState, useCallback, useEffect } from 'react';
import { CleanupModeSelector } from './CleanupModeSelector';
import { ThresholdSelector } from './ThresholdSelector';
import { CleanupFilters } from './CleanupFilters';
import { CleanupContactList } from './CleanupContactList';
import { useCleanupSummary, useCleanupContacts, useDeleteContacts } from '../api/cleanupHooks';
import type {
  CleanupMode,
  EmptyContactType,
  ProblematicContactType
} from '../api/types';

interface CleanupViewProps {
  onBack: () => void;
}

interface ToastState {
  message: string;
  timeout: ReturnType<typeof setTimeout>;
}

const PAGE_SIZE = 50;

export function CleanupView({ onBack: _onBack }: CleanupViewProps) {
  const [selectedMode, setSelectedMode] = useState<CleanupMode>('empty');
  const [currentPage, setCurrentPage] = useState(1);
  const [threshold, setThreshold] = useState(3);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<EmptyContactType | ProblematicContactType>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const { data: summary, isLoading: isSummaryLoading } = useCleanupSummary(threshold);

  const typesArray = selectedTypes.size > 0
    ? Array.from(selectedTypes) as (EmptyContactType[] | ProblematicContactType[])
    : undefined;

  const {
    data: contactsData,
    isLoading: isContactsLoading,
    isFetching,
  } = useCleanupContacts(selectedMode, currentPage, PAGE_SIZE, {
    types: typesArray,
    threshold,
  });

  const deleteMutation = useDeleteContacts();

  // Reset state when mode changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
    setSelectedTypes(new Set());
  }, [selectedMode]);

  // Reset page when filters or threshold change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTypes, threshold]);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toast?.timeout) {
        clearTimeout(toast.timeout);
      }
    };
  }, [toast]);

  const handleModeChange = useCallback((mode: CleanupMode) => {
    setSelectedMode(mode);
  }, []);

  const handleThresholdChange = useCallback((newThreshold: number) => {
    setThreshold(newThreshold);
  }, []);

  const handleToggleType = useCallback((type: EmptyContactType | ProblematicContactType) => {
    setSelectedTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  }, []);

  const handleToggleSelect = useCallback((contactId: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) {
        newSet.delete(contactId);
      } else {
        newSet.add(contactId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!contactsData?.contacts) return;
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      contactsData.contacts.forEach(c => newSet.add(c.id));
      return newSet;
    });
  }, [contactsData]);

  const handleSelectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleDelete = useCallback(() => {
    if (selectedIds.size === 0) return;

    deleteMutation.mutate(Array.from(selectedIds), {
      onSuccess: (result) => {
        const message = `Deleted ${result.deletedCount} contact${result.deletedCount !== 1 ? 's' : ''}`;

        // Clear selection
        setSelectedIds(new Set());

        // Clear any existing toast timeout
        if (toast?.timeout) {
          clearTimeout(toast.timeout);
        }

        // Show success toast
        const timeout = setTimeout(() => setToast(null), 5000);
        setToast({ message, timeout });
      },
    });

    setShowDeleteConfirm(false);
  }, [selectedIds, deleteMutation, toast]);

  const contacts = contactsData?.contacts ?? [];
  const total = contactsData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="cleanup-view">
      <div className="cleanup-header">
        <div className="cleanup-header-top">
          <h1>Cleanup Contacts</h1>
        </div>

        <CleanupModeSelector
          selectedMode={selectedMode}
          onModeChange={handleModeChange}
          summary={summary}
          isLoading={isSummaryLoading}
        />

        <div className="cleanup-controls">
          {selectedMode === 'problematic' && (
            <ThresholdSelector
              threshold={threshold}
              onThresholdChange={handleThresholdChange}
              disabled={isContactsLoading}
            />
          )}

          <CleanupFilters
            mode={selectedMode}
            selectedTypes={selectedTypes}
            onToggleType={handleToggleType}
            summary={summary}
          />
        </div>

        {!isContactsLoading && (
          <div className="cleanup-stats-row">
            <div className="cleanup-stats">
              {total} contact{total !== 1 ? 's' : ''} found
            </div>
            {selectedIds.size > 0 && (
              <button
                className="delete-selected-button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleteMutation.isPending}
              >
                <span className="material-symbols-outlined">delete</span>
                {deleteMutation.isPending
                  ? 'Deleting...'
                  : `Delete Selected (${selectedIds.size})`}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="cleanup-content">
        {isContactsLoading ? (
          <div className="cleanup-loading">
            <span className="material-symbols-outlined spinning">sync</span>
            <p>Finding contacts...</p>
          </div>
        ) : (
          <CleanupContactList
            contacts={contacts}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onSelectNone={handleSelectNone}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            isLoading={isFetching}
            mode={selectedMode}
          />
        )}
      </div>

      {toast && (
        <div className="undo-toast">
          <span className="material-symbols-outlined">check_circle</span>
          <span className="message">{toast.message}</span>
          <button
            className="dismiss"
            onClick={() => {
              if (toast.timeout) clearTimeout(toast.timeout);
              setToast(null);
            }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete {selectedIds.size} Contact{selectedIds.size !== 1 ? 's' : ''}?</h3>
            <p>
              This action cannot be undone. The selected contacts will be permanently deleted.
            </p>
            <div className="confirm-actions">
              <button className="cancel-button" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button
                className="confirm-button danger"
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

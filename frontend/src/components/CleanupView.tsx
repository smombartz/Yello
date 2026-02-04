import { useState, useCallback, useEffect } from 'react';
import { CleanupModeSelector } from './CleanupModeSelector';
import { ThresholdSelector } from './ThresholdSelector';
import { CleanupFilters } from './CleanupFilters';
import { CleanupContactList } from './CleanupContactList';
import { SocialLinksCleanup } from './SocialLinksCleanup';
import { InvalidLinksCleanup } from './InvalidLinksCleanup';
import { AddressCleanup } from './AddressCleanup';
import { useCleanupSummary, useCleanupContacts, useDeleteContacts, fetchAllCleanupContactIds } from '../api/cleanupHooks';
import { useSocialLinksSummary } from '../api/socialLinksHooks';
import { useAddressCleanupSummary } from '../api/addressCleanupHooks';
import { useArchiveContacts } from '../api/archiveHooks';
import type {
  CleanupMode,
  EmptyContactType,
  ProblematicContactType
} from '../api/types';

interface CleanupViewProps {
  onBack?: () => void;
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
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isSelectingAll, setIsSelectingAll] = useState(false);

  const { data: summary, isLoading: isSummaryLoading } = useCleanupSummary(threshold);
  const { data: socialLinksSummary } = useSocialLinksSummary();
  const { data: addressCleanupSummary } = useAddressCleanupSummary();

  const typesArray = selectedTypes.size > 0
    ? Array.from(selectedTypes) as (EmptyContactType[] | ProblematicContactType[])
    : undefined;

  // Only fetch cleanup contacts when not in social-links, invalid-links, or addresses mode
  const shouldFetchContacts = selectedMode !== 'social-links' && selectedMode !== 'invalid-links' && selectedMode !== 'addresses';
  const {
    data: contactsData,
    isLoading: isContactsLoading,
    isFetching,
  } = useCleanupContacts(
    shouldFetchContacts ? selectedMode : 'empty', // fallback mode when disabled
    currentPage,
    PAGE_SIZE,
    {
      types: typesArray,
      threshold,
    }
  );

  const deleteMutation = useDeleteContacts();
  const archiveMutation = useArchiveContacts();

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

  // Select all contacts on current page only
  const handleSelectPage = useCallback(() => {
    if (!contactsData?.contacts) return;
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      contactsData.contacts.forEach(c => newSet.add(c.id));
      return newSet;
    });
  }, [contactsData]);

  // Select all contacts across all pages
  const handleSelectAll = useCallback(async () => {
    setIsSelectingAll(true);
    try {
      const allIds = await fetchAllCleanupContactIds(selectedMode, {
        types: typesArray,
        threshold,
      });
      setSelectedIds(new Set(allIds));
    } catch (error) {
      console.error('Failed to fetch all contact IDs:', error);
    } finally {
      setIsSelectingAll(false);
    }
  }, [selectedMode, typesArray, threshold]);

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

  const handleArchive = useCallback(() => {
    if (selectedIds.size === 0) return;

    archiveMutation.mutate(Array.from(selectedIds), {
      onSuccess: (result) => {
        const message = `Archived ${result.archivedCount} contact${result.archivedCount !== 1 ? 's' : ''}`;

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

    setShowArchiveConfirm(false);
  }, [selectedIds, archiveMutation, toast]);

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
          socialLinksSummary={socialLinksSummary}
          addressCleanupSummary={addressCleanupSummary}
          isLoading={isSummaryLoading}
        />

        {selectedMode !== 'social-links' && selectedMode !== 'invalid-links' && selectedMode !== 'addresses' && (
          <>
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
                  <div className="cleanup-action-buttons">
                    <button
                      className="archive-selected-button"
                      onClick={() => setShowArchiveConfirm(true)}
                      disabled={archiveMutation.isPending}
                    >
                      <span className="material-symbols-outlined">archive</span>
                      {archiveMutation.isPending
                        ? 'Archiving...'
                        : `Archive Selected (${selectedIds.size})`}
                    </button>
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
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="cleanup-content">
        {selectedMode === 'social-links' ? (
          <SocialLinksCleanup />
        ) : selectedMode === 'invalid-links' ? (
          <InvalidLinksCleanup />
        ) : selectedMode === 'addresses' ? (
          <AddressCleanup />
        ) : isContactsLoading ? (
          <div className="cleanup-loading">
            <span className="material-symbols-outlined spinning">sync</span>
            <p>Finding contacts...</p>
          </div>
        ) : (
          <CleanupContactList
            contacts={contacts}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectPage={handleSelectPage}
            onSelectAll={handleSelectAll}
            onSelectNone={handleSelectNone}
            currentPage={currentPage}
            totalPages={totalPages}
            totalContacts={total}
            onPageChange={setCurrentPage}
            isLoading={isFetching}
            isSelectingAll={isSelectingAll}
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

      {showArchiveConfirm && (
        <div className="modal-overlay" onClick={() => setShowArchiveConfirm(false)}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Archive {selectedIds.size} Contact{selectedIds.size !== 1 ? 's' : ''}?</h3>
            <p>
              Archived contacts will be moved to the Archive section. You can restore them later or permanently delete them.
            </p>
            <div className="confirm-actions">
              <button className="cancel-button" onClick={() => setShowArchiveConfirm(false)}>
                Cancel
              </button>
              <button
                className="confirm-button"
                onClick={handleArchive}
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useCallback, useEffect } from 'react';
import { ModeSelector } from './ModeSelector';
import { DuplicateGroupList } from './DuplicateGroupList';
import { ConfidenceFilter } from './ConfidenceFilter';
import { useDuplicateSummary, useDuplicatesPaginated, useMergeContacts, fetchAllDuplicateGroups } from '../api/deduplicationHooks';
import { useDeleteContacts } from '../api/cleanupHooks';
import { useArchiveContacts } from '../api/archiveHooks';
import type { ConfidenceLevel, DeduplicationMode, DuplicateGroup } from '../api/types';

interface DeduplicationViewProps {
  onBack?: () => void;
}

interface UndoState {
  groupId: string;
  message: string;
  timeout: ReturnType<typeof setTimeout>;
}

const ALL_CONFIDENCE_LEVELS: Set<ConfidenceLevel> = new Set(['very_high', 'high', 'medium']);

export function DeduplicationView({ onBack: _onBack }: DeduplicationViewProps) {
  const [selectedMode, setSelectedMode] = useState<DeduplicationMode>('email');
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(new Set());
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [mergeAllProgress, setMergeAllProgress] = useState<{ current: number; total: number } | null>(null);
  const [showMergeAllConfirm, setShowMergeAllConfirm] = useState(false);
  const [showMergeAllGlobalConfirm, setShowMergeAllGlobalConfirm] = useState(false);
  const [mergeAllGlobalProgress, setMergeAllGlobalProgress] = useState<{ current: number; total: number } | null>(null);
  const [confidenceFilter, setConfidenceFilter] = useState<Set<ConfidenceLevel>>(new Set(ALL_CONFIDENCE_LEVELS));
  const [currentPage, setCurrentPage] = useState(1);

  // Selection state for individual contacts across groups
  const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const PAGE_SIZE = 100;

  const { data: summary, isLoading: isSummaryLoading } = useDuplicateSummary();

  const {
    data: duplicatesData,
    isLoading: isDuplicatesLoading,
    isFetching,
  } = useDuplicatesPaginated(
    selectedMode,
    currentPage,
    PAGE_SIZE,
    selectedMode === 'recommended' ? confidenceFilter : undefined
  );

  const mergeMutation = useMergeContacts();
  const deleteMutation = useDeleteContacts();
  const archiveMutation = useArchiveContacts();

  // Clear hidden groups, reset confidence filter, selection, and reset page when mode changes
  useEffect(() => {
    setHiddenGroupIds(new Set());
    setConfidenceFilter(new Set(ALL_CONFIDENCE_LEVELS));
    setCurrentPage(1);
    setSelectedContactIds(new Set());
  }, [selectedMode]);

  // Reset page when confidence filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [confidenceFilter]);

  // Cleanup undo timeout on unmount
  useEffect(() => {
    return () => {
      if (undoState?.timeout) {
        clearTimeout(undoState.timeout);
      }
    };
  }, [undoState]);

  const handleMerge = useCallback(
    (contactIds: number[], primaryContactId: number) => {
      mergeMutation.mutate(
        { contactIds, primaryContactId },
        {
          onSuccess: (result) => {
            const message = `Merged ${contactIds.length} contacts into "${result.mergedContact.displayName}"`;

            // Clear any existing undo timeout
            if (undoState?.timeout) {
              clearTimeout(undoState.timeout);
            }

            // Show undo toast (note: actual undo is not implemented - session only)
            const timeout = setTimeout(() => {
              setUndoState(null);
            }, 5000);

            setUndoState({
              groupId: '',
              message,
              timeout,
            });
          },
        }
      );
    },
    [mergeMutation, undoState]
  );

  const handleKeepSeparate = useCallback((groupId: string) => {
    setHiddenGroupIds((prev) => new Set([...prev, groupId]));
  }, []);

  const handleModeChange = useCallback((mode: DeduplicationMode) => {
    setSelectedMode(mode);
  }, []);

  const handleConfidenceToggle = useCallback((level: ConfidenceLevel) => {
    setConfidenceFilter(prev => {
      const newSet = new Set(prev);
      if (newSet.has(level)) {
        newSet.delete(level);
      } else {
        newSet.add(level);
      }
      return newSet;
    });
  }, []);

  // Contact selection handlers
  const handleToggleContactSelect = useCallback((contactId: number) => {
    setSelectedContactIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) {
        newSet.delete(contactId);
      } else {
        newSet.add(contactId);
      }
      return newSet;
    });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (selectedContactIds.size === 0) return;

    deleteMutation.mutate(Array.from(selectedContactIds), {
      onSuccess: (result) => {
        const message = `Deleted ${result.deletedCount} contact${result.deletedCount !== 1 ? 's' : ''}`;

        // Clear selection
        setSelectedContactIds(new Set());

        // Clear any existing undo timeout
        if (undoState?.timeout) {
          clearTimeout(undoState.timeout);
        }

        // Show success toast
        const timeout = setTimeout(() => setUndoState(null), 5000);
        setUndoState({
          groupId: '',
          message,
          timeout,
        });
      },
    });

    setShowDeleteConfirm(false);
  }, [selectedContactIds, deleteMutation, undoState]);

  const handleArchiveSelected = useCallback(() => {
    if (selectedContactIds.size === 0) return;

    archiveMutation.mutate(Array.from(selectedContactIds), {
      onSuccess: (result) => {
        const message = `Archived ${result.archivedCount} contact${result.archivedCount !== 1 ? 's' : ''}`;

        // Clear selection
        setSelectedContactIds(new Set());

        // Clear any existing undo timeout
        if (undoState?.timeout) {
          clearTimeout(undoState.timeout);
        }

        // Show success toast
        const timeout = setTimeout(() => setUndoState(null), 5000);
        setUndoState({
          groupId: '',
          message,
          timeout,
        });
      },
    });

    setShowArchiveConfirm(false);
  }, [selectedContactIds, archiveMutation, undoState]);

  const groups: DuplicateGroup[] = duplicatesData?.groups ?? [];
  const totalGroups = duplicatesData?.totalGroups ?? 0;
  const totalPages = Math.ceil(totalGroups / PAGE_SIZE);
  const visibleCount = groups.filter((g) => !hiddenGroupIds.has(g.id)).length;

  const handleMergeAll = useCallback(async () => {
    const groupsToMerge = groups.filter((g) => !hiddenGroupIds.has(g.id));
    if (groupsToMerge.length === 0) return;

    setMergeAllProgress({ current: 0, total: groupsToMerge.length });

    for (let i = 0; i < groupsToMerge.length; i++) {
      const group = groupsToMerge[i];
      const contactIds = group.contacts.map((c) => c.id);
      const primaryContactId = group.contacts[0].id;

      try {
        await mergeMutation.mutateAsync({ contactIds, primaryContactId });
        setMergeAllProgress({ current: i + 1, total: groupsToMerge.length });
      } catch (error) {
        console.error('Merge failed for group:', group.id, error);
        // Continue with remaining groups even if one fails
      }
    }

    setMergeAllProgress(null);

    // Clear any existing undo timeout
    if (undoState?.timeout) {
      clearTimeout(undoState.timeout);
    }

    // Show completion toast
    const timeout = setTimeout(() => setUndoState(null), 5000);
    setUndoState({
      groupId: '',
      message: `Merged ${groupsToMerge.length} duplicate groups`,
      timeout,
    });
  }, [groups, hiddenGroupIds, mergeMutation, undoState]);

  const handleMergeAllGlobal = useCallback(async () => {
    setMergeAllGlobalProgress({ current: 0, total: 0 });

    try {
      const allGroups = await fetchAllDuplicateGroups(
        selectedMode,
        selectedMode === 'recommended' ? confidenceFilter : undefined
      );

      if (allGroups.length === 0) {
        setMergeAllGlobalProgress(null);
        return;
      }

      setMergeAllGlobalProgress({ current: 0, total: allGroups.length });

      for (let i = 0; i < allGroups.length; i++) {
        const group = allGroups[i];
        try {
          await mergeMutation.mutateAsync({
            contactIds: group.contactIds,
            primaryContactId: group.primaryContactId
          });
        } catch (error) {
          console.error('Merge failed for group:', group.id, error);
          // Continue with remaining groups even if one fails
        }
        setMergeAllGlobalProgress({ current: i + 1, total: allGroups.length });
      }

      setMergeAllGlobalProgress(null);

      // Clear any existing undo timeout
      if (undoState?.timeout) {
        clearTimeout(undoState.timeout);
      }

      // Show completion toast
      const timeout = setTimeout(() => setUndoState(null), 5000);
      setUndoState({
        groupId: '',
        message: `Merged all ${allGroups.length} duplicate groups`,
        timeout,
      });
    } catch (error) {
      console.error('Failed to fetch all groups:', error);
      setMergeAllGlobalProgress(null);
    }
  }, [selectedMode, confidenceFilter, mergeMutation, undoState]);

  return (
    <div className="dedup-view">
      <div className="dedup-header">
        <div className="dedup-header-top">
          <h1>Resolve Duplicates</h1>
        </div>

        <ModeSelector
          selectedMode={selectedMode}
          onModeChange={handleModeChange}
          summary={summary}
          isLoading={isSummaryLoading}
        />

        {selectedMode === 'recommended' && summary?.recommended && (
          <ConfidenceFilter
            selectedLevels={confidenceFilter}
            onToggle={handleConfidenceToggle}
            counts={{
              veryHigh: summary.recommended.veryHigh,
              high: summary.recommended.high,
              medium: summary.recommended.medium,
            }}
          />
        )}

        {!isDuplicatesLoading && (
          <div className="dedup-stats-row">
            <div className="dedup-stats">
              {visibleCount} of {totalGroups} duplicate groups
              {hiddenGroupIds.size > 0 && (
                <span className="hidden-count">
                  ({hiddenGroupIds.size} marked as separate)
                </span>
              )}
              {selectedContactIds.size > 0 && (
                <span className="hidden-count">
                  | {selectedContactIds.size} contact{selectedContactIds.size !== 1 ? 's' : ''} selected
                </span>
              )}
            </div>
            <div className="dedup-action-buttons">
              {selectedContactIds.size > 0 && (
                <>
                  <button
                    className="archive-selected-button"
                    onClick={() => setShowArchiveConfirm(true)}
                    disabled={archiveMutation.isPending}
                  >
                    <span className="material-symbols-outlined">archive</span>
                    {archiveMutation.isPending
                      ? 'Archiving...'
                      : `Archive (${selectedContactIds.size})`}
                  </button>
                  <button
                    className="delete-selected-button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deleteMutation.isPending}
                  >
                    <span className="material-symbols-outlined">delete</span>
                    {deleteMutation.isPending
                      ? 'Deleting...'
                      : `Delete (${selectedContactIds.size})`}
                  </button>
                </>
              )}
            </div>
            {visibleCount > 0 && (
              <div className="merge-buttons">
                <button
                  className="merge-all-button"
                  onClick={() => setShowMergeAllConfirm(true)}
                  disabled={mergeMutation.isPending || mergeAllProgress !== null || mergeAllGlobalProgress !== null}
                >
                  <span className="material-symbols-outlined">merge</span>
                  {mergeAllProgress
                    ? `Merging ${mergeAllProgress.current}/${mergeAllProgress.total}...`
                    : `Merge Page (${visibleCount})`}
                </button>
                <button
                  className="merge-all-button merge-all-global"
                  onClick={() => setShowMergeAllGlobalConfirm(true)}
                  disabled={mergeMutation.isPending || mergeAllProgress !== null || mergeAllGlobalProgress !== null}
                >
                  <span className="material-symbols-outlined">merge_type</span>
                  {mergeAllGlobalProgress
                    ? `Merging ${mergeAllGlobalProgress.current}/${mergeAllGlobalProgress.total}...`
                    : `Merge All (${totalGroups})`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="dedup-content">
        {isDuplicatesLoading ? (
          <div className="dedup-loading">
            <span className="material-symbols-outlined spinning">sync</span>
            <p>Finding duplicates...</p>
          </div>
        ) : (
          <DuplicateGroupList
            groups={groups}
            hiddenGroupIds={hiddenGroupIds}
            onMerge={handleMerge}
            onKeepSeparate={handleKeepSeparate}
            isMerging={mergeMutation.isPending}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            isLoading={isFetching}
            mode={selectedMode}
            selectedContactIds={selectedContactIds}
            onToggleContactSelect={handleToggleContactSelect}
          />
        )}
      </div>

      {undoState && (
        <div className="undo-toast">
          <span className="material-symbols-outlined">check_circle</span>
          <span className="message">{undoState.message}</span>
          <button
            className="dismiss"
            onClick={() => {
              if (undoState.timeout) clearTimeout(undoState.timeout);
              setUndoState(null);
            }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}

      {showMergeAllConfirm && (
        <div className="modal-overlay" onClick={() => setShowMergeAllConfirm(false)}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Merge All on This Page?</h3>
            <p>
              This will merge {visibleCount} duplicate group{visibleCount !== 1 ? 's' : ''} on this page.
              The first contact in each group will be kept as the primary.
            </p>
            <div className="confirm-actions">
              <button className="cancel-button" onClick={() => setShowMergeAllConfirm(false)}>
                Cancel
              </button>
              <button
                className="confirm-button"
                onClick={() => {
                  setShowMergeAllConfirm(false);
                  handleMergeAll();
                }}
              >
                Merge All
              </button>
            </div>
          </div>
        </div>
      )}

      {showMergeAllGlobalConfirm && (
        <div className="modal-overlay" onClick={() => setShowMergeAllGlobalConfirm(false)}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Merge All Duplicates?</h3>
            <p>
              This will merge all {totalGroups} duplicate group{totalGroups !== 1 ? 's' : ''}
              {selectedMode === 'recommended' && confidenceFilter.size < 3 &&
                ' matching the selected confidence levels'}.
              The first contact in each group will be kept as the primary.
            </p>
            <p className="warning-text">This action cannot be undone.</p>
            <div className="confirm-actions">
              <button className="cancel-button" onClick={() => setShowMergeAllGlobalConfirm(false)}>
                Cancel
              </button>
              <button
                className="confirm-button"
                onClick={() => {
                  setShowMergeAllGlobalConfirm(false);
                  handleMergeAllGlobal();
                }}
              >
                Merge All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete {selectedContactIds.size} Contact{selectedContactIds.size !== 1 ? 's' : ''}?</h3>
            <p>
              This action cannot be undone. The selected contacts will be permanently deleted.
            </p>
            <div className="confirm-actions">
              <button className="cancel-button" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button
                className="confirm-button danger"
                onClick={handleDeleteSelected}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive confirmation modal */}
      {showArchiveConfirm && (
        <div className="modal-overlay" onClick={() => setShowArchiveConfirm(false)}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Archive {selectedContactIds.size} Contact{selectedContactIds.size !== 1 ? 's' : ''}?</h3>
            <p>
              Archived contacts will be moved to the Archive section. You can restore them later or permanently delete them.
            </p>
            <div className="confirm-actions">
              <button className="cancel-button" onClick={() => setShowArchiveConfirm(false)}>
                Cancel
              </button>
              <button
                className="confirm-button"
                onClick={handleArchiveSelected}
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

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Icon } from './Icon';
import { ModeSelector } from './ModeSelector';
import { DuplicateGroupList } from './DuplicateGroupList';
import { ConfidenceFilter } from './ConfidenceFilter';
import { useDuplicateSummary, useDuplicatesPaginated, useMergeContacts, fetchAllDuplicateGroups } from '../api/deduplicationHooks';
import { useDeleteContacts } from '../api/cleanupHooks';
import { useArchiveContacts } from '../api/archiveHooks';
import type { ConfidenceLevel, DeduplicationMode, DuplicateGroup } from '../api/types';
import type { OutletContext } from './Layout';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { useToast } from './ui/Toast';

const ALL_CONFIDENCE_LEVELS: Set<ConfidenceLevel> = new Set(['very_high', 'high', 'medium']);

export function DeduplicationView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const { showToast } = useToast();
  const [selectedMode, setSelectedMode] = useState<DeduplicationMode>('email');
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(new Set());
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

  const handleMerge = useCallback(
    (contactIds: number[], primaryContactId: number) => {
      mergeMutation.mutate(
        { contactIds, primaryContactId },
        {
          onSuccess: (result) => {
            // Show confirmation toast
            showToast(`Merged ${contactIds.length} contacts into "${result.mergedContact.displayName}"`);
          },
        }
      );
    },
    [mergeMutation, showToast]
  );

  const handleKeepSeparate = useCallback((groupId: string) => {
    setHiddenGroupIds((prev) => new Set([...prev, groupId]));
  }, []);

  const handleModeChange = useCallback((mode: DeduplicationMode) => {
    setSelectedMode(mode);
    // Reset state when mode changes
    setHiddenGroupIds(new Set());
    setConfidenceFilter(new Set(ALL_CONFIDENCE_LEVELS));
    setCurrentPage(1);
    setSelectedContactIds(new Set());
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
    // Reset page when filter changes
    setCurrentPage(1);
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

        // Show success toast
        showToast(message);
      },
    });

    setShowDeleteConfirm(false);
  }, [selectedContactIds, deleteMutation, showToast]);

  const handleArchiveSelected = useCallback(() => {
    if (selectedContactIds.size === 0) return;

    archiveMutation.mutate(Array.from(selectedContactIds), {
      onSuccess: (result) => {
        const message = `Archived ${result.archivedCount} contact${result.archivedCount !== 1 ? 's' : ''}`;

        // Clear selection
        setSelectedContactIds(new Set());

        // Show success toast
        showToast(message);
      },
    });

    setShowArchiveConfirm(false);
  }, [selectedContactIds, archiveMutation, showToast]);

  const groups = useMemo<DuplicateGroup[]>(
    () => duplicatesData?.groups ?? [],
    [duplicatesData?.groups]
  );
  const totalGroups = duplicatesData?.totalGroups ?? 0;
  const totalPages = Math.ceil(totalGroups / PAGE_SIZE);
  const visibleCount = groups.filter((g) => !hiddenGroupIds.has(g.id)).length;

  useEffect(() => {
    setHeaderConfig({
      title: 'Resolve Duplicates',
      breadcrumbs: [{ label: 'Tools', to: '/tools' }],
      info: !isDuplicatesLoading ? (
        <span>{visibleCount} of {totalGroups} duplicate groups</span>
      ) : undefined,
    });
  }, [setHeaderConfig, isDuplicatesLoading, visibleCount, totalGroups]);

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

    // Show completion toast
    showToast(`Merged ${groupsToMerge.length} duplicate groups`);
  }, [groups, hiddenGroupIds, mergeMutation, showToast]);

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

      // Show completion toast
      showToast(`Merged all ${allGroups.length} duplicate groups`);
    } catch (error) {
      console.error('Failed to fetch all groups:', error);
      setMergeAllGlobalProgress(null);
    }
  }, [selectedMode, confidenceFilter, mergeMutation, showToast]);

  return (
    <div className="dedup-view">
      <div className="dedup-header">
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
                    <Icon name="box-archive" />
                    {archiveMutation.isPending
                      ? 'Archiving...'
                      : `Archive (${selectedContactIds.size})`}
                  </button>
                  <button
                    className="delete-selected-button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deleteMutation.isPending}
                  >
                    <Icon name="trash" />
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
                  <Icon name="code-merge" />
                  {mergeAllProgress
                    ? `Merging ${mergeAllProgress.current}/${mergeAllProgress.total}...`
                    : `Merge Page (${visibleCount})`}
                </button>
                <button
                  className="merge-all-button merge-all-global"
                  onClick={() => setShowMergeAllGlobalConfirm(true)}
                  disabled={mergeMutation.isPending || mergeAllProgress !== null || mergeAllGlobalProgress !== null}
                >
                  <Icon name="code-merge" />
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
          <LoadingSpinner message="Finding duplicates..." />
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

      {showMergeAllConfirm && (
        <ConfirmDialog
          title="Merge All on This Page?"
          message={`This will merge ${visibleCount} duplicate group${visibleCount !== 1 ? 's' : ''} on this page. The first contact in each group will be kept as the primary.`}
          confirmLabel="Merge All"
          onConfirm={() => {
            setShowMergeAllConfirm(false);
            handleMergeAll();
          }}
          onCancel={() => setShowMergeAllConfirm(false)}
        />
      )}

      {showMergeAllGlobalConfirm && (
        <ConfirmDialog
          title="Merge All Duplicates?"
          message={
            <>
              This will merge all {totalGroups} duplicate group{totalGroups !== 1 ? 's' : ''}
              {selectedMode === 'recommended' && confidenceFilter.size < 3 &&
                ' matching the selected confidence levels'}.
              The first contact in each group will be kept as the primary.
            </>
          }
          confirmLabel="Merge All"
          onConfirm={() => {
            setShowMergeAllGlobalConfirm(false);
            handleMergeAllGlobal();
          }}
          onCancel={() => setShowMergeAllGlobalConfirm(false)}
        >
          <p className="warning-text">This action cannot be undone.</p>
        </ConfirmDialog>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title={`Delete ${selectedContactIds.size} Contact${selectedContactIds.size !== 1 ? 's' : ''}?`}
          message="This action cannot be undone. The selected contacts will be permanently deleted."
          confirmLabel="Delete"
          danger
          onConfirm={handleDeleteSelected}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Archive confirmation modal */}
      {showArchiveConfirm && (
        <ConfirmDialog
          title={`Archive ${selectedContactIds.size} Contact${selectedContactIds.size !== 1 ? 's' : ''}?`}
          message="Archived contacts will be moved to the Archive section. You can restore them later or permanently delete them."
          confirmLabel="Archive"
          onConfirm={handleArchiveSelected}
          onCancel={() => setShowArchiveConfirm(false)}
        />
      )}
    </div>
  );
}

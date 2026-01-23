import { useState, useCallback, useEffect } from 'react';
import { ModeSelector } from './ModeSelector';
import { DuplicateGroupList } from './DuplicateGroupList';
import { ConfidenceFilter } from './ConfidenceFilter';
import { useDuplicateSummary, useDuplicatesPaginated, useMergeContacts } from '../api/deduplicationHooks';
import type { ConfidenceLevel, DeduplicationMode, DuplicateGroup } from '../api/types';

interface DeduplicationViewProps {
  onBack: () => void;
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
  const [confidenceFilter, setConfidenceFilter] = useState<Set<ConfidenceLevel>>(new Set(ALL_CONFIDENCE_LEVELS));
  const [currentPage, setCurrentPage] = useState(1);

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

  // Clear hidden groups, reset confidence filter, and reset page when mode changes
  useEffect(() => {
    setHiddenGroupIds(new Set());
    setConfidenceFilter(new Set(ALL_CONFIDENCE_LEVELS));
    setCurrentPage(1);
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
            </div>
            {visibleCount > 0 && (
              <button
                className="merge-all-button"
                onClick={() => setShowMergeAllConfirm(true)}
                disabled={mergeMutation.isPending || mergeAllProgress !== null}
              >
                <span className="material-symbols-outlined">merge</span>
                {mergeAllProgress
                  ? `Merging ${mergeAllProgress.current}/${mergeAllProgress.total}...`
                  : `Merge Page (${visibleCount})`}
              </button>
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
    </div>
  );
}

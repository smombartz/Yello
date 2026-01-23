import { useState, useCallback, useEffect } from 'react';
import { ModeSelector } from './ModeSelector';
import { DuplicateGroupList } from './DuplicateGroupList';
import { useDuplicateSummary, useDuplicatesInfinite, useMergeContacts } from '../api/deduplicationHooks';
import type { DeduplicationMode, DuplicateGroup } from '../api/types';

interface DeduplicationViewProps {
  onBack: () => void;
}

interface UndoState {
  groupId: string;
  message: string;
  timeout: ReturnType<typeof setTimeout>;
}

export function DeduplicationView({ onBack }: DeduplicationViewProps) {
  const [selectedMode, setSelectedMode] = useState<DeduplicationMode>('email');
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(new Set());
  const [undoState, setUndoState] = useState<UndoState | null>(null);

  const { data: summary, isLoading: isSummaryLoading } = useDuplicateSummary();

  const {
    data: duplicatesData,
    isLoading: isDuplicatesLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useDuplicatesInfinite(selectedMode);

  const mergeMutation = useMergeContacts();

  // Clear hidden groups when mode changes
  useEffect(() => {
    setHiddenGroupIds(new Set());
  }, [selectedMode]);

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

  const allGroups: DuplicateGroup[] =
    duplicatesData?.pages.flatMap((page) => page.groups) ?? [];

  const totalGroups = duplicatesData?.pages[0]?.totalGroups ?? 0;
  const visibleCount = allGroups.filter((g) => !hiddenGroupIds.has(g.id)).length;

  return (
    <div className="dedup-view">
      <div className="dedup-header">
        <div className="dedup-header-top">
          <button className="back-button" onClick={onBack}>
            <span className="material-symbols-outlined">arrow_back</span>
            <span>Back to Contacts</span>
          </button>
          <h1>Resolve Duplicates</h1>
        </div>

        <ModeSelector
          selectedMode={selectedMode}
          onModeChange={handleModeChange}
          summary={summary}
          isLoading={isSummaryLoading}
        />

        {!isDuplicatesLoading && (
          <div className="dedup-stats">
            {visibleCount} of {totalGroups} duplicate groups
            {hiddenGroupIds.size > 0 && (
              <span className="hidden-count">
                ({hiddenGroupIds.size} marked as separate)
              </span>
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
            groups={allGroups}
            hiddenGroupIds={hiddenGroupIds}
            onMerge={handleMerge}
            onKeepSeparate={handleKeepSeparate}
            isMerging={mergeMutation.isPending}
            hasNextPage={hasNextPage ?? false}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
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
    </div>
  );
}

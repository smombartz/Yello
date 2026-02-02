import { useState, useCallback, useEffect } from 'react';
import { DuplicateGroupList } from './DuplicateGroupList';
import { useSocialLinksCrossContact, fetchAllSocialLinksCrossContactGroups } from '../api/socialLinksHooks';
import { useMergeContacts } from '../api/deduplicationHooks';

interface ToastState {
  message: string;
  timeout: ReturnType<typeof setTimeout>;
}

const PAGE_SIZE = 50;

export function SocialLinksCrossContact() {
  const [currentPage, setCurrentPage] = useState(1);
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastState | null>(null);

  // Merge Page state
  const [showMergePageConfirm, setShowMergePageConfirm] = useState(false);
  const [mergePageProgress, setMergePageProgress] = useState<{ current: number; total: number } | null>(null);

  // Merge All state
  const [showMergeAllConfirm, setShowMergeAllConfirm] = useState(false);
  const [mergeAllProgress, setMergeAllProgress] = useState<{ current: number; total: number } | null>(null);

  const {
    data: duplicatesData,
    isLoading,
    isFetching,
  } = useSocialLinksCrossContact(currentPage, PAGE_SIZE);

  const mergeMutation = useMergeContacts();

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toast?.timeout) {
        clearTimeout(toast.timeout);
      }
    };
  }, [toast]);

  const handleMerge = useCallback(
    (contactIds: number[], primaryContactId: number) => {
      mergeMutation.mutate(
        { contactIds, primaryContactId },
        {
          onSuccess: (result) => {
            const message = `Merged ${contactIds.length} contacts into "${result.mergedContact.displayName}"`;

            // Clear any existing toast timeout
            if (toast?.timeout) {
              clearTimeout(toast.timeout);
            }

            // Show success toast
            const timeout = setTimeout(() => setToast(null), 5000);
            setToast({ message, timeout });
          },
        }
      );
    },
    [mergeMutation, toast]
  );

  const handleKeepSeparate = useCallback((groupId: string) => {
    setHiddenGroupIds((prev) => new Set([...prev, groupId]));
  }, []);

  const groups = duplicatesData?.groups ?? [];
  const totalGroups = duplicatesData?.totalGroups ?? 0;
  const totalPages = Math.ceil(totalGroups / PAGE_SIZE);

  // Merge Page - merges only visible groups on the current page
  const handleMergePage = useCallback(async () => {
    const groupsToMerge = groups.filter((g) => !hiddenGroupIds.has(g.id));
    if (groupsToMerge.length === 0) return;

    setMergePageProgress({ current: 0, total: groupsToMerge.length });

    for (let i = 0; i < groupsToMerge.length; i++) {
      const group = groupsToMerge[i];
      const contactIds = group.contacts.map((c) => c.id);
      const primaryContactId = contactIds[0];

      try {
        await mergeMutation.mutateAsync({ contactIds, primaryContactId });
        setMergePageProgress({ current: i + 1, total: groupsToMerge.length });
      } catch (error) {
        console.error('Merge failed for group:', group.id, error);
        // Continue with remaining groups even if one fails
      }
    }

    setMergePageProgress(null);

    // Clear any existing toast timeout
    if (toast?.timeout) {
      clearTimeout(toast.timeout);
    }

    // Show completion toast
    const message = `Merged ${groupsToMerge.length} group${groupsToMerge.length !== 1 ? 's' : ''}`;
    const timeout = setTimeout(() => setToast(null), 5000);
    setToast({ message, timeout });
  }, [groups, hiddenGroupIds, mergeMutation, toast]);

  // Merge All - fetches all groups across all pages and merges them
  const handleMergeAll = useCallback(async () => {
    setMergeAllProgress({ current: 0, total: 0 });

    try {
      const allGroups = await fetchAllSocialLinksCrossContactGroups();

      if (allGroups.length === 0) {
        setMergeAllProgress(null);
        return;
      }

      setMergeAllProgress({ current: 0, total: allGroups.length });

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
        setMergeAllProgress({ current: i + 1, total: allGroups.length });
      }

      setMergeAllProgress(null);

      // Clear any existing toast timeout
      if (toast?.timeout) {
        clearTimeout(toast.timeout);
      }

      // Show completion toast
      const message = `Merged all ${allGroups.length} group${allGroups.length !== 1 ? 's' : ''}`;
      const timeout = setTimeout(() => setToast(null), 5000);
      setToast({ message, timeout });
    } catch (error) {
      console.error('Failed to fetch all groups:', error);
      setMergeAllProgress(null);
    }
  }, [mergeMutation, toast]);

  if (isLoading) {
    return (
      <div className="social-links-loading">
        <span className="material-symbols-outlined spinning">sync</span>
        <p>Finding contacts with shared social profiles...</p>
      </div>
    );
  }

  if (totalGroups === 0) {
    return (
      <div className="social-links-empty">
        <span className="material-symbols-outlined">check_circle</span>
        <p>No contacts share the same social profile URLs</p>
      </div>
    );
  }

  const visibleGroupCount = groups.filter((group) => !hiddenGroupIds.has(group.id)).length;
  const isMerging = mergeMutation.isPending || mergePageProgress !== null || mergeAllProgress !== null;

  return (
    <div className="social-links-cross-contact">
      <div className="social-links-stats">
        <span>
          {totalGroups} group{totalGroups !== 1 ? 's' : ''} of contacts sharing social profiles
        </span>
        {visibleGroupCount > 0 && (
          <div className="merge-buttons">
            <button
              className="merge-all-button"
              onClick={() => setShowMergePageConfirm(true)}
              disabled={isMerging}
            >
              <span className="material-symbols-outlined">merge</span>
              {mergePageProgress
                ? `Merging ${mergePageProgress.current}/${mergePageProgress.total}...`
                : `Merge Page (${visibleGroupCount})`}
            </button>
            <button
              className="merge-all-button merge-all-global"
              onClick={() => setShowMergeAllConfirm(true)}
              disabled={isMerging}
            >
              <span className="material-symbols-outlined">merge_type</span>
              {mergeAllProgress
                ? `Merging ${mergeAllProgress.current}/${mergeAllProgress.total}...`
                : `Merge All (${totalGroups})`}
            </button>
          </div>
        )}
      </div>

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
        mode="social"
      />

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

      {/* Merge Page confirmation modal */}
      {showMergePageConfirm && (
        <div className="modal-overlay" onClick={() => setShowMergePageConfirm(false)}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Merge All on This Page?</h3>
            <p>
              This will merge {visibleGroupCount} duplicate group{visibleGroupCount !== 1 ? 's' : ''} on this page.
              The first contact in each group will be kept as the primary.
            </p>
            <div className="confirm-actions">
              <button className="cancel-button" onClick={() => setShowMergePageConfirm(false)}>
                Cancel
              </button>
              <button
                className="confirm-button"
                onClick={() => {
                  setShowMergePageConfirm(false);
                  handleMergePage();
                }}
              >
                Merge All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge All confirmation modal */}
      {showMergeAllConfirm && (
        <div className="modal-overlay" onClick={() => setShowMergeAllConfirm(false)}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Merge All Duplicates?</h3>
            <p>
              This will merge all {totalGroups} duplicate group{totalGroups !== 1 ? 's' : ''} sharing social profiles.
              The first contact in each group will be kept as the primary.
            </p>
            <p className="warning-text">This action cannot be undone.</p>
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

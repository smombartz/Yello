import { useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DuplicateGroup } from './DuplicateGroup';
import type { DuplicateGroup as DuplicateGroupType, DeduplicationMode } from '../api/types';

interface DuplicateGroupListProps {
  groups: DuplicateGroupType[];
  hiddenGroupIds: Set<string>;
  onMerge: (contactIds: number[], primaryContactId: number) => void;
  onKeepSeparate: (groupId: string) => void;
  isMerging: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  mode: DeduplicationMode;
}

export function DuplicateGroupList({
  groups,
  hiddenGroupIds,
  onMerge,
  onKeepSeparate,
  isMerging,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: DuplicateGroupListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const visibleGroups = groups.filter((g) => !hiddenGroupIds.has(g.id));

  const virtualizer = useVirtualizer({
    count: visibleGroups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 3,
  });

  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    if (scrollHeight - scrollTop - clientHeight < 500 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (visibleGroups.length === 0) {
    return (
      <div className="duplicate-group-list-empty">
        <span className="material-symbols-outlined">check_circle</span>
        <p>No duplicates found for this mode</p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="duplicate-group-list"
      onScroll={handleScroll}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const group = visibleGroups[virtualItem.index];
          return (
            <div
              key={group.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
            >
              <DuplicateGroup
                group={group}
                onMerge={onMerge}
                onKeepSeparate={onKeepSeparate}
                isMerging={isMerging}
              />
            </div>
          );
        })}
      </div>

      {isFetchingNextPage && (
        <div className="loading-more">Loading more...</div>
      )}
    </div>
  );
}

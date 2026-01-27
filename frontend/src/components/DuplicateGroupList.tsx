import { DuplicateGroup } from './DuplicateGroup';
import { Pagination } from './Pagination';
import type { DuplicateGroup as DuplicateGroupType, DeduplicationMode } from '../api/types';

interface DuplicateGroupListProps {
  groups: DuplicateGroupType[];
  hiddenGroupIds: Set<string>;
  onMerge: (contactIds: number[], primaryContactId: number) => void;
  onKeepSeparate: (groupId: string) => void;
  isMerging: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  mode: DeduplicationMode;
  selectedContactIds?: Set<number>;
  onToggleContactSelect?: (contactId: number) => void;
}

export function DuplicateGroupList({
  groups,
  hiddenGroupIds,
  onMerge,
  onKeepSeparate,
  isMerging,
  currentPage,
  totalPages,
  onPageChange,
  isLoading,
  selectedContactIds,
  onToggleContactSelect,
}: DuplicateGroupListProps) {
  const visibleGroups = groups.filter((g) => !hiddenGroupIds.has(g.id));

  if (visibleGroups.length === 0 && !isLoading) {
    return (
      <div className="duplicate-group-list-empty">
        <span className="material-symbols-outlined">check_circle</span>
        <p>No duplicates found for this mode</p>
      </div>
    );
  }

  return (
    <div className="duplicate-group-list">
      <div className="duplicate-group-list-content">
        {visibleGroups.map((group) => (
          <DuplicateGroup
            key={group.id}
            group={group}
            onMerge={onMerge}
            onKeepSeparate={onKeepSeparate}
            isMerging={isMerging}
            selectedContactIds={selectedContactIds}
            onToggleContactSelect={onToggleContactSelect}
          />
        ))}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        isLoading={isLoading}
      />
    </div>
  );
}

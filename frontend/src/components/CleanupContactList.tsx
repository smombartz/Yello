import { CleanupContactCard } from './CleanupContactCard';
import { Pagination } from './Pagination';
import type { CleanupContact, CleanupMode } from '../api/types';

interface CleanupContactListProps {
  contacts: CleanupContact[];
  selectedIds: Set<number>;
  onToggleSelect: (contactId: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  mode: CleanupMode;
}

export function CleanupContactList({
  contacts,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onSelectNone,
  currentPage,
  totalPages,
  onPageChange,
  isLoading,
  mode,
}: CleanupContactListProps) {
  const allOnPageSelected = contacts.length > 0 && contacts.every(c => selectedIds.has(c.id));
  const someSelected = selectedIds.size > 0;

  if (contacts.length === 0 && !isLoading) {
    return (
      <div className="cleanup-list-empty">
        <span className="material-symbols-outlined">check_circle</span>
        <p>
          {mode === 'empty'
            ? 'No empty contacts found'
            : 'No problematic email patterns found'}
        </p>
      </div>
    );
  }

  return (
    <div className="cleanup-list">
      <div className="cleanup-list-actions">
        <div className="cleanup-selection-actions">
          <button
            className="cleanup-action-button"
            onClick={onSelectAll}
            disabled={isLoading || allOnPageSelected}
          >
            <span className="material-symbols-outlined">select_all</span>
            Select All
          </button>
          <button
            className="cleanup-action-button"
            onClick={onSelectNone}
            disabled={isLoading || !someSelected}
          >
            <span className="material-symbols-outlined">deselect</span>
            Select None
          </button>
        </div>
        {someSelected && (
          <span className="cleanup-selection-count">
            {selectedIds.size} selected
          </span>
        )}
      </div>

      <div className="cleanup-list-content">
        {contacts.map((contact) => (
          <CleanupContactCard
            key={contact.id}
            contact={contact}
            isSelected={selectedIds.has(contact.id)}
            onToggleSelect={onToggleSelect}
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

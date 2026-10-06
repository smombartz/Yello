import { Icon } from './Icon';
import { Button } from './ui/Button';
import { CleanupContactCard } from './CleanupContactCard';
import { Pagination } from './Pagination';
import type { CleanupContact, CleanupMode } from '../api/types';

interface CleanupContactListProps {
  contacts: CleanupContact[];
  selectedIds: Set<number>;
  onToggleSelect: (contactId: number) => void;
  onSelectPage: () => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  currentPage: number;
  totalPages: number;
  totalContacts: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  isSelectingAll: boolean;
  mode: CleanupMode;
}

export function CleanupContactList({
  contacts,
  selectedIds,
  onToggleSelect,
  onSelectPage,
  onSelectAll,
  onSelectNone,
  currentPage,
  totalPages,
  totalContacts,
  onPageChange,
  isLoading,
  isSelectingAll,
  mode,
}: CleanupContactListProps) {
  const allOnPageSelected = contacts.length > 0 && contacts.every(c => selectedIds.has(c.id));
  const allSelected = selectedIds.size === totalContacts && totalContacts > 0;
  const someSelected = selectedIds.size > 0;

  if (contacts.length === 0 && !isLoading) {
    return (
      <div className="cleanup-list-empty">
        <Icon name="circle-check" />
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
          <Button
            variant="secondary"
            size="sm"
            icon="square-check"
            onClick={onSelectPage}
            disabled={isLoading || allOnPageSelected || isSelectingAll}
          >
            Select Page
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="square-check"
            onClick={onSelectAll}
            disabled={isLoading || allSelected || isSelectingAll}
          >
            {isSelectingAll ? 'Selecting...' : `Select All (${totalContacts})`}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onSelectNone}
            disabled={isLoading || !someSelected || isSelectingAll}
          >
            <Icon name="square" style="regular" />
            Select None
          </Button>
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

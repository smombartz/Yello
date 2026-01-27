import { useRef, useState, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useContacts, fetchAllContactIds } from '../api/hooks';
import { useDeleteContacts } from '../api/cleanupHooks';
import { useArchiveContacts } from '../api/archiveHooks';
import { ContactRow } from './ContactRow';
import { ContactGridCard } from './ContactGridCard';
import { ViewToggle } from './ViewToggle';

interface ContactListProps {
  search: string;
  categoryFilter?: string;
}

interface ToastState {
  message: string;
  timeout: ReturnType<typeof setTimeout>;
}

const COLLAPSED_HEIGHT = 92;   // 80 + 12 (0.75rem gap)
const EXPANDED_HEIGHT = 462;   // 450 + 12 (0.75rem gap)
const PAGE_SIZE = 100;

export function ContactList({ search, categoryFilter }: ContactListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    return (localStorage.getItem('contactViewMode') as 'list' | 'grid') || 'list';
  });

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isSelectingAll, setIsSelectingAll] = useState(false);

  const { data, isLoading, error } = useContacts(1, PAGE_SIZE, search || undefined, categoryFilter);
  const deleteMutation = useDeleteContacts();
  const archiveMutation = useArchiveContacts();

  // Clear selection when search changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search]);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toast?.timeout) {
        clearTimeout(toast.timeout);
      }
    };
  }, [toast]);

  const handleToggle = useCallback((id: number) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const handleViewChange = (view: 'list' | 'grid') => {
    setViewMode(view);
    localStorage.setItem('contactViewMode', view);
  };

  // Selection handlers
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

  const handleSelectPage = useCallback(() => {
    if (!data?.contacts) return;
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      data.contacts.forEach(c => newSet.add(c.id));
      return newSet;
    });
  }, [data]);

  const handleSelectAll = useCallback(async () => {
    setIsSelectingAll(true);
    try {
      const allIds = await fetchAllContactIds(search || undefined);
      setSelectedIds(new Set(allIds));
    } catch (error) {
      console.error('Failed to fetch all contact IDs:', error);
    } finally {
      setIsSelectingAll(false);
    }
  }, [search]);

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

  const virtualizer = useVirtualizer({
    count: data?.contacts.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index: number) => {
      const contact = data?.contacts[index];
      return contact?.id === expandedId ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
    }, [data?.contacts, expandedId]),
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  if (isLoading) {
    return (
      <div className="loading-state">
        <span aria-busy="true">Loading contacts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        Error loading contacts: {error.message}
      </div>
    );
  }

  if (!data?.contacts.length) {
    return (
      <div className="empty-state">
        {search ? `No contacts match "${search}"` : 'No contacts yet. Import a VCF file to get started.'}
      </div>
    );
  }

  const selectionEnabled = true;

  return (
    <div className="contact-list">
      <div className="contact-list-header">
        <div className="contact-count">
          {data.total.toLocaleString()} contact{data.total !== 1 ? 's' : ''}
        </div>
        <ViewToggle view={viewMode} onViewChange={handleViewChange} />
      </div>

      {/* Selection toolbar */}
      <div className="contact-list-actions">
        <div className="contact-selection-actions">
          <button
            className="contact-action-button"
            onClick={handleSelectPage}
            disabled={isSelectingAll}
          >
            Select Page
          </button>
          <button
            className="contact-action-button"
            onClick={handleSelectAll}
            disabled={isSelectingAll}
          >
            {isSelectingAll ? 'Selecting...' : 'Select All'}
          </button>
          <button
            className="contact-action-button"
            onClick={handleSelectNone}
            disabled={selectedIds.size === 0}
          >
            Select None
          </button>
        </div>

        {selectedIds.size > 0 && (
          <div className="contact-action-buttons">
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

      {viewMode === 'list' ? (
        <div
          ref={parentRef}
          className="virtual-scroll-container"
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const contact = data.contacts[virtualRow.index];
              const isExpanded = contact.id === expandedId;

              return (
                <div
                  key={contact.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ContactRow
                    contact={contact}
                    isExpanded={isExpanded}
                    onToggle={handleToggle}
                    isSelected={selectedIds.has(contact.id)}
                    onToggleSelect={handleToggleSelect}
                    selectionEnabled={selectionEnabled}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="contact-grid">
          {data.contacts.map(contact => (
            <ContactGridCard
              key={contact.id}
              contact={contact}
              onClick={() => handleToggle(contact.id)}
              isSelected={selectedIds.has(contact.id)}
              onToggleSelect={handleToggleSelect}
              selectionEnabled={selectionEnabled}
            />
          ))}
        </div>
      )}

      {/* Toast notification */}
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

      {/* Delete confirmation modal */}
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

      {/* Archive confirmation modal */}
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

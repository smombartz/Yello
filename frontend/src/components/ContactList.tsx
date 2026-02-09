import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useContacts, fetchAllContactIds, useMergePreview, useMergeSelectedContacts } from '../api/hooks';
import { useDeleteContacts } from '../api/cleanupHooks';
import { useArchiveContacts } from '../api/archiveHooks';
import { ContactRow } from './ContactRow';
import { ContactGridCard } from './ContactGridCard';
import { Icon } from './Icon';
import type { MergeConflict, ContactDetail } from '../api/types';

interface ContactListProps {
  search?: string;
  categoryFilter?: string;
  viewMode: 'list' | 'grid';
  onTotalChange?: (total: number) => void;
}

interface ToastState {
  message: string;
  timeout: ReturnType<typeof setTimeout>;
}

const COLLAPSED_HEIGHT = 92;   // 80 + 12 (0.75rem gap)
const EXPANDED_HEIGHT = 462;   // 450 + 12 (0.75rem gap)
const PAGE_SIZE = 100;

export function ContactList({ search = '', categoryFilter, viewMode, onTotalChange }: ContactListProps) {
  const navigate = useNavigate();
  const parentRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isSelectingAll, setIsSelectingAll] = useState(false);

  // Merge state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[]>([]);
  const [mergeContacts, setMergeContacts] = useState<ContactDetail[]>([]);
  const [mergePrimaryId, setMergePrimaryId] = useState<number | null>(null);
  const [mergeResolutions, setMergeResolutions] = useState<Record<string, string | null>>({});

  const { data, isLoading, error } = useContacts(1, PAGE_SIZE, search || undefined, categoryFilter);
  const deleteMutation = useDeleteContacts();
  const archiveMutation = useArchiveContacts();
  const mergePreviewMutation = useMergePreview();
  const mergeMutation = useMergeSelectedContacts();

  // Clear selection when search changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search]);

  // Report total count to parent
  useEffect(() => {
    if (onTotalChange && data?.total !== undefined) {
      onTotalChange(data.total);
    }
  }, [data?.total, onTotalChange]);

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

  const handleMergeClick = useCallback(() => {
    if (selectedIds.size < 2) return;

    mergePreviewMutation.mutate(Array.from(selectedIds), {
      onSuccess: (result) => {
        setMergeConflicts(result.conflicts);
        setMergeContacts(result.contacts);
        setMergePrimaryId(result.contacts[0]?.id ?? null);
        // Initialize resolutions with primary contact's values for conflict fields
        const initialResolutions: Record<string, string | null> = {};
        result.conflicts.forEach(conflict => {
          const primaryValue = conflict.values.find(v => v.contactId === result.contacts[0]?.id);
          initialResolutions[conflict.field] = primaryValue?.value ?? null;
        });
        setMergeResolutions(initialResolutions);
        setShowMergeModal(true);
      },
    });
  }, [selectedIds, mergePreviewMutation]);

  const handleMergeConfirm = useCallback(() => {
    if (!mergePrimaryId || mergeContacts.length < 2) return;

    const contactIds = mergeContacts.map(c => c.id);
    mergeMutation.mutate(
      {
        contactIds,
        primaryContactId: mergePrimaryId,
        resolutions: mergeConflicts.length > 0 ? mergeResolutions : undefined,
      },
      {
        onSuccess: (result) => {
          const deletedCount = result.deletedContactIds.length;
          const message = `Merged ${deletedCount + 1} contacts into one`;

          // Clear selection
          setSelectedIds(new Set());

          // Clear merge state
          setShowMergeModal(false);
          setMergeConflicts([]);
          setMergeContacts([]);
          setMergePrimaryId(null);
          setMergeResolutions({});

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
  }, [mergePrimaryId, mergeContacts, mergeConflicts, mergeResolutions, mergeMutation, toast]);

  const handleMergeCancel = useCallback(() => {
    setShowMergeModal(false);
    setMergeConflicts([]);
    setMergeContacts([]);
    setMergePrimaryId(null);
    setMergeResolutions({});
  }, []);

  const handleResolutionChange = useCallback((field: string, value: string | null) => {
    setMergeResolutions(prev => ({
      ...prev,
      [field]: value,
    }));
  }, []);

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
            {selectedIds.size >= 2 && (
              <button
                className="merge-selected-button"
                onClick={handleMergeClick}
                disabled={mergePreviewMutation.isPending || mergeMutation.isPending}
              >
                <Icon name="code-merge" />
                {mergePreviewMutation.isPending
                  ? 'Loading...'
                  : `Merge Selected (${selectedIds.size})`}
              </button>
            )}
            <button
              className="archive-selected-button"
              onClick={() => setShowArchiveConfirm(true)}
              disabled={archiveMutation.isPending}
            >
              <Icon name="box-archive" />
              {archiveMutation.isPending
                ? 'Archiving...'
                : `Archive Selected (${selectedIds.size})`}
            </button>
            <button
              className="delete-selected-button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteMutation.isPending}
            >
              <Icon name="trash" />
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
              onClick={() => navigate(`/contacts/${contact.id}`)}
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
          <Icon name="circle-check" />
          <span className="message">{toast.message}</span>
          <button
            className="dismiss"
            onClick={() => {
              if (toast.timeout) clearTimeout(toast.timeout);
              setToast(null);
            }}
          >
            <Icon name="xmark" />
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

      {/* Merge conflict resolution modal */}
      {showMergeModal && (
        <div className="modal-overlay" onClick={handleMergeCancel}>
          <div className="modal-content merge-conflict-modal" onClick={(e) => e.stopPropagation()}>
            <div className="merge-modal-header">
              <h3>Merge {mergeContacts.length} Contacts</h3>
              <button className="close-button" onClick={handleMergeCancel}>
                <Icon name="xmark" />
              </button>
            </div>

            <div className="merge-modal-body">
              {/* Primary contact selector */}
              <div className="merge-primary-section">
                <p className="merge-section-label">Select primary contact (click to select):</p>
                <div className="merge-contact-cards">
                  {mergeContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className={`merge-contact-card ${mergePrimaryId === contact.id ? 'primary' : ''}`}
                      onClick={() => setMergePrimaryId(contact.id)}
                    >
                      {mergePrimaryId === contact.id && (
                        <div className="primary-badge">Primary</div>
                      )}
                      <div className="merge-contact-avatar">
                        {contact.photoUrl ? (
                          <img src={contact.photoUrl} alt={contact.displayName} />
                        ) : (
                          <Icon name="user" />
                        )}
                      </div>
                      <div className="merge-contact-info">
                        <div className="merge-contact-name">{contact.displayName}</div>
                        {contact.company && (
                          <div className="merge-contact-company">{contact.company}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conflict resolution */}
              {mergeConflicts.length > 0 && (
                <div className="merge-conflicts-section">
                  <p className="merge-section-label">Resolve conflicts:</p>
                  {mergeConflicts.map((conflict) => (
                    <div key={conflict.field} className="merge-conflict-field">
                      <div className="conflict-field-name">
                        {conflict.field === 'firstName' && 'First Name'}
                        {conflict.field === 'lastName' && 'Last Name'}
                        {conflict.field === 'company' && 'Company'}
                        {conflict.field === 'title' && 'Title'}
                        {conflict.field === 'birthday' && 'Birthday'}
                      </div>
                      <div className="conflict-options">
                        {conflict.values.map((option) => (
                          <label key={`${conflict.field}-${option.contactId}`} className="conflict-option">
                            <input
                              type="radio"
                              name={conflict.field}
                              value={option.value}
                              checked={mergeResolutions[conflict.field] === option.value}
                              onChange={() => handleResolutionChange(conflict.field, option.value)}
                            />
                            <span className="option-value">"{option.value}"</span>
                            <span className="option-source">from {option.contactName}</span>
                          </label>
                        ))}
                        <label className="conflict-option">
                          <input
                            type="radio"
                            name={conflict.field}
                            value=""
                            checked={mergeResolutions[conflict.field] === null}
                            onChange={() => handleResolutionChange(conflict.field, null)}
                          />
                          <span className="option-value empty">Keep empty</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {mergeConflicts.length === 0 && (
                <div className="merge-no-conflicts">
                  <Icon name="circle-check" />
                  <p>No conflicts detected. Contacts can be merged directly.</p>
                </div>
              )}
            </div>

            <div className="merge-modal-footer">
              <button className="cancel-button" onClick={handleMergeCancel}>
                Cancel
              </button>
              <button
                className="confirm-button"
                onClick={handleMergeConfirm}
                disabled={mergeMutation.isPending || !mergePrimaryId}
              >
                {mergeMutation.isPending ? 'Merging...' : 'Merge Contacts'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

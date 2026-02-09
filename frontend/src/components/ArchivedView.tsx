import { useState, useCallback, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { Icon } from './Icon';
import {
  useArchivedContacts,
  useArchivedCount,
  useUnarchiveContacts,
  useDeleteArchivedContacts,
  exportArchivedContacts
} from '../api/archiveHooks';

interface ToastState {
  message: string;
  timeout: ReturnType<typeof setTimeout>;
}

const PAGE_SIZE = 50;

export function ArchivedView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const { data: countData } = useArchivedCount();
  const {
    data: contactsData,
    isLoading: isContactsLoading,
    isFetching
  } = useArchivedContacts(currentPage, PAGE_SIZE);

  const unarchiveMutation = useUnarchiveContacts();
  const deleteMutation = useDeleteArchivedContacts();

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toast?.timeout) {
        clearTimeout(toast.timeout);
      }
    };
  }, [toast]);

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
    if (!contactsData?.contacts) return;
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      contactsData.contacts.forEach(c => newSet.add(c.id));
      return newSet;
    });
  }, [contactsData]);

  const handleSelectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleRestore = useCallback(() => {
    if (selectedIds.size === 0) return;

    unarchiveMutation.mutate(Array.from(selectedIds), {
      onSuccess: (result) => {
        const message = `Restored ${result.unarchivedCount} contact${result.unarchivedCount !== 1 ? 's' : ''}`;

        setSelectedIds(new Set());

        if (toast?.timeout) {
          clearTimeout(toast.timeout);
        }

        const timeout = setTimeout(() => setToast(null), 5000);
        setToast({ message, timeout });
      },
    });

    setShowRestoreConfirm(false);
  }, [selectedIds, unarchiveMutation, toast]);

  const handleDelete = useCallback(() => {
    if (selectedIds.size === 0) return;

    deleteMutation.mutate(Array.from(selectedIds), {
      onSuccess: (result) => {
        const message = `Permanently deleted ${result.deletedCount} contact${result.deletedCount !== 1 ? 's' : ''}`;

        setSelectedIds(new Set());

        if (toast?.timeout) {
          clearTimeout(toast.timeout);
        }

        const timeout = setTimeout(() => setToast(null), 5000);
        setToast({ message, timeout });
      },
    });

    setShowDeleteConfirm(false);
  }, [selectedIds, deleteMutation, toast]);

  const handleExport = useCallback(() => {
    exportArchivedContacts();
  }, []);

  const contacts = contactsData?.contacts ?? [];
  const total = contactsData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const archivedCount = countData?.count ?? 0;

  useEffect(() => {
    setHeaderConfig({
      title: 'Archived',
      info: <span>{archivedCount} contacts</span>,
      actions: archivedCount > 0 ? (
        <button className="header-action-btn secondary" onClick={handleExport}>
          <Icon name="download" />
          Export VCF
        </button>
      ) : undefined,
    });
  }, [setHeaderConfig, archivedCount, handleExport]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="archived-view">
      {selectedIds.size > 0 && (
        <div className="archived-actions">
          <button
            className="restore-button"
            onClick={() => setShowRestoreConfirm(true)}
            disabled={unarchiveMutation.isPending}
          >
            <Icon name="box-open" />
            {unarchiveMutation.isPending
              ? 'Restoring...'
              : `Restore Selected (${selectedIds.size})`}
          </button>
          <button
            className="delete-selected-button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleteMutation.isPending}
          >
            <Icon name="trash-can" />
            {deleteMutation.isPending
              ? 'Deleting...'
              : `Delete Permanently (${selectedIds.size})`}
          </button>
        </div>
      )}

      <div className="archived-content">
        {isContactsLoading ? (
          <div className="archived-loading">
            <Icon name="arrows-rotate" className="spinning" />
            <p>Loading archived contacts...</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="archived-empty">
            <Icon name="boxes-stacked" />
            <h3>No Archived Contacts</h3>
            <p>Contacts you archive will appear here.</p>
          </div>
        ) : (
          <div className="archived-list">
            <div className="archived-list-actions">
              <div className="archived-selection-actions">
                <button
                  className="cleanup-action-button"
                  onClick={handleSelectPage}
                  disabled={isFetching}
                >
                  <Icon name="square-check" />
                  Select Page
                </button>
                {selectedIds.size > 0 && (
                  <button
                    className="cleanup-action-button"
                    onClick={handleSelectNone}
                  >
                    <Icon name="square" style="regular" />
                    Select None
                  </button>
                )}
              </div>
              {selectedIds.size > 0 && (
                <span className="archived-selection-count">
                  {selectedIds.size} selected
                </span>
              )}
            </div>

            <div className="archived-list-content">
              {contacts.map(contact => (
                <div
                  key={contact.id}
                  className={`archived-card ${selectedIds.has(contact.id) ? 'selected' : ''}`}
                >
                  <div className="archived-card-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(contact.id)}
                      onChange={() => handleToggleSelect(contact.id)}
                    />
                  </div>
                  <div className="archived-card-content">
                    <div className="archived-card-header">
                      <div className="archived-card-name">
                        <span className="name">
                          {contact.displayName || '(No name)'}
                        </span>
                        {contact.company && (
                          <span className="company">{contact.company}</span>
                        )}
                      </div>
                      <span className="archived-date">
                        Archived {formatDate(contact.archivedAt)}
                      </span>
                    </div>
                    {contact.emails.length > 0 && (
                      <div className="archived-card-emails">
                        {contact.emails.slice(0, 2).map((email, idx) => (
                          <div key={idx} className="archived-card-email">
                            <Icon name="envelope" />
                            <span className="value">{email.email}</span>
                          </div>
                        ))}
                        {contact.emails.length > 2 && (
                          <span className="more-emails">
                            +{contact.emails.length - 2} more
                          </span>
                        )}
                      </div>
                    )}
                    {contact.phones.length > 0 && (
                      <div className="archived-card-phones">
                        {contact.phones.slice(0, 1).map((phone, idx) => (
                          <div key={idx} className="archived-card-phone">
                            <Icon name="phone" />
                            <span className="value">{phone.phoneDisplay}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="pagination-button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || isFetching}
                >
                  <Icon name="chevron-left" />
                  Previous
                </button>
                <span className="pagination-indicator">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="pagination-button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || isFetching}
                >
                  Next
                  <Icon name="chevron-right" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

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

      {showRestoreConfirm && (
        <div className="modal-overlay" onClick={() => setShowRestoreConfirm(false)}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Restore {selectedIds.size} Contact{selectedIds.size !== 1 ? 's' : ''}?</h3>
            <p>
              The selected contacts will be restored and will appear in your contact list again.
            </p>
            <div className="confirm-actions">
              <button className="cancel-button" onClick={() => setShowRestoreConfirm(false)}>
                Cancel
              </button>
              <button
                className="confirm-button"
                onClick={handleRestore}
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Permanently Delete {selectedIds.size} Contact{selectedIds.size !== 1 ? 's' : ''}?</h3>
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
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

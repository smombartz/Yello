import { useState, useCallback, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Icon } from './Icon';
import {
  useDeleteAllContacts,
  exportAllContacts
} from '../api/settingsHooks';
import type { OutletContext } from './Layout';

interface ToastState {
  message: string;
  type: 'success' | 'error';
  timeout: ReturnType<typeof setTimeout>;
}

export function SettingsView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const deleteMutation = useDeleteAllContacts();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [exportExpanded, setExportExpanded] = useState(false);
  const [dangerExpanded, setDangerExpanded] = useState(false);

  useEffect(() => {
    setHeaderConfig({ title: 'Tools' });
  }, [setHeaderConfig]);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toast?.timeout) {
        clearTimeout(toast.timeout);
      }
    };
  }, [toast]);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toast?.timeout) {
      clearTimeout(toast.timeout);
    }
    const timeout = setTimeout(() => setToast(null), 5000);
    setToast({ message, type, timeout });
  }, [toast]);

  const handleExport = useCallback(() => {
    exportAllContacts();
    showToast('Export started - check your downloads', 'success');
  }, [showToast]);

  const handleDeleteAll = useCallback(() => {
    if (deleteConfirmText !== 'DELETE') return;

    deleteMutation.mutate(undefined, {
      onSuccess: (result) => {
        showToast(`Deleted ${result.deletedCount} contacts`, 'success');
        setShowDeleteConfirm(false);
        setDeleteConfirmText('');
      },
      onError: () => {
        showToast('Failed to delete contacts', 'error');
      }
    });
  }, [deleteConfirmText, deleteMutation, showToast]);

  return (
    <div className="settings-view">
      <div className="settings-content">
        {/* Page Links */}
        <nav className="settings-nav">
          <Link to="/import" className="collapsible-card settings-nav-link">
            <div className="settings-section-header">
              <Icon name="download" />
              <h2>Import</h2>
            </div>
            <Icon name="chevron-right" className="nav-link-arrow" />
          </Link>
          <Link to="/merge" className="collapsible-card settings-nav-link">
            <div className="settings-section-header">
              <Icon name="code-merge" />
              <h2>Merge</h2>
            </div>
            <Icon name="chevron-right" className="nav-link-arrow" />
          </Link>
          <Link to="/cleanup" className="collapsible-card settings-nav-link">
            <div className="settings-section-header">
              <Icon name="broom" />
              <h2>Cleanup</h2>
            </div>
            <Icon name="chevron-right" className="nav-link-arrow" />
          </Link>
          <Link to="/enrich" className="collapsible-card settings-nav-link">
            <div className="settings-section-header">
              <Icon name="wand-magic-sparkles" />
              <h2>Enrich</h2>
            </div>
            <Icon name="chevron-right" className="nav-link-arrow" />
          </Link>
        </nav>

        {/* Export Section */}
        <section className={`settings-section collapsible-card${exportExpanded ? ' expanded' : ''}`}>
          <button
            className="collapsible-header"
            onClick={() => setExportExpanded(!exportExpanded)}
          >
            <div className="settings-section-header">
              <Icon name="upload" />
              <h2>Export Data</h2>
            </div>
            <Icon name="chevron-down" className={`expand-icon${exportExpanded ? ' rotated' : ''}`} />
          </button>
          {exportExpanded && (
            <div className="collapsible-content">
              <p className="settings-description">
                Download all your contacts as a VCF file that can be imported into other applications.
              </p>
              <button className="secondary-button" onClick={handleExport}>
                <Icon name="download" />
                Export All Contacts (VCF)
              </button>
            </div>
          )}
        </section>

        {/* Danger Zone Section */}
        <section className={`settings-section danger-zone collapsible-card${dangerExpanded ? ' expanded' : ''}`}>
          <button
            className="collapsible-header"
            onClick={() => setDangerExpanded(!dangerExpanded)}
          >
            <div className="settings-section-header">
              <Icon name="triangle-exclamation" />
              <h2>Danger Zone</h2>
            </div>
            <Icon name="chevron-down" className={`expand-icon${dangerExpanded ? ' rotated' : ''}`} />
          </button>
          {dangerExpanded && (
            <div className="collapsible-content">
              <div className="danger-item">
                <div className="danger-info">
                  <h3>Delete All Contacts</h3>
                  <p>Permanently delete all contacts from the database. This action cannot be undone.</p>
                </div>
                <button
                  className="danger-button"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete All Contacts
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div className={`undo-toast ${toast.type === 'error' ? 'error' : ''}`}>
          <Icon name={toast.type === 'success' ? 'circle-check' : 'circle-exclamation'} />
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

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content confirm-dialog danger" onClick={(e) => e.stopPropagation()}>
            <h3>Delete All Contacts?</h3>
            <p>
              This will permanently delete <strong>all contacts</strong> from the database.
              This action cannot be undone.
            </p>
            <p className="confirm-instruction">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="confirm-input"
            />
            <div className="confirm-actions">
              <button
                className="cancel-button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                }}
              >
                Cancel
              </button>
              <button
                className="confirm-button danger"
                onClick={handleDeleteAll}
                disabled={deleteConfirmText !== 'DELETE' || deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete All Contacts'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useCallback, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  useDeleteAllContacts,
  useFetchContactPhotosStream,
  useImportLinkedInStream,
  parseLinkedInCsv,
  exportAllContacts
} from '../api/settingsHooks';
import { MobileHeader } from './MobileHeader';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

interface SettingsViewProps {
  onBack?: () => void;
}

interface ToastState {
  message: string;
  type: 'success' | 'error';
  timeout: ReturnType<typeof setTimeout>;
}

export function SettingsView({ onBack: _onBack }: SettingsViewProps) {
  const { isMobile } = useOutletContext<OutletContext>();
  const deleteMutation = useDeleteAllContacts();
  const { isStreaming, progress, startFetching, cancel: cancelFetching } = useFetchContactPhotosStream();
  const {
    isImporting: isImportingLinkedIn,
    progress: linkedInProgress,
    importResult: linkedInResult,
    error: linkedInError,
    startImport: startLinkedInImport,
    cancel: cancelLinkedInImport,
    reset: resetLinkedInImport
  } = useImportLinkedInStream();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [exportExpanded, setExportExpanded] = useState(false);
  const [photosExpanded, setPhotosExpanded] = useState(false);
  const [linkedInExpanded, setLinkedInExpanded] = useState(false);
  const [dangerExpanded, setDangerExpanded] = useState(false);
  const [linkedInFile, setLinkedInFile] = useState<File | null>(null);

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

  const handleLinkedInFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setLinkedInFile(file);
    // Reset previous results when a new file is selected
    resetLinkedInImport();
  }, [resetLinkedInImport]);

  const handleLinkedInImport = useCallback(async () => {
    if (!linkedInFile) return;

    try {
      const content = await linkedInFile.text();
      const contacts = parseLinkedInCsv(content);

      if (contacts.length === 0) {
        showToast('No valid contacts found in CSV file', 'error');
        return;
      }

      startLinkedInImport(contacts);
    } catch {
      showToast('Failed to read CSV file', 'error');
    }
  }, [linkedInFile, startLinkedInImport, showToast]);

  const handleFetchPhotos = useCallback(() => {
    startFetching(
      (result) => {
        if (result.downloaded > 0) {
          showToast(`Downloaded ${result.downloaded} photo${result.downloaded !== 1 ? 's' : ''} for your contacts`, 'success');
        } else if (result.matched > 0) {
          showToast('Photos found but failed to download. Please try again.', 'error');
        } else {
          showToast('No new photos found for contacts', 'success');
        }
      },
      (error) => {
        showToast(error, 'error');
      }
    );
  }, [startFetching, showToast]);

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
      {isMobile ? (
        <MobileHeader title="Settings" />
      ) : (
        <div className="settings-header">
          <h1>Settings</h1>
        </div>
      )}

      <div className="settings-content">
        {/* Export Section */}
        <section className={`settings-section collapsible-card${exportExpanded ? ' expanded' : ''}`}>
          <button
            className="collapsible-header"
            onClick={() => setExportExpanded(!exportExpanded)}
          >
            <div className="settings-section-header">
              <span className="material-symbols-outlined">download</span>
              <h2>Export Data</h2>
            </div>
            <span className={`material-symbols-outlined expand-icon${exportExpanded ? ' rotated' : ''}`}>
              expand_more
            </span>
          </button>
          {exportExpanded && (
            <div className="collapsible-content">
              <p className="settings-description">
                Download all your contacts as a VCF file that can be imported into other applications.
              </p>
              <button className="secondary-button" onClick={handleExport}>
                <span className="material-symbols-outlined">download</span>
                Export All Contacts (VCF)
              </button>
            </div>
          )}
        </section>

        {/* Fetch Contact Photos Section */}
        <section className={`settings-section collapsible-card${photosExpanded ? ' expanded' : ''}`}>
          <button
            className="collapsible-header"
            onClick={() => setPhotosExpanded(!photosExpanded)}
          >
            <div className="settings-section-header">
              <span className="material-symbols-outlined">photo_library</span>
              <h2>Fetch Contact Photos</h2>
            </div>
            <span className={`material-symbols-outlined expand-icon${photosExpanded ? ' rotated' : ''}`}>
              expand_more
            </span>
          </button>
          {photosExpanded && (
            <div className="collapsible-content">
              <p className="settings-description">
                Download profile photos for your contacts from Google Contacts and Gravatar.
                Only contacts with email addresses and no existing photo will be updated.
              </p>
              {isStreaming && progress && (
                <div className="photo-fetch-progress">
                  <div className="progress-bar-container">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                  <div className="progress-text">
                    Processing {progress.current} of {progress.total} contacts...
                  </div>
                  <div className="progress-stats">
                    <span className="stat downloaded">Downloaded: {progress.downloaded}</span>
                    <span className="stat skipped">Skipped: {progress.skipped}</span>
                    <span className="stat failed">Failed: {progress.failed}</span>
                  </div>
                </div>
              )}
              <button
                className="secondary-button"
                onClick={isStreaming ? cancelFetching : handleFetchPhotos}
              >
                <span className={`material-symbols-outlined${isStreaming ? ' spinning' : ''}`}>
                  {isStreaming ? 'sync' : 'cloud_download'}
                </span>
                {isStreaming ? 'Cancel' : 'Fetch Contact Photos'}
              </button>
            </div>
          )}
        </section>

        {/* Import LinkedIn Contacts Section */}
        <section className={`settings-section collapsible-card${linkedInExpanded ? ' expanded' : ''}`}>
          <button
            className="collapsible-header"
            onClick={() => setLinkedInExpanded(!linkedInExpanded)}
          >
            <div className="settings-section-header">
              <span className="material-symbols-outlined">upload</span>
              <h2>Import LinkedIn Contacts</h2>
            </div>
            <span className={`material-symbols-outlined expand-icon${linkedInExpanded ? ' rotated' : ''}`}>
              expand_more
            </span>
          </button>

          {linkedInExpanded && (
            <div className="collapsible-content">
              <p className="settings-description">
                Import your LinkedIn connections from a CSV export.
                To export: LinkedIn → Settings → Data Privacy → Get a copy of your data → Connections
              </p>

              <div className="linkedin-import-controls">
                <div className="file-input-row">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleLinkedInFileChange}
                    id="linkedin-csv-input"
                    className="file-input"
                  />
                  <label htmlFor="linkedin-csv-input" className="file-input-label">
                    <span className="material-symbols-outlined">description</span>
                    {linkedInFile ? linkedInFile.name : 'Choose CSV file'}
                  </label>
                </div>

                <button
                  className="secondary-button"
                  onClick={isImportingLinkedIn ? cancelLinkedInImport : handleLinkedInImport}
                  disabled={!linkedInFile && !isImportingLinkedIn}
                >
                  <span className={`material-symbols-outlined${isImportingLinkedIn ? ' spinning' : ''}`}>
                    {isImportingLinkedIn ? 'sync' : 'upload'}
                  </span>
                  {isImportingLinkedIn ? 'Cancel' : 'Import Contacts'}
                </button>
              </div>

              {/* Progress/Status Display */}
              {(isImportingLinkedIn || linkedInResult || linkedInError) && (
                <div className="linkedin-import-status">
                  {isImportingLinkedIn && linkedInProgress && (
                    <>
                      <div className="progress-bar-container">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${(linkedInProgress.current / linkedInProgress.total) * 100}%` }}
                        />
                      </div>
                      <div className="progress-text">
                        Processing {linkedInProgress.current} of {linkedInProgress.total} contacts...
                      </div>
                    </>
                  )}

                  {linkedInResult && (
                    <div className="import-complete">
                      <div className="import-complete-header">
                        <span className="material-symbols-outlined success-icon">check_circle</span>
                        <span>Import complete</span>
                      </div>
                    </div>
                  )}

                  {linkedInError && (
                    <div className="import-error">
                      <span className="material-symbols-outlined">error</span>
                      <span>{linkedInError}</span>
                    </div>
                  )}

                  {/* Stats - show during import and after completion */}
                  {(linkedInProgress || linkedInResult) && (
                    <div className="import-stats">
                      <div className="stat created">
                        <span className="stat-value">
                          {linkedInResult?.created ?? linkedInProgress?.created ?? 0}
                        </span>
                        <span className="stat-label">Created</span>
                      </div>
                      <div className="stat updated">
                        <span className="stat-value">
                          {linkedInResult?.updated ?? linkedInProgress?.updated ?? 0}
                        </span>
                        <span className="stat-label">Updated</span>
                      </div>
                      <div className="stat skipped">
                        <span className="stat-value">
                          {linkedInResult?.skipped ?? linkedInProgress?.skipped ?? 0}
                        </span>
                        <span className="stat-label">Skipped</span>
                      </div>
                      {linkedInResult?.failed !== undefined && linkedInResult.failed > 0 && (
                        <div className="stat failed">
                          <span className="stat-value">{linkedInResult.failed}</span>
                          <span className="stat-label">Failed</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
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
              <span className="material-symbols-outlined">warning</span>
              <h2>Danger Zone</h2>
            </div>
            <span className={`material-symbols-outlined expand-icon${dangerExpanded ? ' rotated' : ''}`}>
              expand_more
            </span>
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
          <span className="material-symbols-outlined">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
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

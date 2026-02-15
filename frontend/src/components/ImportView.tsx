import { useState, useCallback, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useImportLinkedInStream, parseLinkedInCsv } from '../api/settingsHooks';
import type { OutletContext } from './Layout';
import { Icon } from './Icon';

interface ToastState {
  message: string;
  type: 'success' | 'error';
  timeout: ReturnType<typeof setTimeout>;
}

export function ImportView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [linkedInFile, setLinkedInFile] = useState<File | null>(null);

  const {
    isImporting: isImportingLinkedIn,
    progress: linkedInProgress,
    importResult: linkedInResult,
    error: linkedInError,
    startImport: startLinkedInImport,
    cancel: cancelLinkedInImport,
    reset: resetLinkedInImport
  } = useImportLinkedInStream();

  useEffect(() => {
    setHeaderConfig({ title: 'Import' });
  }, [setHeaderConfig]);

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

  const handleLinkedInFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setLinkedInFile(file);
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

  return (
    <div className="settings-view">
      <div className="settings-content">
        {/* Import LinkedIn Connections */}
        <section className="settings-section collapsible-card expanded">
          <div className="collapsible-header" style={{ cursor: 'default' }}>
            <div className="settings-section-header">
              <Icon name="download" />
              <h2>Import LinkedIn Connections</h2>
            </div>
          </div>
          <div className="collapsible-content">
            <p className="settings-description">
              Import your LinkedIn connections from a CSV export.
              To export: LinkedIn &rarr; Settings &rarr; Data Privacy &rarr; Get a copy of your data &rarr; Connections
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
                  <Icon name="file-lines" />
                  {linkedInFile ? linkedInFile.name : 'Choose CSV file'}
                </label>
              </div>

              <button
                className="secondary-button"
                onClick={isImportingLinkedIn ? cancelLinkedInImport : handleLinkedInImport}
                disabled={!linkedInFile && !isImportingLinkedIn}
              >
                <Icon name={isImportingLinkedIn ? 'arrows-rotate' : 'upload'} className={isImportingLinkedIn ? 'spinning' : ''} />
                {isImportingLinkedIn ? 'Cancel' : 'Import Contacts'}
              </button>
            </div>

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
                      <Icon name="circle-check" className="success-icon" />
                      <span>Import complete</span>
                    </div>
                  </div>
                )}

                {linkedInError && (
                  <div className="import-error">
                    <Icon name="circle-exclamation" />
                    <span>{linkedInError}</span>
                  </div>
                )}

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
    </div>
  );
}

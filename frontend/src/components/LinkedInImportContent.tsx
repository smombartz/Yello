import { useState, useCallback } from 'react';
import { useImportLinkedInStream, parseLinkedInCsv } from '../api/settingsHooks';
import { Icon } from './Icon';
import { useToast } from './ui/Toast';
import { FilePicker } from './ui/FilePicker';

export function LinkedInImportContent() {
  const { showToast } = useToast();
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

  const handleLinkedInFileChange = useCallback((file: File | null) => {
    setLinkedInFile(file);
    resetLinkedInImport();
  }, [resetLinkedInImport]);

  const handleLinkedInImport = useCallback(async () => {
    if (!linkedInFile) return;
    try {
      const content = await linkedInFile.text();
      const contacts = parseLinkedInCsv(content);
      if (contacts.length === 0) {
        showToast('No valid contacts found in CSV file', { type: 'error' });
        return;
      }
      startLinkedInImport(contacts);
    } catch {
      showToast('Failed to read CSV file', { type: 'error' });
    }
  }, [linkedInFile, startLinkedInImport, showToast]);

  return (
    <>
      <p className="settings-description">
        Import your LinkedIn connections from a CSV export.
        To export: LinkedIn &rarr; Settings &rarr; Data Privacy &rarr; Get a copy of your data &rarr; Connections
      </p>

      <div className="import-controls">
        <FilePicker
          id="linkedin-csv-input"
          accept=".csv"
          file={linkedInFile}
          onChange={handleLinkedInFileChange}
          prompt="Choose CSV file"
          disabled={isImportingLinkedIn}
        />

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
    </>
  );
}

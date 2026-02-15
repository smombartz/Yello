import { useState, useCallback, useEffect } from 'react';
import { useOutletContext, Link, useNavigate } from 'react-router-dom';
import { useLinkedInEnrichmentSummary, useLinkedInEnrichment, useLinkedInRecovery, useEnrichmentCategoryContacts } from '../api/enrichHooks';
import { useFetchContactPhotosStream } from '../api/settingsHooks';
import type { OutletContext } from './Layout';
import { LoadingSpinner } from './LoadingSpinner';
import { Icon } from './Icon';

interface ToastState {
  message: string;
  type: 'success' | 'error';
  timeout: ReturnType<typeof setTimeout>;
}

export function EnrichView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const [includeAlreadyEnriched, setIncludeAlreadyEnriched] = useState(false);
  const [limit, setLimit] = useState<number | undefined>(undefined);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [enrichExpanded, setEnrichExpanded] = useState(false);
  const [photosExpanded, setPhotosExpanded] = useState(false);

  const { data: summary, isLoading: isSummaryLoading, refetch: refetchSummary } = useLinkedInEnrichmentSummary(includeAlreadyEnriched);
  const { data: categoryContacts, isLoading: categoryLoading } = useEnrichmentCategoryContacts(expandedCategory);

  const {
    isEnriching,
    progress,
    result,
    error,
    startEnrichment,
    cancel,
    reset,
  } = useLinkedInEnrichment();

  const {
    isRecovering,
    progress: recoveryProgress,
    result: recoveryResult,
    error: recoveryError,
    startRecovery,
    reset: resetRecovery,
  } = useLinkedInRecovery();

  const { isStreaming, progress: photosProgress, startFetching, cancel: cancelFetching } = useFetchContactPhotosStream();

  const [datasetId, setDatasetId] = useState('');

  useEffect(() => {
    setHeaderConfig({ title: 'Enrich' });
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

  const handleStartEnrichment = useCallback(() => {
    reset();
    startEnrichment(
      includeAlreadyEnriched,
      (enrichResult) => {
        if (enrichResult.succeeded > 0) {
          showToast(`Enriched ${enrichResult.succeeded} contact${enrichResult.succeeded !== 1 ? 's' : ''} with LinkedIn data`, 'success');
        } else if (enrichResult.failed > 0) {
          showToast('All enrichment attempts failed. Check error details below.', 'error');
        } else {
          showToast('No contacts to enrich', 'success');
        }
        refetchSummary();
      },
      (errorMsg) => {
        showToast(errorMsg, 'error');
      },
      limit
    );
  }, [includeAlreadyEnriched, startEnrichment, reset, showToast, refetchSummary, limit]);

  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setIncludeAlreadyEnriched(e.target.checked);
    reset();
  }, [reset]);

  const handleLimitChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') {
      setLimit(undefined);
    } else {
      const num = parseInt(value, 10);
      if (!isNaN(num) && num > 0) {
        setLimit(num);
      }
    }
  }, []);

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

  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="enrich-view">
      <div className="enrich-content">
        {/* LinkedIn Profile Data Enrichment */}
        <section className={`settings-section collapsible-card${enrichExpanded ? ' expanded' : ''}`}>
          <button
            className="collapsible-header"
            onClick={() => setEnrichExpanded(!enrichExpanded)}
          >
            <div className="settings-section-header">
              <Icon name="briefcase" />
              <h2>LinkedIn Profile Data</h2>
            </div>
            <Icon name="chevron-down" className={`expand-icon${enrichExpanded ? ' rotated' : ''}`} />
          </button>
          {enrichExpanded && (
            <div className="collapsible-content">
              <p className="settings-description">
                Fetch professional information from LinkedIn for contacts that have LinkedIn URLs.
                Data is stored separately and never overwrites existing contact information.
              </p>

              {!summary?.configured && (
                <div className="config-warning">
                  <Icon name="triangle-exclamation" />
                  <div>
                    <strong>API Not Configured</strong>
                    <p>Set the <code>APIFY_API_TOKEN</code> environment variable to enable LinkedIn enrichment.</p>
                  </div>
                </div>
              )}

              {isSummaryLoading ? (
                <LoadingSpinner size={32} message="Loading summary..." />
              ) : summary?.configured && (
                <>
                  {/* Summary Stats */}
                  <div className="enrich-stats-row">
                    <button
                      className={`enrich-stat-card enrich-stat-enriched ${expandedCategory === 'enriched' ? 'expanded' : ''}`}
                      onClick={() => setExpandedCategory(prev => prev === 'enriched' ? null : 'enriched')}
                    >
                      <div className="enrich-stat-count">{summary.enriched}</div>
                      <div className="enrich-stat-label">Enriched</div>
                    </button>
                    <button
                      className={`enrich-stat-card enrich-stat-ready ${expandedCategory === 'ready' ? 'expanded' : ''}`}
                      onClick={() => setExpandedCategory(prev => prev === 'ready' ? null : 'ready')}
                    >
                      <div className="enrich-stat-count">{summary.readyToEnrich}</div>
                      <div className="enrich-stat-label">Ready to Enrich</div>
                    </button>
                    <button
                      className={`enrich-stat-card enrich-stat-failed ${expandedCategory === 'failed' ? 'expanded' : ''}`}
                      onClick={() => setExpandedCategory(prev => prev === 'failed' ? null : 'failed')}
                    >
                      <div className="enrich-stat-count">{summary.failed}</div>
                      <div className="enrich-stat-label">Failed</div>
                    </button>
                    <button
                      className={`enrich-stat-card enrich-stat-no-linkedin ${expandedCategory === 'no-linkedin' ? 'expanded' : ''}`}
                      onClick={() => setExpandedCategory(prev => prev === 'no-linkedin' ? null : 'no-linkedin')}
                    >
                      <div className="enrich-stat-count">{summary.noLinkedIn}</div>
                      <div className="enrich-stat-label">No LinkedIn</div>
                    </button>
                  </div>

                  {/* Category Drilldown Panel */}
                  {expandedCategory && (
                    <div className="enrich-category-panel">
                      <div className="enrich-category-header">
                        <h4>
                          {expandedCategory === 'enriched' && 'Enriched Contacts'}
                          {expandedCategory === 'ready' && 'Ready to Enrich'}
                          {expandedCategory === 'failed' && 'Failed Enrichment'}
                          {expandedCategory === 'no-linkedin' && 'No LinkedIn URL'}
                          {categoryContacts && ` (${categoryContacts.total})`}
                        </h4>
                        <button onClick={() => setExpandedCategory(null)} className="enrich-category-close">
                          <Icon name="xmark" />
                        </button>
                      </div>
                      {categoryLoading ? (
                        <div className="enrich-category-loading"><LoadingSpinner size={24} message="Loading..." /></div>
                      ) : (
                        <div className="enrich-category-list">
                          {categoryContacts?.contacts.map(contact => (
                            <button
                              key={contact.id}
                              className="enrich-category-contact"
                              onClick={() => navigate(`/contacts/${contact.id}`)}
                            >
                              <span className="enrich-category-contact-name">{contact.displayName}</span>
                              {contact.company && <span className="enrich-category-contact-company">{contact.company}</span>}
                              {contact.errorReason && <span className="enrich-category-contact-error">{contact.errorReason}</span>}
                              {contact.enrichedAt && expandedCategory === 'enriched' && (
                                <span className="enrich-category-contact-date">{new Date(contact.enrichedAt + 'Z').toLocaleDateString()}</span>
                              )}
                              <Icon name="chevron-right" className="enrich-category-contact-arrow" />
                            </button>
                          ))}
                          {categoryContacts?.contacts.length === 0 && (
                            <div className="enrich-category-empty">No contacts in this category</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Options */}
                  <div className="enrichment-options">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={includeAlreadyEnriched}
                        onChange={handleCheckboxChange}
                        disabled={isEnriching}
                      />
                      <span>Include previously enriched contacts (re-fetch data)</span>
                    </label>

                    <div className="limit-input-group">
                      <label htmlFor="enrichment-limit">Enrich up to:</label>
                      <input
                        id="enrichment-limit"
                        type="number"
                        min="1"
                        placeholder="all"
                        value={limit ?? ''}
                        onChange={handleLimitChange}
                        disabled={isEnriching}
                        className="limit-input"
                      />
                      <span className="limit-hint">contacts (leave empty for all)</span>
                    </div>
                  </div>

                  {/* Progress Display */}
                  {isEnriching && progress && (
                    <div className="enrichment-progress">
                      <div className="progress-header">
                        <span className="progress-status">
                          <Icon name="arrows-rotate" className="spinning" />
                          Enriching contacts...
                        </span>
                        <span className="progress-count">
                          {progress.current} of {progress.total}
                        </span>
                      </div>

                      <div className="progress-bar-container">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>

                      {progress.currentContact && (
                        <div className="progress-current">
                          Processing: {progress.currentContact}
                        </div>
                      )}

                      <div className="progress-stats">
                        <span className="stat success">
                          <Icon name="circle-check" />
                          {progress.succeeded} succeeded
                        </span>
                        <span className="stat error">
                          <Icon name="circle-exclamation" />
                          {progress.failed} failed
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Results Display */}
                  {result && (
                    <div className="enrichment-result">
                      <div className="result-header">
                        <Icon name="circle-check" className="success-icon" />
                        <span>Enrichment Complete</span>
                      </div>

                      <div className="result-stats">
                        <div className="stat-item success">
                          <span className="stat-value">{result.succeeded}</span>
                          <span className="stat-label">Succeeded</span>
                        </div>
                        <div className="stat-item error">
                          <span className="stat-value">{result.failed}</span>
                          <span className="stat-label">Failed</span>
                        </div>
                      </div>

                      {result.errors.length > 0 && (
                        <div className="result-errors">
                          <h4>Errors:</h4>
                          <ul>
                            {result.errors.slice(0, 10).map((err, idx) => (
                              <li key={idx}>
                                <strong>{err.contactName}:</strong> {err.reason}
                              </li>
                            ))}
                            {result.errors.length > 10 && (
                              <li className="more-errors">
                                ...and {result.errors.length - 10} more errors
                              </li>
                            )}
                          </ul>
                        </div>
                      )}

                      {result.enrichedContacts.length > 0 && (
                        <div className="enriched-contacts-section">
                          <h4>Enriched Contacts:</h4>
                          <div className="enriched-contacts-list">
                            {result.enrichedContacts.map((contact) => (
                              <div key={contact.contactId} className="enriched-contact-card">
                                <Link to={`/contacts/${contact.contactId}`} className="contact-name">
                                  {contact.contactName}
                                </Link>
                                <div className="contact-details">
                                  {contact.jobTitle && contact.companyName && (
                                    <span>{contact.jobTitle} at {contact.companyName}</span>
                                  )}
                                  {contact.jobTitle && !contact.companyName && (
                                    <span>{contact.jobTitle}</span>
                                  )}
                                  {!contact.jobTitle && contact.companyName && (
                                    <span>{contact.companyName}</span>
                                  )}
                                  {!contact.jobTitle && !contact.companyName && contact.headline && (
                                    <span>{contact.headline}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error Display */}
                  {error && (
                    <div className="enrichment-error">
                      <Icon name="circle-exclamation" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Action Button */}
                  <div className="enrichment-actions">
                    {isEnriching ? (
                      <button className="secondary-button" onClick={cancel}>
                        <Icon name="xmark" />
                        Cancel
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        onClick={handleStartEnrichment}
                        disabled={summary.pendingEnrichment === 0}
                      >
                        <Icon name="rocket" />
                        Start Enrichment
                        {summary.pendingEnrichment > 0 && (
                          <span className="button-badge">{summary.pendingEnrichment}</span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Dataset Recovery Section */}
                  <div className="recovery-section">
                    <h3 className="recovery-heading">Recover from Apify Dataset</h3>
                    <p className="recovery-description">
                      If an enrichment run failed midway, paste the Apify dataset ID to recover results.
                      Find it in your <a href="https://console.apify.com/actors/runs" target="_blank" rel="noopener noreferrer">Apify Console</a>.
                    </p>
                    <div className="recovery-input-row">
                      <input
                        type="text"
                        value={datasetId}
                        onChange={(e) => setDatasetId(e.target.value)}
                        placeholder="Dataset ID (e.g. abc123def456)"
                        className="limit-input recovery-input"
                        disabled={isRecovering || isEnriching}
                      />
                      <button
                        className="secondary-button"
                        onClick={() => {
                          resetRecovery();
                          startRecovery(
                            datasetId.trim(),
                            (r) => {
                              showToast(`Recovered ${r.succeeded} contact${r.succeeded !== 1 ? 's' : ''}`, 'success');
                              refetchSummary();
                            },
                            (err) => showToast(err, 'error')
                          );
                        }}
                        disabled={!datasetId.trim() || isRecovering || isEnriching}
                      >
                        <Icon name={isRecovering ? 'arrows-rotate' : 'download'} className={isRecovering ? 'spinning' : ''} />
                        {isRecovering ? 'Recovering...' : 'Recover'}
                      </button>
                    </div>

                    {isRecovering && recoveryProgress && (
                      <div className="enrichment-progress" style={{ marginTop: 12 }}>
                        <div className="progress-header">
                          <span className="progress-status">
                            <Icon name="arrows-rotate" className="spinning" />
                            Recovering...
                          </span>
                          <span className="progress-count">
                            {recoveryProgress.succeeded + recoveryProgress.failed} processed
                          </span>
                        </div>
                        <div className="progress-stats">
                          <span className="stat success">
                            <Icon name="circle-check" />
                            {recoveryProgress.succeeded} succeeded
                          </span>
                          <span className="stat error">
                            <Icon name="circle-exclamation" />
                            {recoveryProgress.failed} failed
                          </span>
                        </div>
                      </div>
                    )}

                    {recoveryResult && (
                      <div className="enrichment-result" style={{ marginTop: 12 }}>
                        <div className="result-header">
                          <Icon name="circle-check" className="success-icon" />
                          <span>Recovery Complete</span>
                        </div>
                        <div className="result-stats">
                          <div className="stat-item success">
                            <span className="stat-value">{recoveryResult.succeeded}</span>
                            <span className="stat-label">Succeeded</span>
                          </div>
                          <div className="stat-item error">
                            <span className="stat-value">{recoveryResult.failed}</span>
                            <span className="stat-label">Failed</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {recoveryError && (
                      <div className="enrichment-error" style={{ marginTop: 12 }}>
                        <Icon name="circle-exclamation" />
                        <span>{recoveryError}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* Fetch Contact Photos */}
        <section className={`settings-section collapsible-card${photosExpanded ? ' expanded' : ''}`}>
          <button
            className="collapsible-header"
            onClick={() => setPhotosExpanded(!photosExpanded)}
          >
            <div className="settings-section-header">
              <Icon name="images" />
              <h2>Fetch Contact Photos</h2>
            </div>
            <Icon name="chevron-down" className={`expand-icon${photosExpanded ? ' rotated' : ''}`} />
          </button>
          {photosExpanded && (
            <div className="collapsible-content">
              <p className="settings-description">
                Download profile photos for your contacts from Google Contacts and Gravatar.
                Only contacts with email addresses and no existing photo will be updated.
              </p>
              {isStreaming && photosProgress && (
                <div className="photo-fetch-progress">
                  <div className="progress-bar-container">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${(photosProgress.current / photosProgress.total) * 100}%` }}
                    />
                  </div>
                  <div className="progress-text">
                    Processing {photosProgress.current} of {photosProgress.total} contacts...
                  </div>
                  <div className="progress-stats">
                    <span className="stat downloaded">Downloaded: {photosProgress.downloaded}</span>
                    <span className="stat skipped">Skipped: {photosProgress.skipped}</span>
                    <span className="stat failed">Failed: {photosProgress.failed}</span>
                  </div>
                </div>
              )}
              <button
                className="secondary-button"
                onClick={isStreaming ? cancelFetching : handleFetchPhotos}
              >
                <Icon name={isStreaming ? 'arrows-rotate' : 'cloud-arrow-down'} className={isStreaming ? 'spinning' : ''} />
                {isStreaming ? 'Cancel' : 'Fetch Contact Photos'}
              </button>
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

      <style>{`
        .enrich-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        .enrich-header {
          padding: 24px 32px;
          border-bottom: 1px solid var(--ds-border-color);
          background: var(--ds-bg-primary);
        }

        .enrich-header h1 {
          margin: 0 0 4px 0;
          font-size: 24px;
          font-weight: 600;
          color: var(--ds-text-primary);
        }

        .enrich-subtitle {
          margin: 0;
          font-size: 14px;
          color: var(--ds-text-secondary);
        }

        .enrich-content {
          flex: 1;
          overflow-y: auto;
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }


        .config-warning {
          display: flex;
          gap: 12px;
          padding: 16px;
          background: rgba(251, 191, 36, 0.1);
          border: 1px solid rgba(251, 191, 36, 0.3);
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .config-warning i {
          color: #f59e0b;
          font-size: 24px;
        }

        .config-warning strong {
          display: block;
          color: var(--ds-text-primary);
          margin-bottom: 4px;
        }

        .config-warning p {
          margin: 0;
          font-size: 13px;
          color: var(--ds-text-secondary);
        }

        .config-warning code {
          background: rgba(0, 0, 0, 0.1);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12px;
        }

        .enrich-stats-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }

        .enrich-stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid var(--ds-border-color);
          background: var(--ds-bg-primary);
          cursor: pointer;
          transition: all 0.15s;
        }

        .enrich-stat-card:hover {
          border-color: var(--ds-text-secondary);
          background: var(--ds-bg-secondary);
        }

        .enrich-stat-card.expanded {
          border-color: var(--ds-color-primary);
          box-shadow: 0 0 0 1px var(--ds-color-primary);
        }

        .enrich-stat-count {
          font-size: 24px;
          font-weight: 700;
          line-height: 1;
        }

        .enrich-stat-label {
          font-size: 11px;
          color: var(--ds-text-secondary);
        }

        .enrich-stat-enriched .enrich-stat-count { color: var(--ds-color-success); }
        .enrich-stat-ready .enrich-stat-count { color: var(--ds-color-primary); }
        .enrich-stat-failed .enrich-stat-count { color: var(--ds-color-error); }
        .enrich-stat-no-linkedin .enrich-stat-count { color: var(--ds-text-tertiary); }

        .enrich-category-panel {
          border: 1px solid var(--ds-border-color);
          border-radius: 8px;
          margin-bottom: 20px;
          overflow: hidden;
        }

        .enrich-category-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--ds-bg-secondary);
          border-bottom: 1px solid var(--ds-border-color);
        }

        .enrich-category-header h4 {
          margin: 0;
          font-size: 14px;
        }

        .enrich-category-close {
          background: none;
          border: none;
          color: var(--ds-text-tertiary);
          cursor: pointer;
          padding: 4px;
        }

        .enrich-category-close:hover {
          color: var(--ds-text-primary);
        }

        .enrich-category-loading {
          padding: 24px;
          display: flex;
          justify-content: center;
        }

        .enrich-category-list {
          max-height: 400px;
          overflow-y: auto;
        }

        .enrich-category-contact {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 10px 16px;
          border: none;
          border-bottom: 1px solid var(--ds-border-color);
          background: none;
          text-align: left;
          cursor: pointer;
          transition: background 0.1s;
          font-size: 13px;
          color: var(--ds-text-primary);
        }

        .enrich-category-contact:last-child {
          border-bottom: none;
        }

        .enrich-category-contact:hover {
          background: var(--ds-bg-secondary);
        }

        .enrich-category-contact-name {
          font-weight: 500;
        }

        .enrich-category-contact-company {
          color: var(--ds-text-secondary);
        }

        .enrich-category-contact-error {
          color: var(--ds-color-error);
          font-size: 12px;
          margin-left: auto;
        }

        .enrich-category-contact-date {
          color: var(--ds-text-tertiary);
          font-size: 12px;
          margin-left: auto;
        }

        .enrich-category-contact-arrow {
          color: var(--ds-text-tertiary);
          font-size: 12px;
          flex-shrink: 0;
        }

        .enrich-category-empty {
          padding: 32px;
          text-align: center;
          color: var(--ds-text-tertiary);
          font-size: 14px;
        }

        .enrichment-options {
          margin-bottom: 20px;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          font-size: 14px;
          color: var(--ds-text-primary);
        }

        .checkbox-label input {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .limit-input-group {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          font-size: 14px;
          color: var(--ds-text-primary);
        }

        .limit-input {
          width: 80px;
          padding: 6px 10px;
          border: 1px solid var(--ds-border-color);
          border-radius: 6px;
          font-size: 14px;
          background: var(--ds-bg-primary);
          color: var(--ds-text-primary);
        }

        .limit-input:focus {
          outline: none;
          border-color: var(--ds-color-primary);
          box-shadow: 0 0 0 2px rgba(95, 39, 227, 0.1);
        }

        .limit-input::placeholder {
          color: var(--ds-text-tertiary);
        }

        .limit-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .limit-hint {
          color: var(--ds-text-secondary);
          font-size: 13px;
        }

        .enrichment-progress {
          background: var(--ds-bg-secondary);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .progress-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 500;
          color: var(--ds-text-primary);
        }

        .progress-count {
          font-size: 14px;
          color: var(--ds-text-secondary);
        }

        .progress-bar-container {
          height: 8px;
          background: var(--ds-border-color);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 12px;
        }

        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea, #764ba2);
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .progress-current {
          font-size: 13px;
          color: var(--ds-text-secondary);
          margin-bottom: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .progress-stats {
          display: flex;
          gap: 16px;
        }

        .progress-stats .stat {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 13px;
        }

        .progress-stats .stat i {
          font-size: 16px;
        }

        .progress-stats .stat.success {
          color: var(--ds-color-success);
        }

        .progress-stats .stat.error {
          color: var(--ds-color-error);
        }

        .enrichment-result {
          background: rgba(22, 163, 74, 0.1);
          border: 1px solid rgba(22, 163, 74, 0.2);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .result-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 600;
          color: var(--ds-color-success);
          margin-bottom: 16px;
        }

        .result-header .success-icon {
          font-size: 24px;
        }

        .result-stats {
          display: flex;
          gap: 24px;
          margin-bottom: 16px;
        }

        .result-stats .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .result-stats .stat-item .stat-value {
          font-size: 24px;
          font-weight: 700;
        }

        .result-stats .stat-item.success .stat-value {
          color: var(--ds-color-success);
        }

        .result-stats .stat-item.error .stat-value {
          color: var(--ds-color-error);
        }

        .result-stats .stat-item .stat-label {
          font-size: 12px;
          color: var(--ds-text-secondary);
        }

        .result-errors {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid rgba(22, 163, 74, 0.2);
        }

        .result-errors h4 {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: var(--ds-text-primary);
        }

        .result-errors ul {
          margin: 0;
          padding: 0 0 0 20px;
          font-size: 13px;
          color: var(--ds-text-secondary);
        }

        .result-errors li {
          margin-bottom: 4px;
        }

        .result-errors .more-errors {
          font-style: italic;
          color: var(--ds-text-tertiary);
        }

        .enriched-contacts-section {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid rgba(22, 163, 74, 0.2);
        }

        .enriched-contacts-section h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: var(--ds-text-primary);
        }

        .enriched-contacts-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .enriched-contact-card {
          padding: 12px 16px;
          background: var(--ds-bg-primary);
          border: 1px solid var(--ds-border-color);
          border-radius: 8px;
        }

        .enriched-contact-card .contact-name {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: var(--ds-color-primary);
          text-decoration: none;
          margin-bottom: 4px;
        }

        .enriched-contact-card .contact-name:hover {
          text-decoration: underline;
        }

        .enriched-contact-card .contact-details {
          font-size: 13px;
          color: var(--ds-text-secondary);
        }

        .enrichment-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: rgba(220, 38, 38, 0.1);
          border: 1px solid rgba(220, 38, 38, 0.2);
          border-radius: 8px;
          margin-bottom: 20px;
          color: var(--ds-color-error);
          font-size: 14px;
        }

        .enrichment-actions {
          display: flex;
          gap: 12px;
        }

        .primary-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.2s;
        }

        .primary-button:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .primary-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .primary-button .button-badge {
          background: rgba(255, 255, 255, 0.3);
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
        }

        .secondary-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: var(--ds-bg-secondary);
          color: var(--ds-text-primary);
          border: 1px solid var(--ds-border-color);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .secondary-button:hover {
          background: var(--ds-bg-tertiary);
        }

        .recovery-section {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid var(--ds-border-color);
        }

        .recovery-heading {
          margin: 0 0 8px 0;
          font-size: 15px;
          font-weight: 600;
          color: var(--ds-text-primary);
        }

        .recovery-description {
          margin: 0 0 12px 0;
          font-size: 13px;
          color: var(--ds-text-secondary);
          line-height: 1.4;
        }

        .recovery-description a {
          color: var(--ds-color-primary);
        }

        .recovery-input-row {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .recovery-input {
          flex: 1;
          width: auto;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .enrich-header {
            padding: 16px 20px;
          }

          .enrich-content {
            padding: 16px 20px;
          }

          .enrich-stats-row {
            grid-template-columns: repeat(2, 1fr);
          }

          .enrichment-actions {
            flex-direction: column;
          }

          .primary-button,
          .secondary-button {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

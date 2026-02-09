import { useState, useCallback, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useLinkedInEnrichmentSummary, useLinkedInEnrichment } from '../api/enrichHooks';
import { MobileHeader } from './MobileHeader';
import { LoadingSpinner } from './LoadingSpinner';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

interface ToastState {
  message: string;
  type: 'success' | 'error';
  timeout: ReturnType<typeof setTimeout>;
}

export function EnrichView() {
  const { isMobile } = useOutletContext<OutletContext>();
  const [includeAlreadyEnriched, setIncludeAlreadyEnriched] = useState(false);
  const [limit, setLimit] = useState<number | undefined>(undefined);
  const [toast, setToast] = useState<ToastState | null>(null);

  const { data: summary, isLoading: isSummaryLoading, refetch: refetchSummary } = useLinkedInEnrichmentSummary(includeAlreadyEnriched);

  const {
    isEnriching,
    progress,
    result,
    error,
    startEnrichment,
    cancel,
    reset,
  } = useLinkedInEnrichment();

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

  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="enrich-view">
      {isMobile ? (
        <MobileHeader title="Enrich Contacts" />
      ) : (
        <div className="enrich-header">
          <h1>Enrich Contacts</h1>
          <p className="enrich-subtitle">
            Enhance your contacts with LinkedIn profile data
          </p>
        </div>
      )}

      <div className="enrich-content">
        {/* LinkedIn Enrichment Section */}
        <section className="enrich-section">
          <div className="section-header">
            <span className="material-symbols-outlined section-icon">work</span>
            <h2>LinkedIn Profile Data</h2>
          </div>

          <p className="section-description">
            Fetch professional information from LinkedIn for contacts that have LinkedIn URLs.
            Data is stored separately and never overwrites existing contact information.
          </p>

          {!summary?.configured && (
            <div className="config-warning">
              <span className="material-symbols-outlined">warning</span>
              <div>
                <strong>API Not Configured</strong>
                <p>Set the <code>APOLLO_API_KEY</code> environment variable to enable LinkedIn enrichment.</p>
              </div>
            </div>
          )}

          {isSummaryLoading ? (
            <LoadingSpinner size={32} message="Loading summary..." />
          ) : summary?.configured && (
            <>
              {/* Summary Stats */}
              <div className="enrichment-stats">
                <div className="stat-card">
                  <span className="stat-value">{summary.totalWithLinkedIn}</span>
                  <span className="stat-label">Contacts with LinkedIn</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{summary.alreadyEnriched}</span>
                  <span className="stat-label">Already Enriched</span>
                </div>
                <div className="stat-card highlight">
                  <span className="stat-value">{summary.pendingEnrichment}</span>
                  <span className="stat-label">Ready to Enrich</span>
                </div>
              </div>

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
                      <span className="material-symbols-outlined spinning">sync</span>
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
                      <span className="material-symbols-outlined">check_circle</span>
                      {progress.succeeded} succeeded
                    </span>
                    <span className="stat error">
                      <span className="material-symbols-outlined">error</span>
                      {progress.failed} failed
                    </span>
                  </div>
                </div>
              )}

              {/* Results Display */}
              {result && (
                <div className="enrichment-result">
                  <div className="result-header">
                    <span className="material-symbols-outlined success-icon">check_circle</span>
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
                  <span className="material-symbols-outlined">error</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Action Button */}
              <div className="enrichment-actions">
                {isEnriching ? (
                  <button className="secondary-button" onClick={cancel}>
                    <span className="material-symbols-outlined">close</span>
                    Cancel
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    onClick={handleStartEnrichment}
                    disabled={summary.pendingEnrichment === 0}
                  >
                    <span className="material-symbols-outlined">rocket_launch</span>
                    Start Enrichment
                    {summary.pendingEnrichment > 0 && (
                      <span className="button-badge">{summary.pendingEnrichment}</span>
                    )}
                  </button>
                )}
              </div>
            </>
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
        }

        .enrich-section {
          background: var(--ds-bg-primary);
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .section-icon {
          font-size: 24px;
          color: var(--ds-color-primary);
        }

        .section-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: var(--ds-text-primary);
        }

        .section-description {
          margin: 0 0 20px 0;
          font-size: 14px;
          color: var(--ds-text-secondary);
          line-height: 1.5;
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

        .config-warning .material-symbols-outlined {
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

        .enrichment-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px;
          background: var(--ds-bg-secondary);
          border-radius: 8px;
          text-align: center;
        }

        .stat-card.highlight {
          background: rgba(95, 39, 227, 0.1);
          border: 1px solid rgba(95, 39, 227, 0.2);
        }

        .stat-card .stat-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--ds-text-primary);
        }

        .stat-card.highlight .stat-value {
          color: var(--ds-color-primary);
        }

        .stat-card .stat-label {
          font-size: 12px;
          color: var(--ds-text-secondary);
          margin-top: 4px;
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

        .progress-stats .stat .material-symbols-outlined {
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

          .enrich-section {
            padding: 16px;
          }

          .enrichment-stats {
            grid-template-columns: 1fr;
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

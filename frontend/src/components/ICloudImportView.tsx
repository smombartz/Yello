import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import {
  useFetchICloudContacts,
  usePreviewICloudImport,
  useExecuteICloudImport,
  useICloudSettings,
  type ParsedContact,
  type MatchResult,
} from '../api/icloudHooks';
import type { OutletContext } from './Layout';
import { MatchCard, NewContactCard, type MatchDecision } from './ImportMatchCards';

export function ICloudImportView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const icloudSettings = useICloudSettings();
  const fetchContacts = useFetchICloudContacts();
  const previewImport = usePreviewICloudImport();
  const executeImport = useExecuteICloudImport();

  const [fetchedContacts, setFetchedContacts] = useState<ParsedContact[] | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [matchDecisions, setMatchDecisions] = useState<Map<number, MatchDecision>>(new Map());
  const [selectedNewContacts, setSelectedNewContacts] = useState<Set<number>>(new Set());

  useEffect(() => {
    setHeaderConfig({ title: 'Import from iCloud' });
  }, [setHeaderConfig]);

  const handleFetch = useCallback(() => {
    fetchContacts.mutate(undefined, {
      onSuccess: (result) => {
        setFetchedContacts(result.contacts);
        // Auto-preview
        previewImport.mutate({ contacts: result.contacts }, {
          onSuccess: (preview) => {
            setMatchResult(preview);
            // Default: merge all matches, import all new. Archived matches default
            // to skip — the user archived them, so don't quietly bring them back.
            const decisions = new Map<number, MatchDecision>();
            preview.matches.forEach((m, i) => decisions.set(i, m.existingArchived ? 'skip' : 'merge'));
            setMatchDecisions(decisions);
            const selected = new Set<number>();
            preview.newContacts.forEach((_, i) => selected.add(i));
            setSelectedNewContacts(selected);
          },
        });
      },
    });
  }, [fetchContacts, previewImport]);

  const handleDecisionChange = useCallback((index: number, decision: MatchDecision) => {
    setMatchDecisions(prev => {
      const next = new Map(prev);
      next.set(index, decision);
      return next;
    });
  }, []);

  const handleToggleNewContact = useCallback((index: number) => {
    setSelectedNewContacts(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleSelectAllNew = useCallback((selectAll: boolean) => {
    if (!matchResult) return;
    if (selectAll) {
      const all = new Set<number>();
      matchResult.newContacts.forEach((_, i) => all.add(i));
      setSelectedNewContacts(all);
    } else {
      setSelectedNewContacts(new Set());
    }
  }, [matchResult]);

  const handleSetAllMatches = useCallback((decision: MatchDecision) => {
    if (!matchResult) return;
    const decisions = new Map<number, MatchDecision>();
    matchResult.matches.forEach((_, i) => decisions.set(i, decision));
    setMatchDecisions(decisions);
  }, [matchResult]);

  const handleImport = useCallback(() => {
    if (!matchResult) return;

    const newContacts = matchResult.newContacts.filter((_, i) => selectedNewContacts.has(i));
    const merges = matchResult.matches
      .map((match, i) => ({ match, decision: matchDecisions.get(i) || 'skip' }))
      .filter(({ decision }) => decision === 'merge')
      .map(({ match }) => ({
        incomingContact: match.incoming,
        existingContactId: match.existingContactId,
      }));
    const importAsNew = matchResult.matches
      .map((match, i) => ({ match, decision: matchDecisions.get(i) || 'skip' }))
      .filter(({ decision }) => decision === 'new')
      .map(({ match }) => match.incoming);

    const skippedCount = matchResult.matches.filter((_, i) => matchDecisions.get(i) === 'skip').length
      + matchResult.newContacts.filter((_, i) => !selectedNewContacts.has(i)).length;

    executeImport.mutate({
      newContacts: [...newContacts, ...importAsNew],
      merges,
      skipped: skippedCount,
    }, {
      onSuccess: () => {
        navigate('/contacts');
      },
    });
  }, [matchResult, matchDecisions, selectedNewContacts, executeImport, navigate]);

  // Redirect if not connected
  if (icloudSettings.data && !icloudSettings.data.connected) {
    return (
      <div className="icloud-import-view">
        <div className="icloud-empty-state">
          <Icon name="apple" style="brands" />
          <h3>iCloud Not Connected</h3>
          <p>Go to Tools to connect your iCloud account first.</p>
          <button type="button" className="secondary-button" onClick={() => navigate('/tools')}>
            <Icon name="gear" /> Go to Tools
          </button>
        </div>
      </div>
    );
  }

  // --- Idle state ---
  if (!fetchedContacts && !fetchContacts.isPending) {
    return (
      <div className="icloud-import-view">
        <div className="icloud-empty-state">
          <Icon name="cloud-arrow-down" />
          <h3>Import from iCloud</h3>
          <p>Fetch your contacts from iCloud. We'll check for duplicates before importing.</p>
          {fetchContacts.isError && (
            <p style={{ color: 'var(--ds-color-error)', fontSize: '0.875rem' }}>
              {fetchContacts.error?.message || 'Failed to fetch contacts'}
            </p>
          )}
          <button type="button" className="secondary-button" onClick={handleFetch}>
            <Icon name="cloud-arrow-down" /> Fetch from iCloud
          </button>
        </div>
      </div>
    );
  }

  // --- Fetching state ---
  if (fetchContacts.isPending || previewImport.isPending) {
    return (
      <div className="icloud-import-view">
        <div className="icloud-empty-state">
          <div className="icloud-spinner" />
          <h3>{fetchContacts.isPending ? 'Connecting to iCloud...' : 'Analyzing contacts...'}</h3>
          <p>{fetchContacts.isPending
            ? 'Fetching your contacts via CardDAV. This may take a moment for large address books.'
            : 'Checking for duplicates against your existing contacts.'
          }</p>
        </div>
      </div>
    );
  }

  // --- Importing state ---
  if (executeImport.isPending) {
    return (
      <div className="icloud-import-view">
        <div className="icloud-empty-state">
          <div className="icloud-spinner" />
          <h3>Importing contacts...</h3>
          <p>Please wait while your contacts are being imported and merged.</p>
        </div>
      </div>
    );
  }

  // --- Import complete ---
  if (executeImport.isSuccess) {
    const result = executeImport.data;
    return (
      <div className="icloud-import-view">
        <div className="icloud-empty-state">
          <Icon name="circle-check" style="regular" />
          <h3>Import Complete</h3>
          <div className="icloud-import-summary">
            <div className="icloud-summary-stat">
              <span className="icloud-summary-number">{result.imported}</span>
              <span className="icloud-summary-label">Imported</span>
            </div>
            <div className="icloud-summary-stat">
              <span className="icloud-summary-number">{result.merged}</span>
              <span className="icloud-summary-label">Merged</span>
            </div>
            <div className="icloud-summary-stat">
              <span className="icloud-summary-number">{result.skipped}</span>
              <span className="icloud-summary-label">Skipped</span>
            </div>
          </div>
          {result.errors.length > 0 && (
            <details style={{ marginTop: '1rem', textAlign: 'left', width: '100%' }}>
              <summary style={{ color: 'var(--ds-color-error)', cursor: 'pointer' }}>
                {result.errors.length} errors
              </summary>
              <ul style={{ fontSize: '0.875rem', maxHeight: '150px', overflow: 'auto' }}>
                {result.errors.map((err, i) => (
                  <li key={i}>#{err.line}: {err.reason}</li>
                ))}
              </ul>
            </details>
          )}
          <button type="button" className="secondary-button" onClick={() => navigate('/contacts')} style={{ marginTop: '1rem' }}>
            <Icon name="address-book" /> Go to Contacts
          </button>
        </div>
      </div>
    );
  }

  // --- Review state ---
  if (!matchResult) return null;

  const mergeCount = Array.from(matchDecisions.values()).filter(d => d === 'merge').length;
  const importAsNewCount = Array.from(matchDecisions.values()).filter(d => d === 'new').length;
  const skipCount = Array.from(matchDecisions.values()).filter(d => d === 'skip').length;
  const selectedNewCount = selectedNewContacts.size;
  const totalToImport = selectedNewCount + mergeCount + importAsNewCount;

  return (
    <div className="icloud-import-view">
      {/* Summary bar */}
      <div className="icloud-import-summary-bar">
        <div className="icloud-summary-stat">
          <span className="icloud-summary-number">{fetchedContacts?.length || 0}</span>
          <span className="icloud-summary-label">Fetched</span>
        </div>
        <div className="icloud-summary-stat">
          <span className="icloud-summary-number">{matchResult.stats.matched}</span>
          <span className="icloud-summary-label">Matches</span>
        </div>
        <div className="icloud-summary-stat">
          <span className="icloud-summary-number">{matchResult.stats.new}</span>
          <span className="icloud-summary-label">New</span>
        </div>
      </div>

      {/* Import error */}
      {executeImport.isError && (
        <p style={{ color: 'var(--ds-color-error)', margin: '0.5rem 0' }}>
          {executeImport.error?.message || 'Import failed'}
        </p>
      )}

      {/* Matches section */}
      {matchResult.matches.length > 0 && (
        <section className="icloud-section">
          <div className="icloud-section-header">
            <h3>Potential Duplicates ({matchResult.matches.length})</h3>
            <div className="icloud-bulk-actions">
              <button type="button" className="icloud-bulk-btn" onClick={() => handleSetAllMatches('merge')}>
                Merge All
              </button>
              <button type="button" className="icloud-bulk-btn" onClick={() => handleSetAllMatches('skip')}>
                Skip All
              </button>
            </div>
          </div>
          <div className="icloud-match-list">
            {matchResult.matches.map((match, i) => (
              <MatchCard
                key={i}
                match={match}
                index={i}
                decision={matchDecisions.get(i) || 'skip'}
                onDecisionChange={handleDecisionChange}
                sourceLabel="iCloud"
              />
            ))}
          </div>
        </section>
      )}

      {/* New contacts section */}
      {matchResult.newContacts.length > 0 && (
        <section className="icloud-section">
          <div className="icloud-section-header">
            <h3>New Contacts ({matchResult.newContacts.length})</h3>
            <div className="icloud-bulk-actions">
              <button type="button" className="icloud-bulk-btn" onClick={() => handleSelectAllNew(true)}>
                Select All
              </button>
              <button type="button" className="icloud-bulk-btn" onClick={() => handleSelectAllNew(false)}>
                Deselect All
              </button>
            </div>
          </div>
          <div className="icloud-new-contacts-list">
            {matchResult.newContacts.map((contact, i) => (
              <NewContactCard
                key={i}
                contact={contact}
                selected={selectedNewContacts.has(i)}
                onToggle={() => handleToggleNewContact(i)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Import button */}
      <div className="icloud-import-footer">
        <div className="icloud-import-summary-text">
          {totalToImport} to import ({selectedNewCount} new, {mergeCount} merge, {importAsNewCount} as new) &middot; {skipCount + (matchResult.newContacts.length - selectedNewCount)} skipped
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={handleImport}
          disabled={totalToImport === 0}
        >
          <Icon name="file-import" />
          Import {totalToImport} Contacts
        </button>
      </div>
    </div>
  );
}

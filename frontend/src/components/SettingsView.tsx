import { useState, useCallback, useEffect, useRef } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import {
  useDeleteAllContacts,
  exportAllContacts
} from '../api/settingsHooks';
import { uploadFileWithProgress } from '../api/client';
import { useICloudSettings, useSaveICloudSettings, useDeleteICloudSettings } from '../api/icloudHooks';
import type { ImportResult } from '../api/types';
import type { OutletContext } from './Layout';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';

export function SettingsView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const deleteMutation = useDeleteAllContacts();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [importExpanded, setImportExpanded] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [importPhase, setImportPhase] = useState<'uploading' | 'processing' | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [exportExpanded, setExportExpanded] = useState(false);
  const [dangerExpanded, setDangerExpanded] = useState(false);
  const [icloudExpanded, setIcloudExpanded] = useState(false);
  const [googleContactsExpanded, setGoogleContactsExpanded] = useState(false);
  const [icloudEmail, setIcloudEmail] = useState('');
  const [icloudPassword, setIcloudPassword] = useState('');
  const icloudSettings = useICloudSettings();
  const saveICloudSettings = useSaveICloudSettings();
  const deleteICloudSettings = useDeleteICloudSettings();

  useEffect(() => {
    setHeaderConfig({ title: 'Tools' });
  }, [setHeaderConfig]);

  const handleImport = useCallback(async () => {
    if (!importFile) return;
    setImportError(null);
    setImportPhase('uploading');
    setUploadProgress(0);
    try {
      const result = await uploadFileWithProgress('/api/import', importFile, (pct) => {
        setUploadProgress(pct);
        if (pct === 100) setImportPhase('processing');
      }) as ImportResult;
      setImportResult(result);
      setImportFile(null);
      if (importFileRef.current) importFileRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportPhase(null);
      setUploadProgress(null);
    }
  }, [importFile, queryClient]);

  const handleExport = useCallback(() => {
    exportAllContacts();
    showToast('Export started - check your downloads');
  }, [showToast]);

  const handleDeleteAll = useCallback(() => {
    if (deleteConfirmText !== 'DELETE') return;

    deleteMutation.mutate(undefined, {
      onSuccess: (result) => {
        showToast(`Deleted ${result.deletedCount} contacts`);
        setShowDeleteConfirm(false);
        setDeleteConfirmText('');
      },
      onError: () => {
        showToast('Failed to delete contacts', { type: 'error' });
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
              <h2>Import LinkedIn Connections</h2>
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
          {icloudSettings.data?.connected && (
            <Link to="/icloud-import" className="collapsible-card settings-nav-link">
              <div className="settings-section-header">
                <Icon name="apple" style="brands" />
                <h2>Import from iCloud</h2>
              </div>
              <Icon name="chevron-right" className="nav-link-arrow" />
            </Link>
          )}
          <Link to="/google-contacts-import" className="collapsible-card settings-nav-link">
            <div className="settings-section-header">
              <Icon name="google" style="brands" />
              <h2>Import from Google Contacts</h2>
            </div>
            <Icon name="chevron-right" className="nav-link-arrow" />
          </Link>
        </nav>

        {/* Import VCF Section */}
        <section className={`settings-section collapsible-card${importExpanded ? ' expanded' : ''}`}>
          <button
            className="collapsible-header"
            onClick={() => { setImportExpanded(!importExpanded); setImportResult(null); }}
          >
            <div className="settings-section-header">
              <Icon name="file-import" />
              <h2>Import VCF</h2>
            </div>
            <Icon name="chevron-down" className={`expand-icon${importExpanded ? ' rotated' : ''}`} />
          </button>
          {importExpanded && (
            <div className="collapsible-content">
              {!importResult ? (
                <>
                  <p className="settings-description">
                    Import contacts from a VCF file exported from this app or another contacts application.
                  </p>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".vcf,text/vcard"
                    onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportError(null); }}
                    disabled={importPhase !== null}
                  />
                  {importFile && (
                    <p className="settings-description" style={{ marginTop: '0.5rem' }}>
                      {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                  {importError && (
                    <p style={{ color: 'var(--ds-color-error)', marginTop: '0.5rem', fontSize: '0.875rem' }}>
                      {importError}
                    </p>
                  )}
                  {importPhase !== null ? (
                    <div style={{ marginTop: '1rem' }}>
                      {importPhase === 'uploading' ? (
                        <>
                          <p className="settings-description">Uploading… {uploadProgress}%</p>
                          <progress value={uploadProgress ?? 0} max={100} style={{ width: '100%' }} />
                        </>
                      ) : (
                        <p className="settings-description">Processing contacts — this may take a moment for large files…</p>
                      )}
                    </div>
                  ) : (
                    <button
                      className="secondary-button"
                      onClick={handleImport}
                      disabled={!importFile}
                      style={{ marginTop: '1rem' }}
                    >
                      <Icon name="file-import" />
                      Import Contacts
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="settings-description">Import complete.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: 'var(--ds-bg-secondary)', borderRadius: '0.5rem' }}>
                      <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--ds-color-primary)' }}>{importResult.imported}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--ds-text-secondary)' }}>Imported</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: 'var(--ds-bg-secondary)', borderRadius: '0.5rem' }}>
                      <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{importResult.photosProcessed}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--ds-text-secondary)' }}>Photos</div>
                    </div>
                  </div>
                  {importResult.failed > 0 && (
                    <details style={{ marginBottom: '1rem' }}>
                      <summary style={{ color: 'var(--ds-color-error)', cursor: 'pointer' }}>
                        {importResult.failed} failed to import
                      </summary>
                      <ul style={{ fontSize: '0.875rem', maxHeight: '150px', overflow: 'auto' }}>
                        {importResult.errors.map((err, i) => (
                          <li key={i}>Line {err.line}: {err.reason}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <button
                    className="secondary-button"
                    onClick={() => setImportResult(null)}
                  >
                    Import Another File
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        {/* Apple Contacts Section */}
        <section className={`settings-section collapsible-card${icloudExpanded ? ' expanded' : ''}`}>
          <button
            className="collapsible-header"
            onClick={() => setIcloudExpanded(!icloudExpanded)}
          >
            <div className="settings-section-header">
              <Icon name="apple" style="brands" />
              <h2>Apple Contacts</h2>
            </div>
            <Icon name="chevron-down" className={`expand-icon${icloudExpanded ? ' rotated' : ''}`} />
          </button>
          {icloudExpanded && (
            <div className="collapsible-content">
              {icloudSettings.data?.connected ? (
                <>
                  <p className="settings-description">
                    Connected as <strong>{icloudSettings.data.email}</strong>
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <Link to="/icloud-import" className="secondary-button" style={{ textDecoration: 'none' }}>
                      <Icon name="cloud-arrow-down" />
                      Import from iCloud
                    </Link>
                    <button
                      className="secondary-button"
                      onClick={() => deleteICloudSettings.mutate(undefined, {
                        onSuccess: () => showToast('iCloud disconnected'),
                        onError: () => showToast('Failed to disconnect', { type: 'error' }),
                      })}
                      disabled={deleteICloudSettings.isPending}
                    >
                      <Icon name="link-slash" />
                      {deleteICloudSettings.isPending ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="settings-description">
                    Connect your iCloud account to import contacts. You need an app-specific password
                    — generate one at <a href="https://appleid.apple.com" target="_blank" rel="noopener noreferrer">appleid.apple.com</a> &rarr; Sign-In and Security &rarr; App-Specific Passwords.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                    <input
                      type="email"
                      placeholder="Apple ID email"
                      value={icloudEmail}
                      onChange={(e) => setIcloudEmail(e.target.value)}
                      disabled={saveICloudSettings.isPending}
                    />
                    <input
                      type="password"
                      placeholder="App-specific password"
                      value={icloudPassword}
                      onChange={(e) => setIcloudPassword(e.target.value)}
                      disabled={saveICloudSettings.isPending}
                    />
                    {saveICloudSettings.isError && (
                      <p style={{ color: 'var(--ds-color-error)', fontSize: '0.875rem', margin: 0 }}>
                        {saveICloudSettings.error?.message || 'Connection failed'}
                      </p>
                    )}
                    <button
                      className="secondary-button"
                      onClick={() => saveICloudSettings.mutate(
                        { email: icloudEmail, appPassword: icloudPassword },
                        {
                          onSuccess: () => {
                            showToast('iCloud connected successfully');
                            setIcloudEmail('');
                            setIcloudPassword('');
                          },
                        }
                      )}
                      disabled={!icloudEmail || !icloudPassword || saveICloudSettings.isPending}
                    >
                      <Icon name="plug" />
                      {saveICloudSettings.isPending ? 'Connecting...' : 'Connect'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* Google Contacts Section */}
        <section className={`settings-section collapsible-card${googleContactsExpanded ? ' expanded' : ''}`}>
          <button
            className="collapsible-header"
            onClick={() => setGoogleContactsExpanded(!googleContactsExpanded)}
          >
            <div className="settings-section-header">
              <Icon name="google" style="brands" />
              <h2>Google Contacts</h2>
            </div>
            <Icon name="chevron-down" className={`expand-icon${googleContactsExpanded ? ' rotated' : ''}`} />
          </button>
          {googleContactsExpanded && (
            <div className="collapsible-content">
              <p className="settings-description">
                Import contacts from your Google account. Since you're already signed in with Google, you may just need to grant additional permission to access your contacts.
              </p>
              <Link to="/google-contacts-import" className="secondary-button" style={{ textDecoration: 'none', marginTop: '1rem', display: 'inline-flex' }}>
                <Icon name="cloud-arrow-down" />
                Import from Google Contacts
              </Link>
            </div>
          )}
        </section>

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

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete All Contacts?"
          message={
            <>
              This will permanently delete <strong>all contacts</strong> from the database.
              This action cannot be undone.
            </>
          }
          confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete All Contacts'}
          danger
          confirmDisabled={deleteConfirmText !== 'DELETE' || deleteMutation.isPending}
          onConfirm={handleDeleteAll}
          onCancel={() => {
            setShowDeleteConfirm(false);
            setDeleteConfirmText('');
          }}
        >
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
        </ConfirmDialog>
      )}
    </div>
  );
}

import { useRef, useState } from 'react';
import { useImportVcf } from '../api/hooks';
import type { ImportResult } from '../api/types';

interface ImportModalProps {
  onClose: () => void;
}

export function ImportModal({ onClose }: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const importMutation = useImportVcf();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setResult(null);
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    try {
      const importResult = await importMutation.mutateAsync(selectedFile);
      setResult(importResult);
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleClose = () => {
    if (!importMutation.isPending) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="import-modal-header">
          <h3>Import Contacts</h3>
          <button
            className="import-modal-close"
            aria-label="Close"
            onClick={handleClose}
            disabled={importMutation.isPending}
          >
            &times;
          </button>
        </div>

        {!result ? (
          <>
            <p style={{ color: 'var(--ds-text-secondary)', marginBottom: '1rem' }}>
              Select a VCF file to import contacts.
            </p>

            <input
              type="file"
              ref={fileInputRef}
              accept=".vcf,text/vcard"
              onChange={handleFileChange}
              disabled={importMutation.isPending}
            />

            {selectedFile && (
              <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-secondary)', marginTop: '0.5rem' }}>
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            )}

            {importMutation.error && (
              <p style={{ color: 'var(--ds-color-error)', marginTop: '0.5rem' }}>
                Error: {importMutation.error.message}
              </p>
            )}

            <div className="confirm-actions" style={{ marginTop: '1.5rem' }}>
              <button
                className="cancel-button"
                onClick={handleClose}
                disabled={importMutation.isPending}
              >
                Cancel
              </button>
              <button
                className="confirm-button"
                onClick={handleImport}
                disabled={!selectedFile || importMutation.isPending}
              >
                {importMutation.isPending ? 'Importing...' : 'Import'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>
                {result.failed === 0 ? '\u2713' : '\u26A0'}
              </div>
              <h4 style={{ margin: 0 }}>Import Complete</h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: 'var(--ds-bg-secondary)', borderRadius: '0.5rem' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--ds-color-primary)' }}>{result.imported}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--ds-text-secondary)' }}>Imported</div>
              </div>
              <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: 'var(--ds-bg-secondary)', borderRadius: '0.5rem' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{result.photosProcessed}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--ds-text-secondary)' }}>Photos</div>
              </div>
            </div>

            {result.failed > 0 && (
              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ color: 'var(--ds-color-error)', cursor: 'pointer' }}>
                  {result.failed} failed to import
                </summary>
                <ul style={{ fontSize: '0.875rem', maxHeight: '150px', overflow: 'auto' }}>
                  {result.errors.map((err, i) => (
                    <li key={i}>Line {err.line}: {err.reason}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="confirm-actions" style={{ justifyContent: 'center' }}>
              <button className="confirm-button" onClick={handleClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

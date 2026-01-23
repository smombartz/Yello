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
    } catch (error) {
      // Error is handled by mutation state
    }
  };

  const handleClose = () => {
    if (!importMutation.isPending) {
      onClose();
    }
  };

  return (
    <dialog open style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <article style={{ maxWidth: '500px', margin: 'auto' }}>
        <header>
          <button
            aria-label="Close"
            rel="prev"
            onClick={handleClose}
            disabled={importMutation.isPending}
          />
          <h3>Import Contacts</h3>
        </header>

        {!result ? (
          <>
            <p>Select a VCF file to import contacts.</p>

            <input
              type="file"
              ref={fileInputRef}
              accept=".vcf,text/vcard"
              onChange={handleFileChange}
              disabled={importMutation.isPending}
            />

            {selectedFile && (
              <p style={{ fontSize: '0.875rem', color: 'var(--pico-muted-color)' }}>
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            )}

            {importMutation.error && (
              <p style={{ color: 'var(--pico-del-color)' }}>
                Error: {importMutation.error.message}
              </p>
            )}

            <footer>
              <button
                className="secondary"
                onClick={handleClose}
                disabled={importMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!selectedFile || importMutation.isPending}
                aria-busy={importMutation.isPending}
              >
                {importMutation.isPending ? 'Importing...' : 'Import'}
              </button>
            </footer>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>
                {result.failed === 0 ? '✓' : '⚠'}
              </div>
              <h4 style={{ margin: 0 }}>Import Complete</h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: 'var(--pico-card-background-color)', borderRadius: '8px' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--pico-primary)' }}>{result.imported}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--pico-muted-color)' }}>Imported</div>
              </div>
              <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: 'var(--pico-card-background-color)', borderRadius: '8px' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{result.photosProcessed}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--pico-muted-color)' }}>Photos</div>
              </div>
            </div>

            {result.failed > 0 && (
              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ color: 'var(--pico-del-color)' }}>
                  {result.failed} failed to import
                </summary>
                <ul style={{ fontSize: '0.875rem', maxHeight: '150px', overflow: 'auto' }}>
                  {result.errors.map((err, i) => (
                    <li key={i}>Line {err.line}: {err.reason}</li>
                  ))}
                </ul>
              </details>
            )}

            <footer>
              <button onClick={handleClose}>Done</button>
            </footer>
          </>
        )}
      </article>
    </dialog>
  );
}

import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { useAuth } from '../hooks/useAuth';
import { useCompleteOnboarding } from '../api/authHooks';
import { useImportVcf, useUploadProfileImage } from '../api/hooks';
import { useImportLinkedInStream, parseLinkedInCsv } from '../api/settingsHooks';
import { Avatar } from './Avatar';
import './OnboardingView.css';

type Section = 'profile' | 'vcf' | 'linkedin' | null;

export default function OnboardingView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const completeOnboarding = useCompleteOnboarding();

  const [openSection, setOpenSection] = useState<Section>('profile');
  const [completed, setCompleted] = useState<Record<string, boolean>>({
    profile: false,
    vcf: false,
    linkedin: false,
  });

  // Refs for accordion control
  const profileRef = useRef<HTMLDetailsElement>(null);
  const vcfRef = useRef<HTMLDetailsElement>(null);
  const linkedinRef = useRef<HTMLDetailsElement>(null);

  // Profile upload
  const uploadImage = useUploadProfileImage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // VCF import
  const importVcf = useImportVcf();
  const vcfInputRef = useRef<HTMLInputElement>(null);
  const [vcfResult, setVcfResult] = useState<{ imported: number; photosProcessed: number; failed: number } | null>(null);

  // LinkedIn import
  const { isImporting: isLinkedInImporting, progress: linkedInProgress, importResult: linkedInResult, error: linkedInError, startImport: startLinkedInImport } = useImportLinkedInStream();
  const linkedInInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHeaderConfig({ title: 'Get Started' });
  }, [setHeaderConfig]);

  // Accordion: only one open at a time
  const handleToggle = useCallback((section: Section) => {
    return (e: React.ToggleEvent<HTMLDetailsElement>) => {
      if (e.newState === 'open') {
        setOpenSection(section);
        if (section !== 'profile') profileRef.current?.removeAttribute('open');
        if (section !== 'vcf') vcfRef.current?.removeAttribute('open');
        if (section !== 'linkedin') linkedinRef.current?.removeAttribute('open');
      } else if (openSection === section) {
        setOpenSection(null);
      }
    };
  }, [openSection]);

  const advanceToNext = useCallback((current: Section) => {
    const order: Section[] = ['profile', 'vcf', 'linkedin'];
    const idx = order.indexOf(current);
    const next = order[idx + 1];
    if (next) {
      setOpenSection(next);
      const refs: Record<string, React.RefObject<HTMLDetailsElement | null>> = { profile: profileRef, vcf: vcfRef, linkedin: linkedinRef };
      if (current) refs[current]?.current?.removeAttribute('open');
      setTimeout(() => {
        refs[next]?.current?.setAttribute('open', '');
      }, 100);
    }
  }, []);

  const markComplete = useCallback((section: string) => {
    setCompleted(prev => ({ ...prev, [section]: true }));
  }, []);

  const handleFinish = useCallback(async () => {
    await completeOnboarding.mutateAsync();
    navigate('/dashboard');
  }, [completeOnboarding, navigate]);

  // Profile photo handler
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadImage.mutateAsync(file);
      markComplete('profile');
      advanceToNext('profile');
    } catch {
      // Error handled by mutation state
    }
  }, [uploadImage, markComplete, advanceToNext]);

  // VCF handler
  const handleVcfSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importVcf.mutateAsync(file);
      setVcfResult(result);
      markComplete('vcf');
      advanceToNext('vcf');
    } catch {
      // Error handled by mutation state
    }
  }, [importVcf, markComplete, advanceToNext]);

  // LinkedIn handler
  const handleLinkedInSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const contacts = parseLinkedInCsv(content);
      if (contacts.length === 0) return;
      startLinkedInImport(contacts, () => {
        markComplete('linkedin');
      });
    } catch {
      // Error handled by hook state
    }
  }, [startLinkedInImport, markComplete]);

  const allComplete = completed.profile && completed.vcf && completed.linkedin;

  useEffect(() => {
    if (allComplete) {
      const timer = setTimeout(() => handleFinish(), 1500);
      return () => clearTimeout(timer);
    }
  }, [allComplete, handleFinish]);

  return (
    <div className="onboarding-container">
      <div className="onboarding-header">
        <h2>Welcome to Yello{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h2>
        <p>Get started by setting up your profile and importing your contacts.</p>
        <a className="skip-link" onClick={handleFinish}>
          Skip to Dashboard &rarr;
        </a>
      </div>

      {allComplete && (
        <p className="onboarding-success">You're all set! Redirecting to dashboard...</p>
      )}

      {/* Section 1: Profile */}
      <details ref={profileRef} open onToggle={handleToggle('profile')}>
        <summary>
          {completed.profile ? '\u2705' : '1.'} Set up your profile
        </summary>
        <div className="onboarding-section onboarding-profile">
          <div className="profile-preview">
            <Avatar
              photoUrl={user?.profileImages?.find(img => img.isPrimary)?.url || user?.avatarUrl || null}
              name={user?.name || user?.email || 'User'}
              size={120}
            />
            <div className="profile-info">
              <strong>{user?.name || 'Your Name'}</strong>
              <span>{user?.email}</span>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            className="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadImage.isPending}
          >
            {uploadImage.isPending ? 'Uploading...' : 'Upload Photo'}
          </button>
          {uploadImage.isError && (
            <p className="error-text">Failed to upload photo. Try again.</p>
          )}
        </div>
      </details>

      {/* Section 2: VCF Import */}
      <details ref={vcfRef} onToggle={handleToggle('vcf')}>
        <summary>
          {completed.vcf ? '\u2705' : '2.'} Import from Contacts (VCF)
        </summary>
        <div className="onboarding-section">
          <p>Import contacts from your phone or email client.</p>
          <details className="onboarding-instructions">
            <summary>How to export your contacts</summary>
            <ul>
              <li><strong>iPhone / iCloud:</strong> Go to <a href="https://www.icloud.com/contacts/" target="_blank" rel="noopener">icloud.com/contacts</a> &rarr; Select All (Cmd+A) &rarr; Export vCard</li>
              <li><strong>Google Contacts:</strong> Go to <a href="https://contacts.google.com/" target="_blank" rel="noopener">contacts.google.com</a> &rarr; Export &rarr; vCard format</li>
              <li><strong>Outlook:</strong> File &rarr; Open &amp; Export &rarr; Export to a file &rarr; choose CSV or vCard</li>
            </ul>
          </details>

          {vcfResult ? (
            <div className="import-result">
              <p>Imported <strong>{vcfResult.imported}</strong> contacts{vcfResult.photosProcessed > 0 && <>, processed <strong>{vcfResult.photosProcessed}</strong> photos</>}.</p>
            </div>
          ) : (
            <>
              <input
                ref={vcfInputRef}
                type="file"
                accept=".vcf,.vcard"
                onChange={handleVcfSelect}
                style={{ display: 'none' }}
              />
              <button
                className="outline"
                onClick={() => vcfInputRef.current?.click()}
                disabled={importVcf.isPending}
              >
                {importVcf.isPending ? 'Importing...' : 'Choose VCF File'}
              </button>
              {importVcf.isPending && <p className="muted-text">This may take a moment for large files.</p>}
              {importVcf.isError && <p className="error-text">Import failed. Please try again.</p>}
            </>
          )}
        </div>
      </details>

      {/* Section 3: LinkedIn Import */}
      <details ref={linkedinRef} onToggle={handleToggle('linkedin')}>
        <summary>
          {completed.linkedin ? '\u2705' : '3.'} Import from LinkedIn
        </summary>
        <div className="onboarding-section">
          <p>Import your LinkedIn connections.</p>
          <details className="onboarding-instructions">
            <summary>How to export from LinkedIn</summary>
            <ol>
              <li>Go to <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noopener">linkedin.com</a> &rarr; Click your profile icon &rarr; <strong>Settings &amp; Privacy</strong></li>
              <li>Select <strong>Data privacy</strong> &rarr; <strong>Get a copy of your data</strong></li>
              <li>Select <strong>Connections</strong> only (faster than the full archive)</li>
              <li>Click <strong>Request archive</strong> — LinkedIn will email you a download link (can take minutes to hours)</li>
              <li>Download the ZIP file, extract it, and find <code>Connections.csv</code></li>
              <li>Upload that CSV file below</li>
            </ol>
          </details>

          {linkedInResult ? (
            <div className="import-result">
              <p>Created <strong>{linkedInResult.created}</strong> / Updated <strong>{linkedInResult.updated}</strong> / Skipped <strong>{linkedInResult.skipped}</strong></p>
            </div>
          ) : isLinkedInImporting && linkedInProgress ? (
            <div className="import-progress">
              <p>Importing... Created: {linkedInProgress.created} / Updated: {linkedInProgress.updated} / Skipped: {linkedInProgress.skipped}</p>
              <progress value={linkedInProgress.current} max={linkedInProgress.total} />
            </div>
          ) : (
            <>
              <input
                ref={linkedInInputRef}
                type="file"
                accept=".csv"
                onChange={handleLinkedInSelect}
                style={{ display: 'none' }}
              />
              <button
                className="outline"
                onClick={() => linkedInInputRef.current?.click()}
                disabled={isLinkedInImporting}
              >
                Choose CSV File
              </button>
              {linkedInError && <p className="error-text">{linkedInError}</p>}
            </>
          )}
        </div>
      </details>

      <div className="onboarding-footer">
        <button onClick={handleFinish} disabled={completeOnboarding.isPending}>
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

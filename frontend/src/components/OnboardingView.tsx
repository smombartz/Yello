import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { useAuth } from '../hooks/useAuth';
import { useCompleteOnboarding } from '../api/authHooks';
import { useStartVcfImport, useUploadProfileImage } from '../api/hooks';
import { useImportStatus } from '../hooks/useImportStatus';
import type { ImportResult } from '../api/types';
import { useImportLinkedInStream, parseLinkedInCsv } from '../api/settingsHooks';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { FilePicker } from './ui/FilePicker';
import { useToast } from './ui/Toast';

type Section = 'profile' | 'vcf' | 'linkedin' | null;

const STEPS: { id: Exclude<Section, null>; icon: string; iconStyle?: 'brands'; title: string; desc: string }[] = [
  { id: 'profile', icon: 'user', title: 'Set up your profile', desc: 'Add a photo so people recognize you' },
  { id: 'vcf', icon: 'address-book', title: 'Import from Contacts', desc: 'Bring in contacts from your phone or email (VCF)' },
  { id: 'linkedin', icon: 'linkedin', iconStyle: 'brands', title: 'Import from LinkedIn', desc: 'Import your LinkedIn connections (CSV)' },
];

export default function OnboardingView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const completeOnboarding = useCompleteOnboarding();
  const { showToast } = useToast();

  const [openSection, setOpenSection] = useState<Section>('profile');
  const [completed, setCompleted] = useState<Record<string, boolean>>({
    profile: false,
    vcf: false,
    linkedin: false,
  });

  // Profile upload
  const uploadImage = useUploadProfileImage();
  const photoInputRef = useRef<HTMLInputElement>(null);

  // VCF import — staged upload plus a background job, so a large file does not
  // block the onboarding flow. The job is tracked app-wide (same source as the
  // global status pill) so leaving this page mid-import loses nothing.
  const startVcfImport = useStartVcfImport();
  const { job: vcfJob, startTracking: trackVcfImport, dismiss: dismissVcfImport } = useImportStatus();
  const [vcfFile, setVcfFile] = useState<File | null>(null);
  const [vcfUploadProgress, setVcfUploadProgress] = useState<number | null>(null);
  const [vcfResult, setVcfResult] = useState<ImportResult | null>(null);

  // LinkedIn import
  const { isImporting: isLinkedInImporting, progress: linkedInProgress, importResult: linkedInResult, error: linkedInError, startImport: startLinkedInImport } = useImportLinkedInStream();
  const [linkedInFile, setLinkedInFile] = useState<File | null>(null);

  useEffect(() => {
    setHeaderConfig({ title: 'Get Started' });
  }, [setHeaderConfig]);

  const toggleSection = useCallback((section: Section) => {
    setOpenSection(prev => (prev === section ? null : section));
  }, []);

  const advanceToNext = useCallback((current: Section) => {
    const order: Section[] = ['profile', 'vcf', 'linkedin'];
    const next = order[order.indexOf(current) + 1];
    setOpenSection(next ?? null);
  }, []);

  const markComplete = useCallback((section: string) => {
    setCompleted(prev => ({ ...prev, [section]: true }));
  }, []);

  const handleFinish = useCallback(async () => {
    await completeOnboarding.mutateAsync();
    navigate('/dashboard');
  }, [completeOnboarding, navigate]);

  // Profile photo handler
  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadImage.mutateAsync(file);
      markComplete('profile');
      advanceToNext('profile');
    } catch {
      showToast('Failed to upload photo. Try again.', { type: 'error' });
    }
  }, [uploadImage, markComplete, advanceToNext, showToast]);

  const isVcfRunning = vcfJob?.status === 'pending' || vcfJob?.status === 'running';
  const isVcfBusy = vcfUploadProgress !== null || isVcfRunning;
  const vcfPercent = vcfJob && vcfJob.totalCards > 0
    ? Math.min(100, Math.round((vcfJob.cardsProcessed / vcfJob.totalCards) * 100))
    : 0;

  // VCF handlers
  const handleVcfImport = useCallback(async () => {
    if (!vcfFile) return;
    setVcfUploadProgress(0);
    try {
      const { jobId } = await startVcfImport.mutateAsync({
        file: vcfFile,
        onUploadProgress: setVcfUploadProgress,
      });
      trackVcfImport(jobId);
    } catch {
      showToast('Import failed. Please try again.', { type: 'error' });
    } finally {
      setVcfUploadProgress(null);
    }
  }, [vcfFile, startVcfImport, trackVcfImport, showToast]);

  // The import runs server-side; advance the step only once it finishes.
  // Dismissing hands the result to this step's own summary, so the global pill
  // does not also linger with the same news.
  useEffect(() => {
    if (!vcfJob) return;
    if (vcfJob.status === 'completed' && vcfJob.result) {
      setVcfResult(vcfJob.result);
      dismissVcfImport();
      markComplete('vcf');
      advanceToNext('vcf');
    } else if (vcfJob.status === 'failed') {
      showToast(vcfJob.errorMessage ?? 'Import failed. Please try again.', { type: 'error' });
      dismissVcfImport();
    }
  }, [vcfJob, dismissVcfImport, markComplete, advanceToNext, showToast]);

  // LinkedIn handlers
  const handleLinkedInImport = useCallback(async () => {
    if (!linkedInFile) return;
    try {
      const content = await linkedInFile.text();
      const contacts = parseLinkedInCsv(content);
      if (contacts.length === 0) {
        showToast('No valid contacts found in CSV file', { type: 'error' });
        return;
      }
      startLinkedInImport(contacts, () => {
        markComplete('linkedin');
      });
    } catch {
      showToast('Failed to read CSV file', { type: 'error' });
    }
  }, [linkedInFile, startLinkedInImport, markComplete, showToast]);

  const allComplete = completed.profile && completed.vcf && completed.linkedin;
  const completedCount = STEPS.filter(step => completed[step.id]).length;

  useEffect(() => {
    if (allComplete) {
      const timer = setTimeout(() => handleFinish(), 1500);
      return () => clearTimeout(timer);
    }
  }, [allComplete, handleFinish]);

  const stepResult = (id: Exclude<Section, null>) => {
    if (id === 'profile') return 'Profile photo uploaded';
    if (id === 'vcf' && vcfResult) {
      return (
        <>Imported <strong>{vcfResult.imported}</strong> contacts{vcfResult.skipped > 0 && <>, skipped <strong>{vcfResult.skipped}</strong> already present</>}{vcfResult.photosProcessed > 0 && <>, processed <strong>{vcfResult.photosProcessed}</strong> photos</>}</>
      );
    }
    if (id === 'linkedin' && linkedInResult) {
      return (
        <>Created <strong>{linkedInResult.created}</strong> &middot; Updated <strong>{linkedInResult.updated}</strong> &middot; Skipped <strong>{linkedInResult.skipped}</strong></>
      );
    }
    return 'Done';
  };

  const renderStepBody = (id: Exclude<Section, null>) => {
    if (id === 'profile') {
      return (
        <div className="onboarding-profile">
          <Avatar
            photoUrl={user?.profileImages?.find(img => img.isPrimary)?.url || user?.avatarUrl || null}
            name={user?.name || user?.email || 'User'}
            size={120}
          />
          <div className="onboarding-profile__info">
            <span className="onboarding-profile__name">{user?.name || 'Your Name'}</span>
            <span className="onboarding-profile__email">{user?.email}</span>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoSelect}
            style={{ display: 'none' }}
          />
          <Button
            variant="secondary"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadImage.isPending}
          >
            <Icon name={uploadImage.isPending ? 'arrows-rotate' : 'camera'} className={uploadImage.isPending ? 'spinning' : ''} />
            {uploadImage.isPending ? 'Uploading...' : completed.profile ? 'Change Photo' : 'Upload Photo'}
          </Button>
        </div>
      );
    }

    if (id === 'vcf') {
      return (
        <>
          <div className="onboarding-help">
            <h4 className="onboarding-help__title"><Icon name="circle-info" /> How to export your contacts</h4>
            <ul>
              <li><strong>iPhone / iCloud:</strong> Go to <a href="https://www.icloud.com/contacts/" target="_blank" rel="noopener">icloud.com/contacts</a> &rarr; Select All (Cmd+A) &rarr; Export vCard</li>
              <li><strong>Google Contacts:</strong> Go to <a href="https://contacts.google.com/" target="_blank" rel="noopener">contacts.google.com</a> &rarr; Export &rarr; vCard format</li>
              <li><strong>Outlook:</strong> File &rarr; Open &amp; Export &rarr; Export to a file &rarr; choose CSV or vCard</li>
            </ul>
          </div>
          <div className="import-controls">
            <FilePicker
              id="onboarding-vcf-input"
              accept=".vcf,.vcard"
              file={vcfFile}
              onChange={setVcfFile}
              prompt="Choose VCF file"
              disabled={isVcfBusy}
            />
            <Button
              variant="secondary"
              onClick={handleVcfImport}
              disabled={!vcfFile || isVcfBusy}
            >
              <Icon name={isVcfBusy ? 'arrows-rotate' : 'upload'} className={isVcfBusy ? 'spinning' : ''} />
              {isVcfBusy ? 'Importing...' : 'Import Contacts'}
            </Button>
          </div>
          {vcfUploadProgress !== null && (
            <div className="import-progress-inline">
              <p className="onboarding-step__desc">Uploading… {vcfUploadProgress}%</p>
              <progress value={vcfUploadProgress} max={100} />
            </div>
          )}
          {isVcfRunning && vcfJob && (
            <div className="import-progress-inline">
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${vcfPercent}%` }} />
              </div>
              <p className="onboarding-step__desc">
                Importing {vcfJob.cardsProcessed.toLocaleString()} of {vcfJob.totalCards.toLocaleString()} contacts — this keeps running in the background.
              </p>
            </div>
          )}
        </>
      );
    }

    return (
      <>
        <div className="onboarding-help">
          <h4 className="onboarding-help__title"><Icon name="circle-info" /> How to export from LinkedIn</h4>
          <ol>
            <li>Go to <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noopener">linkedin.com</a> &rarr; Click your profile icon &rarr; <strong>Settings &amp; Privacy</strong></li>
            <li>Select <strong>Data privacy</strong> &rarr; <strong>Get a copy of your data</strong></li>
            <li>Select <strong>Connections</strong> only (faster than the full archive)</li>
            <li>Click <strong>Request archive</strong> &mdash; LinkedIn will email you a download link (can take minutes to hours)</li>
            <li>Download the ZIP file, extract it, and find <code>Connections.csv</code></li>
            <li>Upload that CSV file below</li>
          </ol>
        </div>
        {isLinkedInImporting && linkedInProgress ? (
          <div>
            <div className="progress-bar-container">
              <div
                className="progress-bar-fill"
                style={{ width: `${(linkedInProgress.current / linkedInProgress.total) * 100}%` }}
              />
            </div>
            <div className="progress-text">
              Processing {linkedInProgress.current} of {linkedInProgress.total} contacts...
            </div>
          </div>
        ) : (
          <div className="import-controls">
            <FilePicker
              id="onboarding-linkedin-input"
              accept=".csv"
              file={linkedInFile}
              onChange={setLinkedInFile}
              prompt="Choose CSV file"
              disabled={isLinkedInImporting}
            />
            <Button
              variant="secondary"
              icon="upload"
              onClick={handleLinkedInImport}
              disabled={!linkedInFile || isLinkedInImporting}
            >
              Import Contacts
            </Button>
          </div>
        )}
        {linkedInError && (
          <div className="import-error">
            <Icon name="circle-exclamation" />
            <span>{linkedInError}</span>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="onboarding-view">
      <div className="onboarding-content">
        <div className="onboarding-hero">
          <span className="onboarding-hero__badge"><Icon name="hand-sparkles" /> Welcome</span>
          <h2 className="onboarding-hero__title">Welcome to Yello{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h2>
          <p className="onboarding-hero__subtitle">Get started by setting up your profile and importing your contacts.</p>
          <div className="onboarding-hero__progress">
            {STEPS.map(step => (
              <span key={step.id} className={`onboarding-hero__dot${completed[step.id] ? ' onboarding-hero__dot--done' : ''}`} />
            ))}
            {completedCount} of {STEPS.length} complete
          </div>
        </div>

        <button className="onboarding-skip" onClick={handleFinish}>
          Skip to Dashboard &rarr;
        </button>

        {allComplete && (
          <div className="onboarding-success">
            <Icon name="circle-check" />
            You're all set! Redirecting to dashboard...
          </div>
        )}

        <div className="onboarding-steps">
          {STEPS.map(step => {
            const isDone = completed[step.id];
            const isOpen = openSection === step.id;
            return (
              <div
                key={step.id}
                className={`onboarding-step${isOpen ? ' onboarding-step--active' : ''}${isDone ? ' onboarding-step--done' : ''}`}
              >
                <button
                  className="onboarding-step__header"
                  aria-expanded={isOpen}
                  onClick={() => toggleSection(step.id)}
                >
                  <span className="onboarding-step__icon">
                    <Icon name={isDone ? 'circle-check' : step.icon} style={isDone ? 'solid' : step.iconStyle} />
                  </span>
                  <span className="onboarding-step__titles">
                    <h3 className="onboarding-step__title">{step.title}</h3>
                    <p className="onboarding-step__desc">{step.desc}</p>
                  </span>
                  <span className="onboarding-step__meta">
                    {isDone && <Badge variant="success">Done</Badge>}
                    <Icon name="chevron-down" />
                  </span>
                </button>
                {isOpen ? (
                  <div className="onboarding-step__body">{renderStepBody(step.id)}</div>
                ) : isDone ? (
                  <div className="onboarding-step__result">
                    <Icon name="circle-check" />
                    <span>{stepResult(step.id)}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="onboarding-footer">
          <Button variant="primary" onClick={handleFinish} disabled={completeOnboarding.isPending}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { SocialLinksCrossContact } from './SocialLinksCrossContact';
import { SocialLinksWithinContact } from './SocialLinksWithinContact';
import { useSocialLinksSummary } from '../api/socialLinksHooks';
import type { SocialLinksMode } from '../api/types';

export function SocialLinksCleanup() {
  const [mode, setMode] = useState<SocialLinksMode>('cross-contact');
  const { data: summary, isLoading: isSummaryLoading } = useSocialLinksSummary();

  return (
    <div className="social-links-cleanup">
      <div className="social-links-tabs">
        <button
          className={`social-links-tab ${mode === 'cross-contact' ? 'active' : ''}`}
          onClick={() => setMode('cross-contact')}
          disabled={isSummaryLoading}
        >
          <span className="material-symbols-outlined">group</span>
          <span className="tab-label">Cross-contact</span>
          <span className="tab-count">{summary?.crossContact ?? 0}</span>
        </button>
        <button
          className={`social-links-tab ${mode === 'within-contact' ? 'active' : ''}`}
          onClick={() => setMode('within-contact')}
          disabled={isSummaryLoading}
        >
          <span className="material-symbols-outlined">link</span>
          <span className="tab-label">Within-contact</span>
          <span className="tab-count">{summary?.withinContact ?? 0}</span>
        </button>
      </div>

      <div className="social-links-content">
        {mode === 'cross-contact' ? (
          <SocialLinksCrossContact />
        ) : (
          <SocialLinksWithinContact />
        )}
      </div>
    </div>
  );
}

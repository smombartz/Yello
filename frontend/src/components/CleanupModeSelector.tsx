import type { CleanupMode, CleanupSummary, SocialLinksSummary, AddressCleanupSummary } from '../api/types';

interface CleanupModeSelectorProps {
  selectedMode: CleanupMode;
  onModeChange: (mode: CleanupMode) => void;
  summary: CleanupSummary | undefined;
  socialLinksSummary?: SocialLinksSummary;
  addressCleanupSummary?: AddressCleanupSummary;
  isLoading: boolean;
}

const MODE_CONFIG: { mode: CleanupMode; label: string; icon: string }[] = [
  { mode: 'empty', label: 'Empty Contacts', icon: 'person_off' },
  { mode: 'problematic', label: 'Problematic Emails', icon: 'warning' },
  { mode: 'social-links', label: 'Social Links', icon: 'share' },
  { mode: 'invalid-links', label: 'Invalid Links', icon: 'link_off' },
  { mode: 'addresses', label: 'Addresses', icon: 'location_on' },
];

export function CleanupModeSelector({
  selectedMode,
  onModeChange,
  summary,
  socialLinksSummary,
  addressCleanupSummary,
  isLoading
}: CleanupModeSelectorProps) {
  const getCount = (mode: CleanupMode): number | null => {
    if (mode === 'social-links') {
      if (!socialLinksSummary) return 0;
      return socialLinksSummary.crossContact + socialLinksSummary.withinContact;
    }
    if (mode === 'invalid-links') {
      return null; // No count for invalid links - it's pattern-based
    }
    if (mode === 'addresses') {
      return addressCleanupSummary?.totalContacts ?? 0;
    }
    if (!summary) return 0;
    return mode === 'empty' ? summary.empty.total : summary.problematic.total;
  };

  return (
    <div className="cleanup-mode-selector">
      {MODE_CONFIG.map(({ mode, label, icon }) => {
        const count = getCount(mode);
        const isActive = mode === selectedMode;

        return (
          <button
            key={mode}
            className={`cleanup-mode-pill ${isActive ? 'active' : ''}`}
            onClick={() => onModeChange(mode)}
            disabled={isLoading}
          >
            <span className="material-symbols-outlined">{icon}</span>
            <span className="cleanup-mode-label">{label}</span>
            {count !== null && <span className="cleanup-mode-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

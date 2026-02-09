import { Icon } from './Icon';
import type { CleanupMode, CleanupSummary, SocialLinksSummary, AddressCleanupSummary } from '../api/types';

interface CleanupModeSelectorProps {
  selectedMode: CleanupMode;
  onModeChange: (mode: CleanupMode) => void;
  summary: CleanupSummary | undefined;
  socialLinksSummary?: SocialLinksSummary;
  addressCleanupSummary?: AddressCleanupSummary;
  isLoading: boolean;
}

const MODE_CONFIG: { mode: CleanupMode; label: string; icon: string; iconStyle?: 'solid' | 'regular' | 'brands' }[] = [
  { mode: 'empty', label: 'Empty Contacts', icon: 'user-slash' },
  { mode: 'problematic', label: 'Problematic Emails', icon: 'triangle-exclamation' },
  { mode: 'social-links', label: 'Social Links', icon: 'share-nodes' },
  { mode: 'invalid-links', label: 'Invalid Links', icon: 'link-slash' },
  { mode: 'addresses', label: 'Addresses', icon: 'location-dot' },
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
      {MODE_CONFIG.map(({ mode, label, icon, iconStyle }) => {
        const count = getCount(mode);
        const isActive = mode === selectedMode;

        return (
          <button
            key={mode}
            className={`cleanup-mode-pill ${isActive ? 'active' : ''}`}
            onClick={() => onModeChange(mode)}
            disabled={isLoading}
          >
            <Icon name={icon} style={iconStyle} />
            <span className="cleanup-mode-label">{label}</span>
            {count !== null && <span className="cleanup-mode-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

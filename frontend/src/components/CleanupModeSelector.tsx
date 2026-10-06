import { Tabs } from './ui/Tabs';
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
    <Tabs
      items={MODE_CONFIG.map(({ mode, label, icon }) => ({ id: mode, label, icon, count: getCount(mode) }))}
      value={selectedMode}
      onChange={onModeChange}
      disabled={isLoading}
      aria-label="Cleanup category"
    />
  );
}

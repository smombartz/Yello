import { Tabs } from './ui/Tabs';
import type { DeduplicationMode, DuplicateSummary } from '../api/types';

interface ModeSelectorProps {
  selectedMode: DeduplicationMode;
  onModeChange: (mode: DeduplicationMode) => void;
  summary: DuplicateSummary | undefined;
  isLoading: boolean;
}

const MODE_LABELS: Record<DeduplicationMode, string> = {
  recommended: 'Recommended',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  'social-links': 'Social Links',
};

const MODE_ICONS: Record<DeduplicationMode, string> = {
  recommended: 'wand-magic-sparkles',
  email: 'envelope',
  phone: 'phone',
  address: 'location-dot',
  'social-links': 'share-nodes',
};

const MODES: DeduplicationMode[] = ['recommended', 'email', 'phone', 'address', 'social-links'];

export function ModeSelector({ selectedMode, onModeChange, summary, isLoading }: ModeSelectorProps) {
  const items = MODES.map((mode) => ({
    id: mode,
    label: MODE_LABELS[mode],
    icon: MODE_ICONS[mode],
    count: mode === 'recommended'
      ? (summary?.recommended?.total ?? 0)
      : mode === 'social-links'
        ? (summary?.socialLinks ?? 0)
        : (summary?.[mode] ?? 0),
  }));

  return (
    <Tabs
      items={items}
      value={selectedMode}
      onChange={onModeChange}
      disabled={isLoading}
      aria-label="Duplicate matching strategy"
    />
  );
}

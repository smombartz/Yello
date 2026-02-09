import { Icon } from './Icon';
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
  return (
    <div className="mode-selector">
      {MODES.map((mode) => {
        const count = mode === 'recommended'
          ? (summary?.recommended?.total ?? 0)
          : mode === 'social-links'
            ? (summary?.socialLinks ?? 0)
            : (summary?.[mode] ?? 0);
        const isActive = mode === selectedMode;

        return (
          <button
            key={mode}
            className={`mode-pill ${isActive ? 'active' : ''}`}
            onClick={() => onModeChange(mode)}
            disabled={isLoading}
          >
            <Icon name={MODE_ICONS[mode]} />
            <span className="mode-label">{MODE_LABELS[mode]}</span>
            <span className="mode-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

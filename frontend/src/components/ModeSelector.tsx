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
  recommended: 'auto_awesome',
  email: 'mail',
  phone: 'phone',
  address: 'location_on',
  'social-links': 'share',
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
            <span className="material-symbols-outlined">{MODE_ICONS[mode]}</span>
            <span className="mode-label">{MODE_LABELS[mode]}</span>
            <span className="mode-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

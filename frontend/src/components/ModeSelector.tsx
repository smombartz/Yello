import type { DeduplicationMode, DuplicateSummary } from '../api/types';

interface ModeSelectorProps {
  selectedMode: DeduplicationMode;
  onModeChange: (mode: DeduplicationMode) => void;
  summary: DuplicateSummary | undefined;
  isLoading: boolean;
}

const MODE_LABELS: Record<DeduplicationMode, string> = {
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  social: 'Social',
};

const MODE_ICONS: Record<DeduplicationMode, string> = {
  email: 'mail',
  phone: 'phone',
  address: 'location_on',
  social: 'share',
};

const MODES: DeduplicationMode[] = ['email', 'phone', 'address', 'social'];

export function ModeSelector({ selectedMode, onModeChange, summary, isLoading }: ModeSelectorProps) {
  return (
    <div className="mode-selector">
      {MODES.map((mode) => {
        const count = summary?.[mode] ?? 0;
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

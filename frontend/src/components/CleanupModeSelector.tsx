import type { CleanupMode, CleanupSummary } from '../api/types';

interface CleanupModeSelectorProps {
  selectedMode: CleanupMode;
  onModeChange: (mode: CleanupMode) => void;
  summary: CleanupSummary | undefined;
  isLoading: boolean;
}

const MODE_CONFIG: { mode: CleanupMode; label: string; icon: string }[] = [
  { mode: 'empty', label: 'Empty Contacts', icon: 'person_off' },
  { mode: 'problematic', label: 'Problematic Emails', icon: 'warning' },
];

export function CleanupModeSelector({
  selectedMode,
  onModeChange,
  summary,
  isLoading
}: CleanupModeSelectorProps) {
  const getCount = (mode: CleanupMode): number => {
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
            <span className="cleanup-mode-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

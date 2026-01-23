import type { ConfidenceLevel } from '../api/types';

interface ConfidenceFilterProps {
  selectedLevels: Set<ConfidenceLevel>;
  onToggle: (level: ConfidenceLevel) => void;
  counts: { veryHigh: number; high: number; medium: number };
}

const CONFIDENCE_LEVELS: { level: ConfidenceLevel; label: string; cssClass: string }[] = [
  { level: 'very_high', label: 'Very High', cssClass: 'very-high' },
  { level: 'high', label: 'High', cssClass: 'high' },
  { level: 'medium', label: 'Medium', cssClass: 'medium' },
];

export function ConfidenceFilter({ selectedLevels, onToggle, counts }: ConfidenceFilterProps) {
  const getCount = (level: ConfidenceLevel): number => {
    switch (level) {
      case 'very_high':
        return counts.veryHigh;
      case 'high':
        return counts.high;
      case 'medium':
        return counts.medium;
    }
  };

  return (
    <div className="confidence-filter">
      {CONFIDENCE_LEVELS.map(({ level, label, cssClass }) => {
        const isActive = selectedLevels.has(level);
        const count = getCount(level);

        return (
          <button
            key={level}
            type="button"
            className={`confidence-chip ${cssClass}${isActive ? ' active' : ''}`}
            onClick={() => onToggle(level)}
            aria-pressed={isActive}
          >
            {label} ({count})
          </button>
        );
      })}
    </div>
  );
}

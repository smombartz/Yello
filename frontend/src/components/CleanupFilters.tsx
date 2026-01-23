import type {
  CleanupMode,
  CleanupSummary,
  EmptyContactType,
  ProblematicContactType
} from '../api/types';

interface CleanupFiltersProps {
  mode: CleanupMode;
  selectedTypes: Set<EmptyContactType | ProblematicContactType>;
  onToggleType: (type: EmptyContactType | ProblematicContactType) => void;
  summary: CleanupSummary | undefined;
}

const EMPTY_FILTERS: { type: EmptyContactType; label: string }[] = [
  { type: 'truly_empty', label: 'Truly Empty' },
  { type: 'name_only', label: 'Name Only' },
];

const PROBLEMATIC_FILTERS: { type: ProblematicContactType; label: string }[] = [
  { type: 'many_domains', label: 'Many Domains' },
  { type: 'same_domain', label: 'Same Domain' },
];

export function CleanupFilters({
  mode,
  selectedTypes,
  onToggleType,
  summary
}: CleanupFiltersProps) {
  const filters = mode === 'empty' ? EMPTY_FILTERS : PROBLEMATIC_FILTERS;

  const getCount = (type: EmptyContactType | ProblematicContactType): number => {
    if (!summary) return 0;

    switch (type) {
      case 'truly_empty':
        return summary.empty.trulyEmpty;
      case 'name_only':
        return summary.empty.nameOnly;
      case 'many_domains':
        return summary.problematic.manyDomains;
      case 'same_domain':
        return summary.problematic.sameDomain;
      default:
        return 0;
    }
  };

  return (
    <div className="cleanup-filters">
      {filters.map(({ type, label }) => {
        const count = getCount(type);
        const isActive = selectedTypes.size === 0 || selectedTypes.has(type);

        return (
          <button
            key={type}
            type="button"
            className={`cleanup-filter-chip ${isActive ? 'active' : ''}`}
            onClick={() => onToggleType(type)}
            aria-pressed={isActive}
          >
            {label} ({count})
          </button>
        );
      })}
    </div>
  );
}

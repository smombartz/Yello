import { Tabs } from './ui/Tabs';
import type {
  CleanupMode,
  CleanupSummary,
  EmptyContactType,
  ProblematicContactType
} from '../api/types';

export type CleanupListType = EmptyContactType | ProblematicContactType;

interface CleanupFiltersProps {
  mode: CleanupMode;
  selectedType: CleanupListType;
  onTypeChange: (type: CleanupListType) => void;
  summary: CleanupSummary | undefined;
  disabled?: boolean;
}

const EMPTY_LISTS: { id: EmptyContactType; label: string }[] = [
  { id: 'truly_empty', label: 'Truly Empty' },
  { id: 'no_name', label: 'No Name' },
  { id: 'name_only', label: 'Name Only' },
];

const PROBLEMATIC_LISTS: { id: ProblematicContactType; label: string }[] = [
  { id: 'many_domains', label: 'Many Domains' },
  { id: 'same_domain', label: 'Same Domain' },
];

/** The list a mode opens on: its first tab. */
export function defaultCleanupListType(mode: CleanupMode): CleanupListType {
  return mode === 'problematic' ? PROBLEMATIC_LISTS[0].id : EMPTY_LISTS[0].id;
}

function countOf(type: CleanupListType, summary: CleanupSummary | undefined): number | null {
  if (!summary) return null;
  switch (type) {
    case 'truly_empty': return summary.empty.trulyEmpty;
    case 'no_name': return summary.empty.noName;
    case 'name_only': return summary.empty.nameOnly;
    case 'many_domains': return summary.problematic.manyDomains;
    case 'same_domain': return summary.problematic.sameDomain;
  }
}

/**
 * The lists inside a cleanup mode (Truly Empty / No Name / Name Only, or
 * Many Domains / Same Domain) as a tab bar: one list shown at a time.
 */
export function CleanupFilters({
  mode,
  selectedType,
  onTypeChange,
  summary,
  disabled = false
}: CleanupFiltersProps) {
  const lists: { id: CleanupListType; label: string }[] = mode === 'problematic' ? PROBLEMATIC_LISTS : EMPTY_LISTS;

  return (
    <Tabs
      items={lists.map(({ id, label }) => ({ id, label, count: countOf(id, summary) }))}
      value={selectedType}
      onChange={onTypeChange}
      disabled={disabled}
      aria-label={mode === 'problematic' ? 'Problematic email list' : 'Empty contact list'}
    />
  );
}

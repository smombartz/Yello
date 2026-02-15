import { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';

interface FilterDefinition {
  hasKey: string;
  noKey: string;
  label: string;
}

const FILTER_GROUPS: { title: string; filters: FilterDefinition[] }[] = [
  {
    title: 'Contact Info',
    filters: [
      { hasKey: 'has-email', noKey: 'no-email', label: 'Email' },
      { hasKey: 'has-phone', noKey: 'no-phone', label: 'Phone' },
      { hasKey: 'has-address', noKey: 'no-address', label: 'Address' },
      { hasKey: 'has-birthday', noKey: 'no-birthday', label: 'Birthday' },
      { hasKey: 'has-photo', noKey: 'no-photo', label: 'Photo' },
    ],
  },
  {
    title: 'Social & Enrichment',
    filters: [
      { hasKey: 'has-linkedin', noKey: 'no-linkedin', label: 'LinkedIn' },
      { hasKey: 'has-instagram', noKey: 'no-instagram', label: 'Instagram' },
      { hasKey: 'has-enrichment', noKey: 'no-enrichment', label: 'LinkedIn Enrichment' },
    ],
  },
];

const FILTER_LABELS: Record<string, string> = {};
FILTER_GROUPS.forEach(g => g.filters.forEach(f => {
  FILTER_LABELS[f.hasKey] = `Has ${f.label}`;
  FILTER_LABELS[f.noKey] = `No ${f.label}`;
}));

interface ContactFiltersProps {
  filters: Set<string>;
  onFiltersChange: (filters: Set<string>) => void;
}

export function getFilterLabel(key: string): string {
  return FILTER_LABELS[key] || key;
}

export function ContactFilters({ filters, onFiltersChange }: ContactFiltersProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function getState(def: FilterDefinition): 'any' | 'has' | 'no' {
    if (filters.has(def.hasKey)) return 'has';
    if (filters.has(def.noKey)) return 'no';
    return 'any';
  }

  function cycleFilter(def: FilterDefinition) {
    const next = new Set(filters);
    const current = getState(def);
    next.delete(def.hasKey);
    next.delete(def.noKey);
    if (current === 'any') next.add(def.hasKey);
    else if (current === 'has') next.add(def.noKey);
    // 'no' → 'any' (remove both, already done)
    onFiltersChange(next);
  }

  const activeCount = filters.size;

  return (
    <div className="contact-filters-container">
      <button
        ref={buttonRef}
        className={`contact-action-button ${activeCount > 0 ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        title="Filter contacts"
      >
        <Icon name="filter" />
        Filter
        {activeCount > 0 && <span className="filter-badge">{activeCount}</span>}
      </button>
      {open && (
        <div ref={popoverRef} className="filter-popover">
          <div className="filter-popover-header">
            <span>Filters</span>
            {activeCount > 0 && (
              <button
                className="filter-clear-btn"
                onClick={() => onFiltersChange(new Set())}
              >
                Clear all
              </button>
            )}
          </div>
          {FILTER_GROUPS.map(group => (
            <div key={group.title} className="filter-group">
              <div className="filter-group-title">{group.title}</div>
              {group.filters.map(def => {
                const state = getState(def);
                return (
                  <button
                    key={def.hasKey}
                    className={`filter-row ${state !== 'any' ? 'active' : ''}`}
                    onClick={() => cycleFilter(def)}
                  >
                    <span className="filter-row-label">{def.label}</span>
                    <span className={`filter-state filter-state-${state}`}>
                      {state === 'any' ? 'Any' : state === 'has' ? 'Yes' : 'No'}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

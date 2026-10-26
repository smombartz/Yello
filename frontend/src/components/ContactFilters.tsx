import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { Button } from './ui/Button';
import { SORT_OPTIONS, DEFAULT_SORT } from '../constants/contactListOptions';

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
  /**
   * Phones: an icon-only trigger (it sits beside the header search) that opens
   * a sort & filter sheet. Given sort/view handlers, the sheet carries those too,
   * since the phone has no list toolbar for them.
   */
  iconOnly?: boolean;
  sort?: string;
  onSortChange?: (sort: string) => void;
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
}

export function getFilterLabel(key: string): string {
  return FILTER_LABELS[key] || key;
}

export function ContactFilters({
  filters,
  onFiltersChange,
  iconOnly = false,
  sort,
  onSortChange,
  viewMode,
  onViewModeChange,
}: ContactFiltersProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      // The phone sheet's backdrop closes on its own click; closing here on mousedown
      // would remove it before the click, which would then land on the row behind.
      if (e.target === backdropRef.current) return;
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    // Capture phase, so Escape closes the menu before Layout's global Escape sees it
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
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
  const showView = viewMode !== undefined && onViewModeChange !== undefined;
  const showSort = onSortChange !== undefined;
  const currentSort = sort || DEFAULT_SORT;
  const title = showSort ? 'Sort & filter' : 'Filters';

  const trigger = iconOnly ? (
    <Button
      ref={buttonRef}
      variant="icon"
      icon="sliders"
      className={`filter-icon-trigger${activeCount > 0 ? ' is-active' : ''}`}
      onClick={() => setOpen(!open)}
      aria-label={activeCount > 0 ? `${title}, ${activeCount} active` : title}
      aria-expanded={open}
      aria-haspopup="dialog"
    >
      {activeCount > 0 && <span className="filter-badge" aria-hidden="true">{activeCount}</span>}
    </Button>
  ) : (
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
  );

  const menu = (
    <>
      <div ref={backdropRef} className="filter-sheet-backdrop" onClick={() => setOpen(false)} />
      <div ref={popoverRef} className="filter-popover" role="dialog" aria-label={title}>
        <div className="filter-popover-header">
          <span>{title}</span>
          <div className="filter-popover-header-actions">
            {activeCount > 0 && (
              <button
                className="filter-clear-btn"
                onClick={() => onFiltersChange(new Set())}
              >
                {/* With sort in the same sheet, say that only the filters reset */}
                {showSort ? 'Clear filters' : 'Clear all'}
              </button>
            )}
            {iconOnly && (
              <button className="filter-done-btn" onClick={() => setOpen(false)}>
                Done
              </button>
            )}
          </div>
        </div>
        {showView && (
          <div className="filter-group">
            <div className="filter-group-title" id="filter-view-title">View</div>
            <div className="filter-segmented" role="radiogroup" aria-labelledby="filter-view-title">
              {([['list', 'list', 'List'], ['grid', 'table-cells-large', 'Grid']] as const).map(([mode, icon, label]) => (
                <button
                  key={mode}
                  role="radio"
                  aria-checked={viewMode === mode}
                  className={`filter-segment${viewMode === mode ? ' selected' : ''}`}
                  onClick={() => onViewModeChange(mode)}
                >
                  <Icon name={icon} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {showSort && (
          <div className="filter-group" role="radiogroup" aria-labelledby="filter-sort-title">
            <div className="filter-group-title" id="filter-sort-title">Sort</div>
            {SORT_OPTIONS.map(option => (
              <button
                key={option.value}
                role="radio"
                aria-checked={currentSort === option.value}
                className={`filter-row${currentSort === option.value ? ' selected' : ''}`}
                onClick={() => onSortChange(option.value)}
              >
                <span className="filter-row-label">{option.label}</span>
                {currentSort === option.value && <Icon name="check" className="filter-row-check" />}
              </button>
            ))}
          </div>
        )}
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
    </>
  );

  return (
    <div className="contact-filters-container">
      {trigger}
      {/* The phone sheet goes to <body>: inside the fixed header it would share the
          header's stacking context and sit under the bottom tab bar. */}
      {open && (iconOnly ? createPortal(menu, document.body) : menu)}
    </div>
  );
}

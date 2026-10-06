import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Icon } from '../Icon';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Optional leading Font Awesome icon name */
  icon?: string;
  /** Optional count pill; omit or pass null to hide it */
  count?: number | null;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Disables every tab (e.g. while the data behind the counts loads) */
  disabled?: boolean;
  'aria-label': string;
  className?: string;
}

/**
 * Canonical underline tab bar: `.tabs` / `.tab` / `.tab-count`.
 * Accessible tablist with roving tabindex: Arrow keys, Home and End move
 * between tabs and select them.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
  className = '',
}: TabsProps<T>) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    tabRefs.current[next]?.focus();
    onChange(items[next].id);
  };

  return (
    <div className={['tabs', className].filter(Boolean).join(' ')} role="tablist" aria-label={ariaLabel}>
      {items.map((item, index) => {
        const isActive = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => { tabRefs.current[index] = el; }}
            type="button"
            role="tab"
            className={`tab${isActive ? ' active' : ''}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {item.icon && <Icon name={item.icon} />}
            <span className="tab-label">{item.label}</span>
            {item.count != null && <span className="tab-count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

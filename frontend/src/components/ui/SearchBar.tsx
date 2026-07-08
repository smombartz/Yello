import type { Ref } from 'react';
import { Icon } from '../Icon';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 'boxed' = bordered pill (default); 'plain' = borderless row for use inside a card */
  variant?: 'boxed' | 'plain';
  /**
   * Trailing button behaviour: 'clear' (default) shows an X only when there's a value
   * and clears the text; 'cancel' always shows an X and calls onCancel.
   */
  trailing?: 'clear' | 'cancel';
  onCancel?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}

/** Shared search input: magnifying-glass icon + text field + clear/cancel button. */
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  variant = 'boxed',
  trailing = 'clear',
  onCancel,
  autoFocus = false,
  disabled = false,
  inputRef,
  className = '',
}: SearchBarProps) {
  const showTrailing = trailing === 'cancel' ? true : value.length > 0;
  const classes = ['search-bar', variant === 'plain' ? 'search-bar--plain' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <Icon name="magnifying-glass" className="search-bar-icon" />
      <input
        ref={inputRef}
        type="text"
        className="search-bar-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
      />
      {showTrailing && (
        <button
          type="button"
          className="search-bar-clear"
          onClick={() => (trailing === 'cancel' ? onCancel?.() : onChange(''))}
          aria-label={trailing === 'cancel' ? 'Cancel search' : 'Clear search'}
        >
          <Icon name="xmark" />
        </button>
      )}
    </div>
  );
}

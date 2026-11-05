import { useImperativeHandle, useRef } from 'react';
import type { Ref } from 'react';
import { Input } from 'antd';
import type { InputRef } from 'antd';
import { Icon } from '../Icon';
import { Button } from './Button';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name for the field when no visible label sits beside it */
  ariaLabel?: string;
  /** 'boxed' = bordered pill (default); 'plain' = borderless row for use inside a card */
  variant?: 'boxed' | 'plain';
  /**
   * Trailing button behaviour: 'clear' (default) shows an X only when there's a value
   * and clears the text; 'cancel' always shows an X and calls onCancel.
   */
  trailing?: 'clear' | 'cancel';
  onCancel?: () => void;
  /** Called when the user presses Enter in the field. */
  onSubmit?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}

const searchIcon = <Icon name="magnifying-glass" />;
const clearConfig = { clearIcon: <Icon name="circle-xmark-solid" /> };

/** Shared search input (Ant Input): magnifying-glass icon + text field + clear/cancel button. */
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  ariaLabel,
  variant = 'boxed',
  trailing = 'clear',
  onCancel,
  onSubmit,
  autoFocus = false,
  disabled = false,
  inputRef,
  className,
}: SearchBarProps) {
  // Ant's ref is an InputRef wrapper; callers want the real <input> for .focus()/.select()
  const antRef = useRef<InputRef>(null);
  useImperativeHandle(inputRef, () => antRef.current?.input as HTMLInputElement, []);

  return (
    <Input
      ref={antRef}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPressEnter={onSubmit}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      disabled={disabled}
      prefix={searchIcon}
      variant={variant === 'plain' ? 'borderless' : 'outlined'}
      allowClear={trailing === 'clear' ? clearConfig : false}
      suffix={trailing === 'cancel'
        ? <Button variant="icon" icon="xmark" aria-label="Cancel search" onClick={onCancel} />
        : undefined}
    />
  );
}

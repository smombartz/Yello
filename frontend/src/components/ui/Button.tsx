import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Icon } from '../Icon';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
type ButtonSize = 'md' | 'sm' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual role. One `primary` per view; `secondary` is the default. */
  variant?: ButtonVariant;
  /** `sm` is the compact density (13px label, 12px padding) for dense rows
   *  and toolbars. Height stays at `--ds-control-height` either way. `lg`
   *  (48px) is for front doors only; the landing page uses it today. */
  size?: ButtonSize;
  /** Optional leading Font Awesome (solid) icon name */
  icon?: string;
  /** Busy state: swaps the icon for a spinner, disables the button and sets aria-busy */
  loading?: boolean;
  /** React 19 passes ref as a plain prop; it lands on the <button> */
  ref?: Ref<HTMLButtonElement>;
  children?: ReactNode;
}

/**
 * Canonical button. Renders `.btn .btn--{variant}` built on `--ds-btn-*` tokens.
 * Prefer this over ad-hoc button classes.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  type = 'button',
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, size === 'md' ? '' : `btn--${size}`, className]
    .filter(Boolean)
    .join(' ');
  const iconName = loading ? 'arrows-rotate' : icon;
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {iconName && <Icon name={iconName} className={loading ? 'spinning' : undefined} />}
      {children}
    </button>
  );
}

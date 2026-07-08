import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from '../Icon';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Optional leading Font Awesome icon name */
  icon?: string;
  children?: ReactNode;
}

/**
 * Canonical button. Renders `.btn .btn--{variant}` built on `--ds-btn-*` tokens.
 * Prefer this over ad-hoc button classes.
 */
export function Button({
  variant = 'secondary',
  icon,
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

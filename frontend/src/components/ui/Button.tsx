import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Button as AntButton } from 'antd';
import type { ButtonProps as AntButtonProps } from 'antd';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
type ButtonSize = 'md' | 'sm' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'type'> {
  /** Visual role. One `primary` per view; `secondary` is the default. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional leading icon (a Tabler icon, see IconName) */
  icon?: IconName;
  /** Busy state: Ant shows its spinner and blocks clicks */
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  /** Renders an <a> (full page load or download). In-app routes use onClick + navigate. */
  href?: string;
  download?: boolean | string;
  ref?: Ref<HTMLButtonElement | HTMLAnchorElement>;
  children?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, Pick<AntButtonProps, 'type' | 'danger'>> = {
  primary: { type: 'primary' },
  secondary: { type: 'default' },
  danger: { type: 'primary', danger: true },
  ghost: { type: 'text' },
  icon: { type: 'text' },
};

const SIZES: Record<ButtonSize, AntButtonProps['size']> = { sm: 'small', md: 'middle', lg: 'large' };

/**
 * Canonical button: Ant's Button behind the app's variant/size vocabulary.
 * Prefer this over ad-hoc button classes.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  type = 'button',
  ref,
  children,
  ...rest
}: ButtonProps) {
  return (
    <AntButton
      {...VARIANTS[variant]}
      {...rest}
      ref={ref}
      htmlType={type}
      size={SIZES[size]}
      icon={icon ? <Icon name={icon} /> : undefined}
      loading={loading}
    >
      {children}
    </AntButton>
  );
}

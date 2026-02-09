interface IconProps {
  name: string;
  className?: string;
  style?: 'solid' | 'regular' | 'brands';
}

export function Icon({ name, className = '', style = 'solid' }: IconProps) {
  const prefix = style === 'brands' ? 'fa-brands' : style === 'regular' ? 'fa-regular' : 'fa-solid';
  return <i className={`${prefix} fa-${name} ${className}`.trim()} />;
}

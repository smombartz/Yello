import { Icon } from './Icon';

interface AvatarProps {
  photoUrl: string | null;
  name: string;
  size?: number;
  className?: string;
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 45%)`;
}

export function Avatar({
  photoUrl,
  name,
  size = 48,
  className = '',
  selectable = false,
  isSelected = false,
  onToggleSelect,
}: AvatarProps) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: size * 0.4,
    backgroundColor: stringToColor(name),
  };

  const avatarEl = photoUrl ? (
    <div className={`avatar ${className}`} style={style}>
      <img
        src={photoUrl}
        alt={name}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          e.currentTarget.parentElement!.textContent = getInitials(name);
        }}
      />
    </div>
  ) : (
    <div className={`avatar ${className}`} style={style}>
      {getInitials(name)}
    </div>
  );

  if (!selectable) {
    return avatarEl;
  }

  return (
    <div
      className={`avatar-wrapper ${isSelected ? 'selected' : ''}`}
      onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
      role="checkbox"
      aria-checked={isSelected}
      aria-label={isSelected ? 'Deselect contact' : 'Select contact'}
    >
      {avatarEl}
      <span className="avatar-select-badge">
        <Icon name="circle-check" />
      </span>
    </div>
  );
}

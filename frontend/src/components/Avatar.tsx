import { useState } from 'react';
import { Icon } from './Icon';
import type { ContactKind } from '../api/types';

interface AvatarProps {
  photoUrl: string | null;
  name: string;
  size?: number;
  className?: string;
  /** With no photo, companies show a building and generic contacts a card instead of initials */
  kind?: ContactKind;
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
  kind = 'person',
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

  // A photo that fails to load falls back to the placeholder, until the URL changes
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPhoto = !!photoUrl && photoUrl !== failedUrl;

  const avatarEl = (
    <div className={`avatar${kind !== 'person' && !showPhoto ? ' avatar-icon' : ''} ${className}`} style={style}>
      {showPhoto ? (
        <img src={photoUrl} alt={name} onError={() => setFailedUrl(photoUrl)} />
      ) : kind === 'company' ? (
        <Icon name="building" />
      ) : kind === 'generic' ? (
        <Icon name="address-card" />
      ) : (
        getInitials(name)
      )}
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

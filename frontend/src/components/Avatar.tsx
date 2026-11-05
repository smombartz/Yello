import { useMemo } from 'react';
import { Avatar as AntAvatar } from 'antd';
import { Icon } from './Icon';
import { stringToColor } from '../lib/avatarColor';
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
  const { background, initials } = useMemo(
    () => ({ background: stringToColor(name), initials: getInitials(name) }),
    [name],
  );
  const showInitials = kind === 'person';

  // Ant falls back to the icon when the photo fails, and retries when the URL changes.
  // Initials go through Ant's `icon` branch, not its text branch: the text branch renders an
  // opacity:0 span until a post-paint effect runs, then mounts a ResizeObserver, so fresh rows in
  // the virtual list could flash a blank circle. The icon branch renders synchronously. Ant sizes
  // text at 18px, so the font size is set per instance (the 0.4 ratio the old avatar used).
  const avatarEl = (
    <AntAvatar
      className={`yello-avatar ${className}`}
      size={size}
      src={photoUrl || undefined}
      alt={name}
      style={showInitials ? { backgroundColor: background, fontSize: size * 0.4 } : { backgroundColor: background }}
      icon={kind === 'company' ? <Icon name="building" /> : kind === 'generic' ? <Icon name="address-card" /> : <span>{initials}</span>}
    />
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

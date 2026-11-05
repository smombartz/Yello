import { useMemo } from 'react';
import { Avatar as AntAvatar } from 'antd';
import { presetPalettes } from '@ant-design/colors';
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

// Hues for the hashed colour. Yellow, lime and gold are too light for white initials, and
// orange is borderline, so they are left out. Order is fixed: it decides which name gets which colour.
const AVATAR_HUES = ['red', 'volcano', 'green', 'cyan', 'blue', 'geekblue', 'purple', 'magenta'] as const;
// Shade 6 is each preset's primary colour
const AVATAR_COLORS = AVATAR_HUES.map((hue) => presetPalettes[hue][6]);

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
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
  const background = useMemo(() => stringToColor(name), [name]);

  // Ant falls back to the icon or initials when the photo fails, and retries when the URL changes
  const avatarEl = (
    <AntAvatar
      className={`yello-avatar ${className}`}
      size={size}
      src={photoUrl || undefined}
      alt={name}
      style={{ backgroundColor: background }}
      icon={kind === 'company' ? <Icon name="building" /> : kind === 'generic' ? <Icon name="address-card" /> : undefined}
    >
      {getInitials(name)}
    </AntAvatar>
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

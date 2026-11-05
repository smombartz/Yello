import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Avatar } from 'antd';
import { useAuth } from '../hooks/useAuth';
import { stringToColor } from '../lib/avatarColor';

interface UserAvatarProps {
  /** Diameter in px (pass a token, e.g. token.controlHeight) */
  size: number;
  className?: string;
  style?: CSSProperties;
}

/** The signed-in user's photo (Ant Avatar), or their initials when there is none or it fails to load. */
export function UserAvatar({ size, className, style }: UserAvatarProps) {
  const { user } = useAuth();
  const [avatarError, setAvatarError] = useState(false);

  const displayName = user?.name || 'User';
  const primaryImage = user?.profileImages?.find(img => img.isPrimary);
  const avatarUrl = primaryImage?.url || user?.avatarUrl;
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  // Our own <img>: Ant's would drop referrerPolicy, and Google photos need no-referrer
  const photo = avatarUrl && !avatarError ? (
    <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setAvatarError(true)} />
  ) : undefined;

  return (
    <Avatar size={size} src={photo} className={className} style={{ backgroundColor: stringToColor(displayName), ...style }} aria-hidden="true">
      {initials}
    </Avatar>
  );
}

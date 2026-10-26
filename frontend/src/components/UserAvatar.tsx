import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

interface UserAvatarProps {
  imgClassName: string;
  initialsClassName: string;
}

/** The signed-in user's photo, or their initials when there is none (or it fails to load). */
export function UserAvatar({ imgClassName, initialsClassName }: UserAvatarProps) {
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

  return avatarUrl && !avatarError ? (
    <img
      src={avatarUrl}
      alt=""
      className={imgClassName}
      referrerPolicy="no-referrer"
      onError={() => setAvatarError(true)}
    />
  ) : (
    <div className={initialsClassName} aria-hidden="true">{initials}</div>
  );
}

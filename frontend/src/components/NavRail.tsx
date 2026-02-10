import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Icon } from './Icon';

interface NavRailItemProps {
  to: string;
  icon: string;
  label: string;
}

function NavRailItem({ to, icon, label }: NavRailItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-rail-item ${isActive ? 'active' : ''}`}
    >
      <Icon name={icon} />
      <span className="nav-rail-label">{label}</span>
    </NavLink>
  );
}

export function NavRail() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const displayName = user?.name || 'User';
  const primaryImage = user?.profileImages?.find(img => img.isPrimary);
  const avatarUrl = primaryImage?.url || user?.avatarUrl;
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <nav className="nav-rail">
      <NavRailItem to="/dashboard" icon="house" label="Dashboard" />
      <NavRailItem to="/contacts" icon="address-book" label="Contacts" />
      <NavRailItem to="/map" icon="map" label="Map" />
      <NavRailItem to="/groups" icon="users" label="Groups" />
      <NavRailItem to="/settings" icon="screwdriver-wrench" label="Tools" />

      <button
        type="button"
        className="nav-rail-item nav-rail-avatar-btn"
        onClick={() => navigate('/profile')}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="nav-rail-avatar-img"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="nav-rail-avatar-initials">{initials}</div>
        )}
        <span className="nav-rail-label">{displayName}</span>
      </button>
    </nav>
  );
}

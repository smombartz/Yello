import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Icon } from './Icon';
import { UserAvatar } from './UserAvatar';
import { isAdmin } from '../lib/admin';

interface NavRailItemProps {
  to: string;
  icon: string;
  label: string;
  end?: boolean;
}

function NavRailItem({ to, icon, label, end }: NavRailItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
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

  return (
    <nav className="nav-rail">
      <NavRailItem to="/dashboard" icon="house" label="Dashboard" />
      <NavRailItem to="/contacts" icon="address-book" label="Contacts" />
      <NavRailItem to="/map" icon="map" label="Map" />
      <NavRailItem to="/groups" icon="users" label="Groups" />
      <NavRailItem to="/tools" icon="screwdriver-wrench" label="Tools" />

      {isAdmin(user) && (
        <>
          <NavRailItem to="/admin" icon="shield-halved" label="Admin" end />
          <NavRailItem to="/admin/docs" icon="book" label="Docs" />
          <NavRailItem to="/styleguide" icon="swatchbook" label="Style guide" />
        </>
      )}

      <button
        type="button"
        className="nav-rail-item nav-rail-avatar-btn"
        onClick={() => navigate('/profile')}
        aria-label={displayName}
      >
        <UserAvatar imgClassName="nav-rail-avatar-img" initialsClassName="nav-rail-avatar-initials" />
        <span className="nav-rail-label">{displayName}</span>
      </button>
    </nav>
  );
}

import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logoSvg from '../assets/logo.svg';

interface NavItemLinkProps {
  to: string;
  icon: string;
  label: string;
}

function NavItemLink({ to, icon, label }: NavItemLinkProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
    >
      <span className="material-symbols-outlined">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

interface NavItemProps {
  icon: string;
  label: string;
  onClick?: () => void;
}

function NavItem({ icon, label, onClick }: NavItemProps) {
  return (
    <div className="nav-item" onClick={onClick}>
      <span className="material-symbols-outlined">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

interface SidebarProps {
  currentView?: 'contacts' | 'merge' | 'cleanup' | 'archived' | 'groups' | 'map' | 'settings';
}

export function Sidebar({ currentView = 'contacts' }: SidebarProps) {
  const { user, logout, isLoggingOut } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = user?.name || 'User';
  const displayEmail = user?.email || 'Not signed in';
  // Use primary profile image if available, fall back to legacy avatarUrl
  const primaryImage = user?.profileImages?.find(img => img.isPrimary);
  const avatarUrl = primaryImage?.url || user?.avatarUrl;
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const handleProfileClick = () => {
    setShowUserMenu(false);
    navigate('/profile');
  };

  const handleSettingsClick = () => {
    setShowUserMenu(false);
    navigate('/settings');
  };

  const handleLogout = () => {
    setShowUserMenu(false);
    logout();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src={logoSvg} alt="Yellow" className="sidebar-logo-img" />
      </div>

      <nav className="sidebar-nav">
        <NavItem icon="dashboard" label="Dashboard" />
        <NavItemLink to="/contacts" icon="contacts" label="All Contacts" />
        <NavItem icon="star" label="Favorites" />
        <NavItemLink to="/map" icon="map" label="Map" />
        <NavItemLink to="/groups" icon="group" label="Groups" />
        <NavItemLink to="/archived" icon="archive" label="Archived" />
        <NavItemLink to="/merge" icon="merge" label="Merge" />
        <NavItemLink to="/cleanup" icon="cleaning_services" label="Cleanup" />

        <div className="nav-spacer" />
      </nav>

      <div className="sidebar-user-container" ref={menuRef}>
        <div
          className={`sidebar-user ${showUserMenu ? 'active' : ''}`}
          onClick={() => setShowUserMenu(!showUserMenu)}
        >
          <div className="sidebar-user-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} referrerPolicy="no-referrer" />
            ) : (
              initials
            )}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{displayName}</div>
            <div className="sidebar-user-email">{displayEmail}</div>
          </div>
          <span className="material-symbols-outlined sidebar-user-chevron">
            {showUserMenu ? 'expand_more' : 'chevron_right'}
          </span>
        </div>

        {showUserMenu && (
          <div className="sidebar-user-menu">
            <div
              className="sidebar-user-menu-item"
              onClick={handleProfileClick}
            >
              <span className="material-symbols-outlined">person</span>
              <span>Profile</span>
            </div>
            <div
              className={`sidebar-user-menu-item ${currentView === 'settings' ? 'active' : ''}`}
              onClick={handleSettingsClick}
            >
              <span className="material-symbols-outlined">settings</span>
              <span>Settings</span>
            </div>
            <div
              className={`sidebar-user-menu-item logout ${isLoggingOut ? 'disabled' : ''}`}
              onClick={isLoggingOut ? undefined : handleLogout}
            >
              <span className="material-symbols-outlined">logout</span>
              <span>{isLoggingOut ? 'Signing out...' : 'Sign out'}</span>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .sidebar-user-container {
          position: relative;
        }

        .sidebar-user {
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .sidebar-user:hover,
        .sidebar-user.active {
          background-color: rgba(255, 255, 255, 0.1);
        }

        .sidebar-user-chevron {
          margin-left: auto;
          font-size: 18px;
          opacity: 0.7;
        }

        .sidebar-user-menu {
          position: absolute;
          bottom: 100%;
          left: 8px;
          right: 8px;
          background: #2d3748;
          border-radius: 8px;
          padding: 4px;
          margin-bottom: 4px;
          box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
          z-index: 100;
        }

        .sidebar-user-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 6px;
          cursor: pointer;
          color: #e2e8f0;
          font-size: 14px;
          transition: background-color 0.2s;
        }

        .sidebar-user-menu-item:hover {
          background-color: rgba(255, 255, 255, 0.1);
        }

        .sidebar-user-menu-item.active {
          background-color: rgba(102, 126, 234, 0.3);
        }

        .sidebar-user-menu-item.logout {
          color: #fc8181;
        }

        .sidebar-user-menu-item.logout:hover {
          background-color: rgba(252, 129, 129, 0.15);
        }

        .sidebar-user-menu-item.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .sidebar-user-menu-item .material-symbols-outlined {
          font-size: 20px;
        }

        .sidebar-user-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
        }
      `}</style>
    </aside>
  );
}

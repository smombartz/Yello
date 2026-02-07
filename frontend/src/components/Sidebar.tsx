import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
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

interface SidebarProps {
  currentView?: 'dashboard' | 'contacts' | 'merge' | 'cleanup' | 'archived' | 'groups' | 'map' | 'settings';
}

export function Sidebar({ currentView = 'contacts' }: SidebarProps) {
  const { user, logout, isLoggingOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Tools routes for auto-expand and active state
  const toolsRoutes = ['/archived', '/merge', '/cleanup'];
  const isToolsRouteActive = toolsRoutes.some(route => location.pathname.startsWith(route));

  // Derive effective state: show menu if manually opened OR on a tools route
  const effectiveShowToolsMenu = showToolsMenu || isToolsRouteActive;

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
        <NavItemLink to="/dashboard" icon="dashboard" label="Dashboard" />
        <NavItemLink to="/contacts" icon="contacts" label="All Contacts" />
        <NavItemLink to="/map" icon="map" label="Map" />
        <NavItemLink to="/groups" icon="group" label="Groups" />

        <div className="nav-spacer" />

        <div className="tools-menu-container">
          <button
            type="button"
            className={`nav-item tools-menu-header ${isToolsRouteActive ? 'active' : ''}`}
            onClick={() => setShowToolsMenu(!showToolsMenu)}
            aria-expanded={effectiveShowToolsMenu}
            aria-controls="tools-submenu"
          >
            <span className="material-symbols-outlined">build_circle</span>
            <span>Tools</span>
            <span className={`material-symbols-outlined tools-chevron ${effectiveShowToolsMenu ? 'expanded' : ''}`}>
              expand_more
            </span>
          </button>
          {effectiveShowToolsMenu && (
            <div id="tools-submenu" className="tools-menu-items">
              <NavLink
                to="/archived"
                className={({ isActive }) => `nav-item tools-menu-item ${isActive ? 'active' : ''}`}
              >
                <span className="material-symbols-outlined">archive</span>
                <span>Archived</span>
              </NavLink>
              <NavLink
                to="/merge"
                className={({ isActive }) => `nav-item tools-menu-item ${isActive ? 'active' : ''}`}
              >
                <span className="material-symbols-outlined">merge</span>
                <span>Merge</span>
              </NavLink>
              <NavLink
                to="/cleanup"
                className={({ isActive }) => `nav-item tools-menu-item ${isActive ? 'active' : ''}`}
              >
                <span className="material-symbols-outlined">cleaning_services</span>
                <span>Cleanup</span>
              </NavLink>
            </div>
          )}
        </div>
      </nav>

      <div className="sidebar-user-container" ref={menuRef}>
        <button
          type="button"
          className={`sidebar-user ${showUserMenu ? 'active' : ''}`}
          onClick={() => setShowUserMenu(!showUserMenu)}
          aria-expanded={showUserMenu}
          aria-haspopup="menu"
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
        </button>

        {showUserMenu && (
          <div className="sidebar-user-menu" role="menu">
            <button
              type="button"
              className="sidebar-user-menu-item"
              onClick={handleProfileClick}
              role="menuitem"
            >
              <span className="material-symbols-outlined">person</span>
              <span>Profile</span>
            </button>
            <button
              type="button"
              className={`sidebar-user-menu-item ${currentView === 'settings' ? 'active' : ''}`}
              onClick={handleSettingsClick}
              role="menuitem"
            >
              <span className="material-symbols-outlined">settings</span>
              <span>Settings</span>
            </button>
            <button
              type="button"
              className={`sidebar-user-menu-item logout ${isLoggingOut ? 'disabled' : ''}`}
              onClick={isLoggingOut ? undefined : handleLogout}
              disabled={isLoggingOut}
              role="menuitem"
            >
              <span className="material-symbols-outlined">logout</span>
              <span>{isLoggingOut ? 'Signing out...' : 'Sign out'}</span>
            </button>
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
          background: none;
          border: none;
          width: 100%;
          text-align: left;
          font: inherit;
          color: inherit;
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
          background: var(--ds-text-primary);
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
          color: var(--ds-bg-tertiary);
          font-size: 14px;
          transition: background-color 0.2s;
          background: none;
          border: none;
          width: 100%;
          text-align: left;
          font: inherit;
        }

        .sidebar-user-menu-item:hover {
          background-color: rgba(255, 255, 255, 0.1);
        }

        .sidebar-user-menu-item.active {
          background-color: rgba(102, 126, 234, 0.3);
        }

        .sidebar-user-menu-item.logout {
          color: var(--ds-color-error);
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

        /* Tools Menu Styles */
        .tools-menu-container {
          display: flex;
          flex-direction: column;
        }

        button.tools-menu-header {
          background: none;
          border: none;
          width: 100%;
          text-align: left;
          font: inherit;
          cursor: pointer;
        }

        .tools-menu-header .tools-chevron {
          margin-left: auto;
          font-size: 18px;
          opacity: 0.7;
          transition: transform 0.2s ease;
        }

        .tools-menu-header .tools-chevron.expanded {
          transform: rotate(180deg);
        }

        .tools-menu-items {
          display: flex;
          flex-direction: column;
        }

        .tools-menu-item {
          padding-left: 32px !important;
        }

        .tools-menu-item .material-symbols-outlined {
          font-size: 20px;
        }
      `}</style>
    </aside>
  );
}

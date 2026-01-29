import { useUserSettings } from '../api/settingsHooks';

interface NavItemProps {
  icon: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function NavItem({ icon, label, active, onClick }: NavItemProps) {
  return (
    <div className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="material-symbols-outlined">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

interface SidebarProps {
  onDeduplicateClick?: () => void;
  onCleanupClick?: () => void;
  onArchivedClick?: () => void;
  onGroupsClick?: () => void;
  onMapClick?: () => void;
  onSettingsClick?: () => void;
  onBackToContacts?: () => void;
  currentView?: 'contacts' | 'deduplication' | 'cleanup' | 'archived' | 'groups' | 'map' | 'settings';
}

export function Sidebar({ onDeduplicateClick, onCleanupClick, onArchivedClick, onGroupsClick, onMapClick, onSettingsClick, onBackToContacts, currentView = 'contacts' }: SidebarProps) {
  const { data: userSettings } = useUserSettings();

  const displayName = userSettings?.name || 'User';
  const displayEmail = userSettings?.email || 'Set up your profile';
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="material-symbols-outlined">3p</span>
        <span>ello CRM</span>
      </div>

      <nav className="sidebar-nav">
        <NavItem icon="dashboard" label="Dashboard" />
        <NavItem icon="contacts" label="All Contacts" active={currentView === 'contacts'} onClick={onBackToContacts} />
        <NavItem icon="star" label="Favorites" />
        <NavItem icon="map" label="Map" active={currentView === 'map'} onClick={onMapClick} />
        <NavItem icon="group" label="Groups" active={currentView === 'groups'} onClick={onGroupsClick} />
        <NavItem icon="archive" label="Archived" active={currentView === 'archived'} onClick={onArchivedClick} />
        <NavItem icon="merge" label="Merge" active={currentView === 'deduplication'} onClick={onDeduplicateClick} />
        <NavItem icon="cleaning_services" label="Cleanup" active={currentView === 'cleanup'} onClick={onCleanupClick} />

        <div className="nav-spacer" />

        <NavItem icon="settings" label="Settings" active={currentView === 'settings'} onClick={onSettingsClick} />
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-avatar">
          {userSettings?.avatarUrl ? (
            <img src={userSettings.avatarUrl} alt={displayName} />
          ) : (
            initials
          )}
        </div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{displayName}</div>
          <div className="sidebar-user-email">{displayEmail}</div>
        </div>
      </div>
    </aside>
  );
}

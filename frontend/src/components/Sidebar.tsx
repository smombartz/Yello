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
  onBackToContacts?: () => void;
  currentView?: 'contacts' | 'deduplication' | 'cleanup' | 'archived' | 'groups';
}

export function Sidebar({ onDeduplicateClick, onCleanupClick, onArchivedClick, onGroupsClick, onBackToContacts, currentView = 'contacts' }: SidebarProps) {
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
        <NavItem icon="group" label="Groups" active={currentView === 'groups'} onClick={onGroupsClick} />
        <NavItem icon="archive" label="Archived" active={currentView === 'archived'} onClick={onArchivedClick} />
        <NavItem icon="merge" label="Merge" active={currentView === 'deduplication'} onClick={onDeduplicateClick} />
        <NavItem icon="cleaning_services" label="Cleanup" active={currentView === 'cleanup'} onClick={onCleanupClick} />

        <div className="nav-spacer" />

        <NavItem icon="settings" label="Settings" />
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-avatar">JD</div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">John Doe</div>
          <div className="sidebar-user-email">john@example.com</div>
        </div>
      </div>
    </aside>
  );
}

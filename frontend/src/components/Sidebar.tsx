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

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="material-symbols-outlined">contacts_product</span>
        <span>Directory</span>
      </div>

      <nav className="sidebar-nav">
        <NavItem icon="dashboard" label="Dashboard" />
        <NavItem icon="contacts" label="All Contacts" active />
        <NavItem icon="star" label="Favorites" />
        <NavItem icon="group" label="Groups" />
        <NavItem icon="archive" label="Archived" />

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

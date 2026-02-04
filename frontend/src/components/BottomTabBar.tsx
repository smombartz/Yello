import { NavLink, useNavigate } from 'react-router-dom';

interface TabItemProps {
  to: string;
  icon: string;
  label: string;
}

function TabItem({ to, icon, label }: TabItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}
    >
      <span className="material-symbols-outlined">{icon}</span>
      <span className="tab-label">{label}</span>
    </NavLink>
  );
}

export function BottomTabBar() {
  const navigate = useNavigate();

  const handleAddContact = () => {
    navigate('/contacts/new');
  };

  return (
    <nav className="bottom-tab-bar">
      <TabItem to="/contacts" icon="contacts" label="Contacts" />
      <TabItem to="/map" icon="map" label="Map" />

      <button className="tab-add-button" onClick={handleAddContact} aria-label="Add contact">
        <span className="material-symbols-outlined">add</span>
      </button>

      <TabItem to="/groups" icon="group" label="Groups" />
      <TabItem to="/settings" icon="settings" label="Settings" />
    </nav>
  );
}

import { NavLink, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

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
      <Icon name={icon} />
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
      <TabItem to="/contacts" icon="address-book" label="Contacts" />
      <TabItem to="/map" icon="map" label="Map" />

      <button className="tab-add-button" onClick={handleAddContact} aria-label="Add contact">
        <Icon name="plus" />
      </button>

      <TabItem to="/groups" icon="users" label="Groups" />
      <TabItem to="/settings" icon="gear" label="Settings" />
    </nav>
  );
}

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Flex, Layout, Menu, Tooltip, theme } from 'antd';
import type { MenuProps } from 'antd';
import { useAuth } from '../hooks/useAuth';
import { Icon, type IconName } from './Icon';
import { UserAvatar } from './UserAvatar';
import { isAdmin } from '../lib/admin';

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
  /** Active only on this exact path, not on the paths below it (NavLink's `end`) */
  end?: boolean;
}

const MAIN_ITEMS: NavItem[] = [
  { to: '/dashboard', icon: 'house', label: 'Dashboard' },
  { to: '/contacts', icon: 'address-book', label: 'Contacts' },
  { to: '/map', icon: 'map', label: 'Map' },
  { to: '/groups', icon: 'users', label: 'Groups' },
  { to: '/tools', icon: 'screwdriver-wrench', label: 'Tools' },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: '/admin', icon: 'shield-halved', label: 'Admin', end: true },
  { to: '/admin/docs', icon: 'book', label: 'Docs' },
  { to: '/styleguide', icon: 'swatchbook', label: 'Style guide' },
];

/** NavLink's matching: the path itself, or (without `end`) any path below it */
function isActive(pathname: string, { to, end }: NavItem) {
  return pathname === to || (!end && pathname.startsWith(`${to}/`));
}

// The label is a real link: Ant stretches a Menu item's <a> over the whole item, so
// a click anywhere on it (middle-click and the context menu too) follows the link.
// It's out of the tab order because the Menu does the keyboard: Tab to the menu,
// arrow keys between items, Enter (handled in onClick below).
const toMenuItem = (item: NavItem) => ({
  key: item.to,
  icon: <Icon name={item.icon} />,
  label: <Link to={item.to} tabIndex={-1}>{item.label}</Link>,
});

/** Desktop side navigation: a collapsed Ant Sider with an icon Menu; labels show as tooltips. */
export function NavRail() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const displayName = user?.name || 'User';

  const navItems = isAdmin(user) ? [...MAIN_ITEMS, ...ADMIN_ITEMS] : MAIN_ITEMS;
  const items: MenuProps['items'] = isAdmin(user)
    ? [...MAIN_ITEMS.map(toMenuItem), { type: 'divider' }, ...ADMIN_ITEMS.map(toMenuItem)]
    : MAIN_ITEMS.map(toMenuItem);
  const selectedKeys = navItems.filter((item) => isActive(pathname, item)).map((item) => item.to);

  // Mouse clicks land on the item's link, which navigates; the keyboard's Enter lands here
  const handleClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    if (domEvent.type === 'keydown') navigate(key);
  };

  return (
    <Layout.Sider
      collapsed
      theme="light"
      style={{
        // Fixed below the header; the window scrolls, the rail stays
        position: 'fixed',
        insetInlineStart: 0,
        top: 'var(--ds-header-height)',
        bottom: 0,
        overflowY: 'auto',
        zIndex: 'var(--ds-z-fixed)',
      }}
    >
      <Flex vertical justify="space-between" style={{ height: '100%', paddingBlock: token.paddingXS }}>
        <nav aria-label="Main">
          <Menu
            mode="inline"
            items={items}
            selectedKeys={selectedKeys}
            onClick={handleClick}
            // The rail floats on the page: no divider line along its edge
            style={{ borderInlineEnd: 0 }}
          />
        </nav>

        <Flex justify="center">
          <Tooltip title={displayName} placement="right">
            <Button
              type="text"
              shape="circle"
              size="large"
              aria-label={displayName}
              icon={<UserAvatar size={token.controlHeightSM} />}
              onClick={() => navigate('/profile')}
            />
          </Tooltip>
        </Flex>
      </Flex>
    </Layout.Sider>
  );
}

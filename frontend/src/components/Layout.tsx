import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { Layout as AntLayout, theme } from 'antd';
import { NavRail } from './NavRail';
import { PageHeader, type Breadcrumb } from './PageHeader';
import { BottomTabBar } from './BottomTabBar';
import { ImportStatusIndicator } from './ImportStatusIndicator';
import { useIsMobile } from '../hooks/useIsMobile';
import { useDesktopMessageSync } from '../hooks/useDesktopMessageSync';
import { useAuth } from '../hooks/useAuth';
import { isAdmin } from '../lib/admin';
import { getDesktopServer } from '../lib/desktopServer';
import { shellCssVars } from '../theme/shellMetrics';
import type { CSSProperties, ReactNode } from 'react';

export interface PageHeaderConfig {
  title: string;
  breadcrumbs?: Breadcrumb[];
  search?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: () => void;
  searchPlaceholder?: string;
  /** Beside the search field, at the end of its row (phones: the sort & filter button) */
  searchAccessory?: ReactNode;
  info?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export interface OutletContext {
  setModalOpen: (open: boolean) => void;
  setHeaderConfig: (config: PageHeaderConfig) => void;
  isMobile: boolean;
}

const DESKTOP_ONLY_ROUTES = ['/merge', '/cleanup', '/archived'];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const isMobile = useIsMobile();
  const [modalOpen, setModalOpen] = useState(false);
  const [headerConfig, setHeaderConfig] = useState<PageHeaderConfig>({ title: '' });
  const headerConfigRef = useRef(headerConfig);
  headerConfigRef.current = headerConfig;
  const { token } = theme.useToken();
  const hasSearch = headerConfig.onSearchChange !== undefined;

  // The shell's geometry as CSS variables on <html>: page CSS uses them for sticky
  // offsets and viewport-height calculations (see theme/shellMetrics.ts). Removed when
  // the shell unmounts, so pages outside it get design-system.css's defaults.
  useLayoutEffect(() => {
    const vars = shellCssVars(token, isMobile, hasSearch);
    const root = document.documentElement.style;
    for (const [name, value] of Object.entries(vars)) root.setProperty(name, value);
    return () => {
      for (const name of Object.keys(vars)) root.removeProperty(name);
    };
  }, [token, isMobile, hasSearch]);

  // Desktop app: keep iMessage/WhatsApp counts for Top contacts fresh
  useDesktopMessageSync(true);

  // Desktop app: the admin gets the Server menu (Railway / Local) from now on
  const { user } = useAuth();
  const userIsAdmin = isAdmin(user);
  useEffect(() => {
    if (userIsAdmin) void getDesktopServer()?.markAdmin().catch(() => {});
  }, [userIsAdmin]);

  // A new page starts at the top. The browser keeps the window's scroll
  // position across in-app navigation, so without this a page opened from a
  // scrolled list (Contacts, Tools) starts scrolled down, its top hidden under
  // the fixed header. Back/Forward (POP) keeps the browser's own behavior.
  useLayoutEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0);
  }, [location.pathname, navigationType]);

  // Redirect mobile users away from desktop-only routes
  useEffect(() => {
    if (isMobile && DESKTOP_ONLY_ROUTES.includes(location.pathname)) {
      navigate('/contacts', { replace: true });
    }
  }, [isMobile, location.pathname, navigate]);

  // Listen for modal state changes from child components
  useEffect(() => {
    const handleModalChange = (e: CustomEvent<{ open: boolean }>) => {
      setModalOpen(e.detail.open);
    };
    window.addEventListener('layout-modal-change', handleModalChange as EventListener);
    return () => window.removeEventListener('layout-modal-change', handleModalChange as EventListener);
  }, []);

  // Escape key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modalOpen && location.pathname !== '/contacts') {
        navigate('/contacts');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, location.pathname, navigate]);

  const handleSetModalOpen = useCallback((open: boolean) => {
    setModalOpen(open);
  }, []);

  const handleSetHeaderConfig = useCallback((config: PageHeaderConfig) => {
    setHeaderConfig(config);
  }, []);

  // The content column: the content width, centred on the window and clear of the fixed
  // rail on both sides; the map takes the full width. Phones pad it to the safe areas and
  // clear the bottom tab bar. No `position`: ContactList measures its offsetTop against <body>.
  const fullBleed = location.pathname === '/map';
  const contentStyle: CSSProperties = isMobile ? {
    flex: '1 1 100%',
    maxWidth: '100%',
    paddingBlock: '0 var(--ds-tab-bar-height)',
    paddingInline: `max(${token.padding}px, env(safe-area-inset-left)) max(${token.padding}px, env(safe-area-inset-right))`,
  } : {
    flex: fullBleed ? '0 1 100%' : '0 1 var(--ds-content-width)',
    maxWidth: fullBleed ? '100%' : 'calc(100% - 2 * var(--ds-nav-rail-width))',
  };

  // The window scrolls (pages and virtual lists rely on it): the header and rail are fixed,
  // and the body row is padded below the header.
  return (
    <AntLayout style={{ minHeight: '100vh', background: token.colorBgContainer }}>
      <PageHeader {...headerConfig} />
      <AntLayout
        style={{ flex: 1, flexDirection: 'row', paddingTop: 'var(--ds-header-height)', background: 'transparent' }}
      >
        {!isMobile && <NavRail />}
        <AntLayout.Content
          style={{ display: 'flex', flexDirection: 'column', minWidth: 0, marginInline: 'auto', ...contentStyle }}
        >
          <Outlet context={{ setModalOpen: handleSetModalOpen, setHeaderConfig: handleSetHeaderConfig, isMobile } satisfies OutletContext} />
        </AntLayout.Content>
      </AntLayout>
      {isMobile && <BottomTabBar />}
      <ImportStatusIndicator />
    </AntLayout>
  );
}

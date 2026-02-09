import { useEffect, useState, useCallback, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NavRail } from './NavRail';
import { PageHeader } from './PageHeader';
import { BottomTabBar } from './BottomTabBar';
import { useIsMobile } from '../hooks/useIsMobile';
import type { ReactNode } from 'react';

export interface PageHeaderConfig {
  title: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
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
  const isMobile = useIsMobile();
  const [modalOpen, setModalOpen] = useState(false);
  const [headerConfig, setHeaderConfig] = useState<PageHeaderConfig>({ title: '' });
  const headerConfigRef = useRef(headerConfig);
  headerConfigRef.current = headerConfig;

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

  return (
    <div className="app-layout">
      <PageHeader {...headerConfig} />
      <div className="app-body">
        {!isMobile && <NavRail />}
        <main className="main-content">
          <Outlet context={{ setModalOpen: handleSetModalOpen, setHeaderConfig: handleSetHeaderConfig, isMobile } satisfies OutletContext} />
        </main>
        {!isMobile && <div className="app-body-spacer" />}
      </div>
      {isMobile && <BottomTabBar />}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';

type AppView = 'contacts' | 'merge' | 'cleanup' | 'archived' | 'groups' | 'map' | 'settings';

const pathToView: Record<string, AppView> = {
  '/contacts': 'contacts',
  '/merge': 'merge',
  '/cleanup': 'cleanup',
  '/archived': 'archived',
  '/groups': 'groups',
  '/map': 'map',
  '/settings': 'settings',
};

const viewToLayoutClass: Record<AppView, string> = {
  contacts: 'app-layout',
  merge: 'app-layout dedup-layout',
  cleanup: 'app-layout cleanup-layout',
  archived: 'app-layout archived-layout',
  groups: 'app-layout groups-layout',
  map: 'app-layout map-layout',
  settings: 'app-layout settings-layout',
};

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);

  const currentView = pathToView[location.pathname] || 'contacts';
  const layoutClass = viewToLayoutClass[currentView];

  // Listen for modal state changes from child components
  useEffect(() => {
    const handleModalChange = (e: CustomEvent<{ open: boolean }>) => {
      setModalOpen(e.detail.open);
    };
    window.addEventListener('layout-modal-change', handleModalChange as EventListener);
    return () => window.removeEventListener('layout-modal-change', handleModalChange as EventListener);
  }, []);

  // Escape key navigation - navigate to home unless a modal is open
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

  return (
    <div className={layoutClass}>
      <Sidebar currentView={currentView} />
      <main className="main-content">
        <Outlet context={{ setModalOpen: handleSetModalOpen }} />
      </main>
    </div>
  );
}

// Hook for child components to signal modal state
export function useLayoutModal() {
  return {
    setModalOpen: (open: boolean) => {
      window.dispatchEvent(new CustomEvent('layout-modal-change', { detail: { open } }));
    }
  };
}

import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { ContactList } from './components/ContactList';
import { ImportModal } from './components/ImportModal';
import { DeduplicationView } from './components/DeduplicationView';
import { CleanupView } from './components/CleanupView';
import { ArchivedView } from './components/ArchivedView';
import { GroupsView } from './components/GroupsView';
import { MapView } from './components/MapView';
import { SettingsView } from './components/SettingsView';
import { LoginPage } from './components/LoginPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';

type AppView = 'contacts' | 'deduplication' | 'cleanup' | 'archived' | 'groups' | 'map' | 'settings';

function AppContent() {
  const [currentView, setCurrentView] = useState<AppView>('contacts');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showImportModal) {
          setShowImportModal(false);
        } else if (currentView === 'deduplication' || currentView === 'cleanup' || currentView === 'archived' || currentView === 'groups' || currentView === 'map' || currentView === 'settings') {
          setCurrentView('contacts');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showImportModal, currentView]);

  const handleDeduplicateClick = () => {
    setCurrentView('deduplication');
  };

  const handleCleanupClick = () => {
    setCurrentView('cleanup');
  };

  const handleArchivedClick = () => {
    setCurrentView('archived');
  };

  const handleGroupsClick = () => {
    setCurrentView('groups');
  };

  const handleMapClick = () => {
    setCurrentView('map');
  };

  const handleSettingsClick = () => {
    setCurrentView('settings');
  };

  const handleBackToContacts = () => {
    setCurrentView('contacts');
  };

  if (currentView === 'map') {
    return (
      <div className="app-layout map-layout">
        <Sidebar
          onDeduplicateClick={handleDeduplicateClick}
          onCleanupClick={handleCleanupClick}
          onArchivedClick={handleArchivedClick}
          onGroupsClick={handleGroupsClick}
          onMapClick={handleMapClick}
          onSettingsClick={handleSettingsClick}
          onBackToContacts={handleBackToContacts}
          currentView="map"
        />
        <main className="main-content">
          <MapView onBack={handleBackToContacts} />
        </main>
      </div>
    );
  }

  if (currentView === 'groups') {
    return (
      <div className="app-layout groups-layout">
        <Sidebar
          onDeduplicateClick={handleDeduplicateClick}
          onCleanupClick={handleCleanupClick}
          onArchivedClick={handleArchivedClick}
          onGroupsClick={handleGroupsClick}
          onMapClick={handleMapClick}
          onSettingsClick={handleSettingsClick}
          onBackToContacts={handleBackToContacts}
          currentView="groups"
        />
        <main className="main-content">
          <GroupsView onBack={handleBackToContacts} />
        </main>
      </div>
    );
  }

  if (currentView === 'settings') {
    return (
      <div className="app-layout settings-layout">
        <Sidebar
          onDeduplicateClick={handleDeduplicateClick}
          onCleanupClick={handleCleanupClick}
          onArchivedClick={handleArchivedClick}
          onGroupsClick={handleGroupsClick}
          onMapClick={handleMapClick}
          onSettingsClick={handleSettingsClick}
          onBackToContacts={handleBackToContacts}
          currentView="settings"
        />
        <main className="main-content">
          <SettingsView onBack={handleBackToContacts} />
        </main>
      </div>
    );
  }

  if (currentView === 'archived') {
    return (
      <div className="app-layout archived-layout">
        <Sidebar
          onDeduplicateClick={handleDeduplicateClick}
          onCleanupClick={handleCleanupClick}
          onArchivedClick={handleArchivedClick}
          onGroupsClick={handleGroupsClick}
          onMapClick={handleMapClick}
          onSettingsClick={handleSettingsClick}
          onBackToContacts={handleBackToContacts}
          currentView="archived"
        />
        <main className="main-content">
          <ArchivedView onBack={handleBackToContacts} />
        </main>
      </div>
    );
  }

  if (currentView === 'cleanup') {
    return (
      <div className="app-layout cleanup-layout">
        <Sidebar
          onDeduplicateClick={handleDeduplicateClick}
          onCleanupClick={handleCleanupClick}
          onArchivedClick={handleArchivedClick}
          onGroupsClick={handleGroupsClick}
          onMapClick={handleMapClick}
          onSettingsClick={handleSettingsClick}
          onBackToContacts={handleBackToContacts}
          currentView="cleanup"
        />
        <main className="main-content">
          <CleanupView onBack={handleBackToContacts} />
        </main>
      </div>
    );
  }

  if (currentView === 'deduplication') {
    return (
      <div className="app-layout dedup-layout">
        <Sidebar
          onDeduplicateClick={handleDeduplicateClick}
          onCleanupClick={handleCleanupClick}
          onArchivedClick={handleArchivedClick}
          onGroupsClick={handleGroupsClick}
          onMapClick={handleMapClick}
          onSettingsClick={handleSettingsClick}
          onBackToContacts={handleBackToContacts}
          currentView="deduplication"
        />
        <main className="main-content">
          <DeduplicationView onBack={handleBackToContacts} />
        </main>
      </div>
    );
  }

  return (
    <>
      <div className="app-layout">
        <Sidebar
          onDeduplicateClick={handleDeduplicateClick}
          onCleanupClick={handleCleanupClick}
          onArchivedClick={handleArchivedClick}
          onGroupsClick={handleGroupsClick}
          onMapClick={handleMapClick}
          onSettingsClick={handleSettingsClick}
          currentView="contacts"
        />
        <main className="main-content">
          <TopHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onImportClick={() => setShowImportModal(true)}
          />
          <div className="page-content">
            <ContactList search={debouncedSearch} />
          </div>
        </main>
      </div>

      {showImportModal && (
        <ImportModal onClose={() => setShowImportModal(false)} />
      )}
    </>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-spinner" />
        <p>Loading...</p>
        <style>{`
          .auth-loading {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            background: #f7fafc;
          }
          .auth-loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #e2e8f0;
            border-top-color: #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          .auth-loading p {
            color: #718096;
            margin: 0;
          }
        `}</style>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Show main app if authenticated
  return <AppContent />;
}

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}

export default App;

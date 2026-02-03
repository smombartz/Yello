import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ContactsPage } from './components/ContactsPage';
import { DeduplicationView } from './components/DeduplicationView';
import { CleanupView } from './components/CleanupView';
import { ArchivedView } from './components/ArchivedView';
import { GroupsView } from './components/GroupsView';
import { MapView } from './components/MapView';
import { SettingsView } from './components/SettingsView';
import { LoginPage } from './components/LoginPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

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

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

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

  // If already authenticated, redirect to home
  if (isAuthenticated) {
    return <Navigate to="/contacts" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public route - Login */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      {/* Protected routes with Layout */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="merge" element={<DeduplicationView />} />
        <Route path="cleanup" element={<CleanupView />} />
        <Route path="archived" element={<ArchivedView />} />
        <Route path="groups" element={<GroupsView />} />
        <Route path="map" element={<MapView />} />
        <Route path="settings" element={<SettingsView />} />
      </Route>

      {/* Catch-all redirect to home */}
      <Route path="*" element={<Navigate to="/contacts" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;

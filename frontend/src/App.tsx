import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ContactsPage } from './components/ContactsPage';
import { ContactDetailPage } from './components/ContactDetailPage';
import { AddContactPage } from './components/AddContactPage';
import { DeduplicationView } from './components/DeduplicationView';
import { CleanupView } from './components/CleanupView';
import { ArchivedView } from './components/ArchivedView';
import { GroupsView } from './components/GroupsView';
import { MapView } from './components/MapView';
import { SettingsView } from './components/SettingsView';
import { EnrichView } from './components/EnrichView';
import { UserProfilePage } from './components/UserProfilePage';
import { DashboardView } from './components/DashboardView';
import { AdminView } from './components/AdminView';
import OnboardingView from './components/OnboardingView';
import { ICloudImportView } from './components/ICloudImportView';
import { LoginPage } from './components/LoginPage';
import { PublicContactCard } from './components/PublicContactCard';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { useAuth } from './hooks/useAuth';
import { DemoPromptModal } from './components/DemoPromptModal';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner fullscreen message="Loading..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isAuthenticated && user && user.hasOnboarded === false && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <>
      {children}
      <DemoPromptModal />
    </>
  );
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner fullscreen message="Loading..." />;
  }

  // If already authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public contact card - no auth required */}
      <Route path="/p/:slug" element={<PublicContactCard />} />

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
        <Route path="dashboard" element={<DashboardView />} />
        <Route path="contacts/new" element={<AddContactPage />} />
        <Route path="contacts/:id" element={<ContactDetailPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="merge" element={<DeduplicationView />} />
        <Route path="cleanup" element={<CleanupView />} />
        <Route path="archived" element={<ArchivedView />} />
        <Route path="groups" element={<GroupsView />} />
        <Route path="map" element={<MapView />} />
        <Route path="tools" element={<SettingsView />} />
        <Route path="enrich" element={<EnrichView />} />
        <Route path="profile" element={<UserProfilePage />} />
        <Route path="admin" element={<AdminView />} />
        <Route path="onboarding" element={<OnboardingView />} />
        <Route path="icloud-import" element={<ICloudImportView />} />
      </Route>

      {/* Catch-all redirect to dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;

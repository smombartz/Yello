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
import { UserProfilePage } from './components/UserProfilePage';
import { DashboardView } from './components/DashboardView';
import { WelcomeView } from './components/WelcomeView';
import { AdminView } from './components/AdminView';
import { DocsView } from './components/DocsView';
import { StyleGuideView } from './components/StyleGuideView';
import OnboardingView from './components/OnboardingView';
import { ICloudImportView } from './components/ICloudImportView';
import { LoginPage } from './components/LoginPage';
import { LandingPage } from './components/LandingPage';
import { PublicContactCard } from './components/PublicContactCard';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { ImportStatusProvider } from './contexts/ImportStatusProvider';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { useAuth } from './hooks/useAuth';
import { DemoPromptModal } from './components/DemoPromptModal';
import { isAdmin } from './lib/admin';

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

/** Admin-only pages. Runs inside ProtectedRoute, so the user is already signed in. */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!isAdmin(user)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
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

// The desktop app is a thin client of this deployment and keeps Electron's
// default user agent. It has no use for the marketing page.
const isDesktopApp = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');

/** `/`: the landing page for signed-out visitors, the dashboard for everyone else. */
function LandingRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isDesktopApp) {
    return <Navigate to="/login" replace />;
  }

  // Render nothing rather than a spinner: the auth check is quick, and a
  // spinner flashing before the landing page reads as a broken front door.
  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LandingPage />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public landing page - signed-out visitors only */}
      <Route path="/" element={<LandingRoute />} />

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
        <Route path="welcome" element={<WelcomeView />} />
        <Route path="contacts/new" element={<AddContactPage />} />
        <Route path="contacts/:id" element={<ContactDetailPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="merge" element={<DeduplicationView />} />
        <Route path="cleanup" element={<CleanupView />} />
        <Route path="archived" element={<ArchivedView />} />
        <Route path="groups" element={<GroupsView />} />
        <Route path="groups/:category" element={<GroupsView />} />
        <Route path="map" element={<MapView />} />
        <Route path="tools" element={<SettingsView />} />
        <Route path="profile" element={<UserProfilePage />} />
        <Route path="admin" element={<AdminRoute><AdminView /></AdminRoute>} />
        <Route path="admin/docs" element={<AdminRoute><DocsView /></AdminRoute>} />
        <Route path="styleguide" element={<AdminRoute><StyleGuideView /></AdminRoute>} />
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
        <ImportStatusProvider>
          <AppRoutes />
        </ImportStatusProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;

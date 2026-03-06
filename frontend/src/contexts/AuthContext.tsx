import { type ReactNode, useEffect, useRef } from 'react';
import { useCurrentUser, useLogout } from '../api/authHooks';
import { getGoogleLoginUrl } from '../api/client';
import { AuthContext, type AuthContextType } from './authContextValue';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { data, isLoading, error } = useCurrentUser();
  const logoutMutation = useLogout();
  const hasRefreshedEmails = useRef(false);

  // Auto-refresh email history for previously-synced contacts on login (skip for demo users)
  useEffect(() => {
    if (data?.isAuthenticated && !data?.user?.isDemo && !hasRefreshedEmails.current) {
      hasRefreshedEmails.current = true;
      fetch('/api/contacts/refresh-all', { method: 'POST', credentials: 'include' })
        .catch(() => { /* silent failure */ });
    }
  }, [data?.isAuthenticated, data?.user?.isDemo]);

  const login = () => {
    // Redirect to Google OAuth
    window.location.href = getGoogleLoginUrl();
  };

  const logout = () => {
    logoutMutation.mutate();
  };

  const value: AuthContextType = {
    user: data?.user ?? null,
    isAuthenticated: data?.isAuthenticated ?? false,
    isDemo: data?.user?.isDemo ?? false,
    isLoading,
    error: error as Error | null,
    login,
    logout,
    isLoggingOut: logoutMutation.isPending,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

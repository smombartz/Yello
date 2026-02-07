import type { ReactNode } from 'react';
import { useCurrentUser, useLogout } from '../api/authHooks';
import { getGoogleLoginUrl } from '../api/client';
import { AuthContext, type AuthContextType } from './authContextValue';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { data, isLoading, error } = useCurrentUser();
  const logoutMutation = useLogout();

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
    isLoading,
    error: error as Error | null,
    login,
    logout,
    isLoggingOut: logoutMutation.isPending,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

import { createContext, useContext, ReactNode } from 'react';
import { useCurrentUser, useLogout } from '../api/authHooks';
import type { User } from '../api/authHooks';
import { getGoogleLoginUrl } from '../api/client';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: Error | null;
  login: () => void;
  logout: () => void;
  isLoggingOut: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

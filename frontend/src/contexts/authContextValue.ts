import { createContext } from 'react';
import type { User } from '../api/authHooks';

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isDemo: boolean;
  isLoading: boolean;
  error: Error | null;
  login: () => void;
  logout: () => void;
  isLoggingOut: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

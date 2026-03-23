import { create } from 'zustand';
import { getToken, setToken, clearToken, getSessionId } from '@/lib/token';

export interface AuthUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  sessionId: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: getToken(),
  sessionId: getSessionId(),
  isAuthenticated: false,
  isLoading: true,

  login: (token: string, user: AuthUser) => {
    setToken(token);
    set({ token, user, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    clearToken();
    set({ token: null, user: null, isAuthenticated: false, isLoading: false });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },
}));

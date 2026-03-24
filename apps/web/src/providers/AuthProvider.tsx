import { createContext, useEffect, type ReactNode } from 'react';
import { useAuthStore, type AuthUser } from '@/stores/auth-store';
import { getToken, parseJwt } from '@/lib/token';

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, token: storeToken, isAuthenticated, isLoading, login, logout, setLoading } =
    useAuthStore();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    const payload = parseJwt(token);
    if (!payload) {
      logout();
      return;
    }

    // Check expiration
    const exp = payload.exp as number | undefined;
    if (exp && exp * 1000 < Date.now()) {
      logout();
      return;
    }

    const authUser: AuthUser = {
      id: (payload.sub as string) ?? '',
      name: (payload.name as string) || (payload.username as string) || 'User',
      avatarUrl: payload.avatarUrl as string | undefined,
    };

    login(token, authUser);
  }, [login, logout, setLoading]);

  return (
    <AuthContext.Provider
      value={{ user, token: storeToken, isAuthenticated, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

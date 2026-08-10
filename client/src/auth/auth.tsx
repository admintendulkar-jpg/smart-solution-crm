import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import type { User } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.me,
    queryFn: () => api.get<{ user: User }>('/auth/me'),
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      window.location.assign('/login');
    },
  });

  const logout = useCallback(() => logoutMutation.mutate(), [logoutMutation]);

  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
        <span className="spinner spinner-dark" style={{ width: 22, height: 22 }} />
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Loading workspace…</span>
      </div>
    );
  }

  const user = data?.user ?? null;

  return <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user), logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireRoles({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user || !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function isApiError401(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

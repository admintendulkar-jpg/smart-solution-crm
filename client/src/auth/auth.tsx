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
  const { data, isLoading, isError, failureCount } = useQuery({
    queryKey: QUERY_KEYS.me,
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000); // 12s timeout
      try {
        return await api.get<{ user: User }>('/auth/me');
      } finally {
        clearTimeout(timer);
      }
    },
    retry: 3,
    retryDelay: (attempt) => Math.min(2000 * attempt, 6000),
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
    const isSlowStart = failureCount > 0;
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
        <img src="/logo.png" alt="Smart Solution Agency" style={{ width: 52, height: 52, objectFit: 'contain', marginBottom: 4, opacity: 0.9 }} />
        <span className="spinner spinner-dark" style={{ width: 22, height: 22 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
          {isSlowStart ? 'Server is waking up…' : 'Loading workspace…'}
        </span>
        {isSlowStart && (
          <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', maxWidth: 260, textAlign: 'center', lineHeight: 1.5 }}>
            First load takes ~20 seconds. Please wait — your data is safe.
          </span>
        )}
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
        <img src="/logo.png" alt="Smart Solution Agency" style={{ width: 52, height: 52, objectFit: 'contain', marginBottom: 4 }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-danger-text)' }}>Connection failed</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Server may be restarting. Please wait and refresh.</span>
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          Retry
        </button>
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

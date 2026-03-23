import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { parseJwt } from '@/lib/token';
import type { AuthUser } from '@/stores/auth-store';

export function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('No authorization code provided');
      return;
    }

    let cancelled = false;

    async function exchangeCode() {
      try {
        const res = await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        if (!res.ok) {
          throw new Error('Authentication failed');
        }

        const { token } = await res.json();
        const payload = parseJwt(token);
        if (!payload) {
          throw new Error('Invalid token received');
        }

        const user: AuthUser = {
          id: (payload.sub as string) ?? '',
          name: (payload.name as string) ?? 'User',
          avatarUrl: payload.avatarUrl as string | undefined,
        };

        if (!cancelled) {
          login(token, user);
          navigate('/', { replace: true });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Authentication failed');
        }
      }
    }

    exchangeCode();
    return () => {
      cancelled = true;
    };
  }, [searchParams, login, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-error">{error}</p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="rounded-lg bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-hover"
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-3 text-text-secondary">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        Signing in...
      </div>
    </div>
  );
}

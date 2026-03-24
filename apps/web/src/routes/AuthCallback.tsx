import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { parseJwt } from '@/lib/token';
import { JIUN_API_URL } from '@/lib/auth';
import type { AuthUser } from '@/stores/auth-store';
import { BubbleLoader } from '@/components/shared/BubbleLoader';

export function AuthCallback() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError) {
      setError(`Authentication error: ${oauthError}`);
      return;
    }

    const code = searchParams.get('code');
    if (!code) {
      setError(t('errors.noAuthCode'));
      return;
    }

    let cancelled = false;

    async function exchangeCode() {
      try {
        // Exchange auth code for access token via jiun-api
        const res = await fetch(`${JIUN_API_URL}/auth/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code }),
        });

        if (!res.ok) {
          throw new Error(t('errors.authFailed'));
        }

        const { accessToken } = await res.json();
        const payload = parseJwt(accessToken);
        if (!payload) {
          throw new Error(t('errors.invalidToken'));
        }

        // Fetch full user info from jiun-api
        let displayName = (payload.username as string) ?? 'User';
        let avatarUrl: string | undefined;

        try {
          const meRes = await fetch(`${JIUN_API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (meRes.ok) {
            const { user: meData } = await meRes.json();
            displayName = meData.displayName || meData.username || displayName;
            avatarUrl = meData.avatarUrl || undefined;
          }
        } catch {
          // Use JWT data as fallback
        }

        const user: AuthUser = {
          id: (payload.sub as string) ?? '',
          name: displayName,
          avatarUrl,
        };

        if (!cancelled) {
          login(accessToken, user);
          navigate('/', { replace: true });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('errors.authFailed'));
        }
      }
    }

    exchangeCode();
    return () => {
      cancelled = true;
    };
  }, [searchParams, login, navigate, t]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-error">{error}</p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="rounded-lg bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-hover"
        >
          {t('common.backToLobby')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-3 text-text-secondary">
        <BubbleLoader />
        {t('common.signingIn')}
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPlaces } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { usePlaceStore } from '@/stores/place-store';
import { PlaceCard } from '@/components/lobby/PlaceCard';
import { CreatePlaceForm } from '@/components/lobby/CreatePlaceForm';
import { AdInfeed } from '@/components/ads/AdInfeed';
import { AdDisplay } from '@/components/ads/AdDisplay';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { redirectToOAuth } from '@/lib/auth';

const BACKGROUND_BUBBLE_COUNT = 12;

export function LobbyPage() {
  const { t } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const { places, setPlaces } = usePlaceStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  // Refetch places on mount AND when returning from a place (visibility change)
  useEffect(() => {
    const onFocus = () => setFetchKey((k) => k + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchPlaces()
      .then((data) => {
        if (!cancelled) {
          setPlaces(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setPlaces, fetchKey]);

  const sortedPlaces = useMemo(
    () => [...places].sort((a, b) => b.userCount - a.userCount),
    [places],
  );

  const backgroundBubbles = useMemo(
    () =>
      Array.from({ length: BACKGROUND_BUBBLE_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 20 + Math.random() * 60,
        delay: Math.random() * 5,
        duration: 6 + Math.random() * 6,
        opacity: 0.08 + Math.random() * 0.12,
      })),
    [],
  );

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background bubbles */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {backgroundBubbles.map((b) => (
          <div
            key={b.id}
            className="animate-float-slow absolute rounded-full"
            style={{
              left: `${b.left}%`,
              top: `${b.top}%`,
              width: `${b.size}px`,
              height: `${b.size}px`,
              background: `radial-gradient(circle at 30% 30%, rgba(124, 92, 191, ${b.opacity}), rgba(135, 206, 235, ${b.opacity * 0.5}))`,
              animationDelay: `${b.delay}s`,
              animationDuration: `${b.duration}s`,
            }}
          />
        ))}
      </div>

      {/* Top-right controls */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-3">
        {isAuthenticated && user ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-primary">{user.name}</span>
            <button
              onClick={logout}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              {t('auth.logout')}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => redirectToOAuth('google')}
              className="flex items-center gap-1.5 rounded-md bg-bg-secondary px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
              title={t('auth.signInWithGoogle')}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            </button>
            <button
              onClick={() => redirectToOAuth('github')}
              className="flex items-center gap-1.5 rounded-md bg-bg-secondary px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
              title={t('auth.signInWithGithub')}
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </button>
          </div>
        )}
        <LanguageSwitcher />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-12">
        <header className="mb-10 text-center">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-text-primary sm:text-5xl">
            {t('lobby.title')}
          </h1>
          <p className="text-text-secondary">
            {t('lobby.subtitle')}
          </p>
        </header>

        {/* Error state */}
        {error && (
          <div className="mb-6 rounded-lg border border-error/30 bg-error/10 p-4 text-center text-error">
            {t('lobby.failedToLoadPlaces', { error })}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        )}

        {/* Places grid */}
        {!isLoading && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedPlaces.map((place, i) => (
                <React.Fragment key={place.id}>
                  <PlaceCard place={place} />
                  {i === 2 && (
                    <div className="col-span-full">
                      <AdInfeed />
                    </div>
                  )}
                </React.Fragment>
              ))}
              <CreatePlaceForm />
            </div>
            <AdDisplay />
          </>
        )}
      </div>
    </div>
  );
}

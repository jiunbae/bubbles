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
import { LoginDropdown } from '@/components/shared/LoginDropdown';

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
          <LoginDropdown />
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

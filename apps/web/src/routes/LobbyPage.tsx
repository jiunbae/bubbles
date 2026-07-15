import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPlaces } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { usePlaceStore } from '@/stores/place-store';
import { PlaceCard } from '@/components/lobby/PlaceCard';
import { CreatePlaceForm } from '@/components/lobby/CreatePlaceForm';
import { AdInfeed } from '@/components/ads/AdInfeed';
import { AdDisplay } from '@/components/ads/AdDisplay';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { GlobalStatsBanner } from '@/components/lobby/GlobalStatsBanner';
import { BubbleLoader } from '@/components/shared/BubbleLoader';
import { LoginDropdown } from '@/components/shared/LoginDropdown';
import { Z_INDEX } from '@/lib/z-index';
import { isPlaceOwnedByCurrentUser } from '@/lib/ownership';

const BACKGROUND_BUBBLE_COUNT = 12;

export function LobbyPage() {
  const { t } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const { places, setPlaces } = usePlaceStore();
  const [isInitialLoading, setIsInitialLoading] = useState(
    () => places.length === 0
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);
  const hasLoadedRef = useRef(places.length > 0);

  const retryFetch = useCallback(() => {
    setFetchKey((key) => key + 1);
  }, []);

  // Refetch places on mount AND when returning from a place (visibility change)
  useEffect(() => {
    const onFocus = () => retryFetch();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [retryFetch]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (hasLoadedRef.current) {
      setIsRefreshing(true);
    } else {
      setIsInitialLoading(true);
    }

    fetchPlaces()
      .then((data) => {
        if (!cancelled) {
          setPlaces(data);
          hasLoadedRef.current = true;
          setError(null);
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setPlaces, fetchKey]);

  const sortedPlaces = useMemo(
    () => [...places].sort((a, b) => b.userCount - a.userCount),
    [places]
  );

  const myRooms = useMemo(
    () =>
      sortedPlaces.filter((place) =>
        isPlaceOwnedByCurrentUser(
          place,
          isAuthenticated ? user?.name : undefined
        )
      ),
    [sortedPlaces, isAuthenticated, user]
  );

  const browsePlaces = useMemo(() => {
    if (myRooms.length === 0) return sortedPlaces;
    const ownedRoomIds = new Set(myRooms.map((place) => place.id));
    return sortedPlaces.filter((place) => !ownedRoomIds.has(place.id));
  }, [myRooms, sortedPlaces]);

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
    []
  );

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background bubbles */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: Z_INDEX.BACKGROUND }}
      >
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
      <div
        className="absolute right-4 top-4 flex items-center gap-3"
        style={{ zIndex: Z_INDEX.HEADER_CONTROLS }}
      >
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
      <div
        className="relative mx-auto max-w-5xl px-4 py-12"
        style={{ zIndex: Z_INDEX.CONTENT }}
      >
        <header className="mb-10 text-center">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-text-primary sm:text-5xl">
            {t('lobby.title')}
          </h1>
          <p className="text-text-secondary">{t('lobby.subtitle')}</p>
          <GlobalStatsBanner />
        </header>

        {/* Error state */}
        {error && (
          <div
            className="mb-6 flex flex-col items-center justify-center gap-3 rounded-xl border border-error/30 bg-error/10 p-4 text-center text-error sm:flex-row"
            role="alert"
          >
            <span>{t('lobby.failedToLoadPlaces', { error })}</span>
            <button
              type="button"
              onClick={retryFetch}
              className="shrink-0 rounded-lg border border-error/40 bg-bg-primary/40 px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/70"
            >
              {t('common.reload')}
            </button>
          </div>
        )}

        {/* Initial loading replaces the content; background refreshes keep it stable. */}
        {isInitialLoading && (
          <div className="flex justify-center py-20">
            <BubbleLoader label={t('common.loading')} />
          </div>
        )}

        {!isInitialLoading && (
          <div className="space-y-10">
            {/* Keep the primary creation action discoverable above long room lists. */}
            <section aria-label={t('lobby.createPlaceButton')}>
              <div className="mx-auto max-w-xl">
                <CreatePlaceForm />
              </div>
            </section>

            {/* Rooms owned by the current account or anonymous cookie session. */}
            {myRooms.length > 0 && (
              <section aria-labelledby="your-rooms-heading">
                <h2
                  id="your-rooms-heading"
                  className="mb-3 text-lg font-semibold text-text-primary"
                >
                  {t('lobby.yourRooms')}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {myRooms.map((place) => (
                    <PlaceCard key={place.id} place={place} />
                  ))}
                </div>
              </section>
            )}

            {/* Browse section excludes rooms already highlighted above. */}
            <section aria-labelledby="browse-places-heading">
              <div className="mb-3 flex min-h-7 items-center justify-between gap-4">
                <h2
                  id="browse-places-heading"
                  className="flex items-center gap-2 text-lg font-semibold text-text-primary"
                >
                  <span>{t('lobby.title')}</span>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                    {t('lobby.sortLively')}
                  </span>
                </h2>
                {isRefreshing && (
                  <div
                    className="flex shrink-0 items-center gap-2 text-xs text-text-muted"
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className="h-3 w-3 animate-spin rounded-full border border-accent border-t-transparent"
                      aria-hidden="true"
                    />
                    <span className="hidden sm:inline">
                      {t('common.loading')}
                    </span>
                  </div>
                )}
              </div>

              {browsePlaces.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {browsePlaces.map((place, i) => (
                    <React.Fragment key={place.id}>
                      <PlaceCard place={place} />
                      {i === 2 && (
                        <div className="col-span-full">
                          <AdInfeed />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-bg-card/50 px-6 py-10 text-center shadow-sm">
                  <div
                    className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-3xl"
                    aria-hidden="true"
                  >
                    {'\u{1FAE7}'}
                  </div>
                  <p className="font-medium text-text-primary">
                    {t('lobby.createPlacePrompt')}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    {t('lobby.subtitle')}
                  </p>
                </div>
              )}
            </section>

            <AdDisplay />
          </div>
        )}
      </div>
    </div>
  );
}

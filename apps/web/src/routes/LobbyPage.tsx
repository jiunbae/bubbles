import React, { useEffect, useMemo, useState } from 'react';
import { fetchPlaces } from '@/lib/api';
import { usePlaceStore } from '@/stores/place-store';
import { PlaceCard } from '@/components/lobby/PlaceCard';
import { CreatePlaceForm } from '@/components/lobby/CreatePlaceForm';
import { AdInfeed } from '@/components/ads/AdInfeed';
import { AdDisplay } from '@/components/ads/AdDisplay';

type SortMode = 'lively' | 'new' | 'quiet';

const BACKGROUND_BUBBLE_COUNT = 12;

export function LobbyPage() {
  const { places, setPlaces } = usePlaceStore();
  const [sortMode, setSortMode] = useState<SortMode>('lively');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [setPlaces]);

  const sortedPlaces = useMemo(() => {
    const sorted = [...places];
    switch (sortMode) {
      case 'lively':
        sorted.sort((a, b) => b.userCount - a.userCount);
        break;
      case 'new':
        sorted.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
      case 'quiet':
        sorted.sort((a, b) => a.userCount - b.userCount);
        break;
    }
    return sorted;
  }, [places, sortMode]);

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

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-12">
        <header className="mb-10 text-center">
          <h1 className="mb-2 text-5xl font-bold tracking-tight text-text-primary">
            Bubbles
          </h1>
          <p className="text-text-secondary">
            Pick a place and start blowing bubbles together
          </p>
        </header>

        {/* Sort controls */}
        <div className="mb-6 flex justify-center gap-2">
          {(['lively', 'new', 'quiet'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                sortMode === mode
                  ? 'bg-accent text-white'
                  : 'bg-bg-secondary text-text-secondary hover:bg-bg-card-hover hover:text-text-primary'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6 rounded-lg border border-error/30 bg-error/10 p-4 text-center text-error">
            Failed to load places: {error}
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

import { lazy, Suspense, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPlace } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/stores/ui-store';
import { usePlaceStore } from '@/stores/place-store';
import { useBubbleStore } from '@/stores/bubble-store';
import { ModeSwitch } from '@/components/shared/ModeSwitch';
import { ActivityLog } from '@/components/shared/ActivityLog';

const VisualMode = lazy(() =>
  import('@/components/visual/VisualMode').then((m) => ({
    default: m.VisualMode,
  })),
);
const StealthMode = lazy(() =>
  import('@/components/stealth/StealthMode').then((m) => ({
    default: m.StealthMode,
  })),
);

export function PlacePage() {
  const { placeId } = useParams<{ placeId: string }>();
  const navigate = useNavigate();
  const { connect, disconnect, connectionStatus } = useWebSocket();
  const { token } = useAuth();
  const mode = useUIStore((s) => s.mode);
  const { currentPlace, setCurrentPlace, onlineUsers } = usePlaceStore();
  const bubbleCount = useBubbleStore((s) => s.bubbles.size);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load place data
  useEffect(() => {
    if (!placeId) return;
    let cancelled = false;
    getPlace(placeId)
      .then((place) => {
        if (!cancelled) setCurrentPlace(place);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
      setCurrentPlace(null);
    };
  }, [placeId, setCurrentPlace]);

  // Connect WebSocket
  useEffect(() => {
    if (!placeId) return;
    connect(placeId, token ?? undefined);
    return () => {
      disconnect();
    };
  }, [placeId, token, connect, disconnect]);

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-error">Failed to load place: {loadError}</p>
        <button
          onClick={() => navigate('/')}
          className="rounded-lg bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-hover"
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-text-secondary transition-colors hover:text-text-primary"
            title="Back to lobby"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-text-primary">
            {currentPlace?.name ?? 'Loading...'}
          </h1>
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-success'
                : connectionStatus === 'connecting'
                  ? 'bg-bubble-yellow animate-pulse'
                  : 'bg-error'
            }`}
            title={connectionStatus}
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Bubble count */}
          <span className="text-sm text-text-secondary" title={`${bubbleCount} bubbles`}>
            {bubbleCount} {'\u{1FAE7}'}
          </span>

          {/* Online users with count + dropdown */}
          <div className="relative">
            <button onClick={() => setShowUsers(!showUsers)} className="flex items-center gap-1.5" title="Online users">
              <span className="text-sm text-text-secondary">{onlineUsers.length}</span>
              <div className="flex -space-x-1">
                {onlineUsers.slice(0, 6).map((user) => (
                  <div
                    key={user.sessionId}
                    className="h-3 w-3 rounded-full border border-bg-primary"
                    style={{ backgroundColor: user.color }}
                  />
                ))}
              </div>
              {onlineUsers.length > 6 && (
                <span className="text-xs text-text-muted">
                  +{onlineUsers.length - 6}
                </span>
              )}
            </button>
            {showUsers && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-bg-card border border-border rounded-lg shadow-lg p-3 min-w-[180px]">
                <div className="text-xs text-text-muted mb-2">{onlineUsers.length} online</div>
                {onlineUsers.map((user) => (
                  <div key={user.sessionId} className="flex items-center gap-2 py-1">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: user.color }} />
                    <span className="text-sm text-text-primary">{user.displayName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setIsLogOpen((v) => !v)}
            className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
            title="Activity log"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6"
              />
            </svg>
          </button>

          <ModeSwitch />
        </div>
      </header>

      {/* Main content */}
      <div className="relative flex flex-1">
        <main className="flex-1">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            }
          >
            {mode === 'visual' ? <VisualMode /> : <StealthMode />}
          </Suspense>
        </main>

        {/* Activity log sidebar */}
        {isLogOpen && (
          <ActivityLog
            placeId={placeId!}
            onClose={() => setIsLogOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

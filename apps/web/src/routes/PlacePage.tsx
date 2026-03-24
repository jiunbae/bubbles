import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPlace } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/stores/ui-store';
import { usePlaceStore } from '@/stores/place-store';
import { useBubbleStore } from '@/stores/bubble-store';
import { ModeSwitch } from '@/components/shared/ModeSwitch';
import { ActivityLog } from '@/components/shared/ActivityLog';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { redirectToOAuth } from '@/lib/auth';

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
  const { t } = useTranslation();
  const { placeId } = useParams<{ placeId: string }>();
  const navigate = useNavigate();
  const { connect, disconnect, connectionStatus, send } = useWebSocket();
  const { token, isAuthenticated: isLoggedIn, logout } = useAuth();
  const mode = useUIStore((s) => s.mode);
  const { currentPlace, setCurrentPlace, onlineUsers, mySessionId } = usePlaceStore();
  const bubbleCount = useBubbleStore((s) => s.bubbles.size);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const myUser = onlineUsers.find((u) => u.sessionId === mySessionId);

  const handleNameEdit = () => {
    setNameInput(myUser?.displayName ?? '');
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const handleNameSubmit = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== myUser?.displayName) {
      send({ type: 'set_name', data: { displayName: trimmed } });
    }
    setIsEditingName(false);
  };


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
        <p className="text-error">{t('place.failedToLoad', { error: loadError })}</p>
        <button
          onClick={() => navigate('/')}
          className="rounded-lg bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-hover"
        >
          {t('common.backToLobby')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-border px-3 py-2 sm:px-4 sm:py-3">
        {/* Row 1: Back + place name + connection dot + mode switch */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => navigate('/')}
            className="rounded-md p-2 text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
            title={t('place.backToLobby')}
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
          <h1 className="text-base font-semibold text-text-primary sm:text-lg">
            {currentPlace?.name ?? t('common.loading')}
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
          <ModeSwitch />
        </div>

        {/* Row 2: user info, bubble count, online users, actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* My name (editable) */}
          {myUser && (
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: myUser.color }} />
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={handleNameSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameSubmit();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  maxLength={30}
                  className="w-20 rounded border border-border bg-bg-secondary px-1.5 py-0.5 text-sm text-text-primary outline-none focus:border-accent sm:w-28"
                />
              ) : (
                <button
                  onClick={handleNameEdit}
                  className="text-sm text-text-primary hover:text-accent transition-colors"
                  title={t('place.editName', 'Click to change name')}
                >
                  {myUser.displayName}
                </button>
              )}
            </div>
          )}

          {/* Login / Logout */}
          {!isLoggedIn ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => redirectToOAuth('google')}
                className="rounded-md bg-bg-secondary p-1.5 text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
                title={t('auth.signInWithGoogle')}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </button>
              <button
                onClick={() => redirectToOAuth('github')}
                className="rounded-md bg-bg-secondary p-1.5 text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
                title={t('auth.signInWithGithub')}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={logout}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
              title={t('auth.signOut')}
            >
              {t('auth.logout')}
            </button>
          )}

          <div className="hidden h-4 w-px bg-border sm:block" />

          {/* Bubble count */}
          <span className="text-xs text-text-secondary sm:text-sm" title={t('place.bubbles', { count: bubbleCount })}>
            {bubbleCount} {'\u{1FAE7}'}
          </span>

          {/* Online users with count + dropdown */}
          <div className="relative">
            <button onClick={() => setShowUsers(!showUsers)} className="flex items-center gap-1.5 rounded-md p-1.5" title={t('place.onlineUsers')}>
              <span className="text-xs text-text-secondary sm:text-sm">{onlineUsers.length}</span>
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
              <div className="absolute right-0 top-full mt-2 z-50 bg-bg-card border border-border rounded-lg shadow-lg p-3 min-w-[180px] max-w-[calc(100vw-2rem)]">
                <div className="text-xs text-text-muted mb-2">{t('place.online', { count: onlineUsers.length })}</div>
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
            className="rounded-md p-2 text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
            title={t('place.activityLog')}
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

          <LanguageSwitcher />
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

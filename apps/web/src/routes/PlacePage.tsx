import { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { showToast } from '@/components/shared/Toast';
import { getPlace } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/stores/ui-store';
import { usePlaceStore } from '@/stores/place-store';
import { useBubbleStore } from '@/stores/bubble-store';
import { BUBBLE_COLORS } from '@bubbles/shared';
import { ModeSwitch } from '@/components/shared/ModeSwitch';
import { ActivityLog } from '@/components/shared/ActivityLog';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { initAudio } from '@/lib/sounds';
import { LoginDropdown } from '@/components/shared/LoginDropdown';
import { InviteBanner } from '@/components/shared/InviteBanner';
import { BreakTimer } from '@/components/shared/BreakTimer';
import { analytics } from '@/lib/analytics';

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
  const interactionMode = useUIStore((s) => s.interactionMode);
  const toggleInteractionMode = useUIStore((s) => s.toggleInteractionMode);
  const isSoundEnabled = useUIStore((s) => s.isSoundEnabled);
  const toggleSound = useUIStore((s) => s.toggleSound);
  const { currentPlace, setCurrentPlace, onlineUsers, mySessionId } = usePlaceStore();
  const bubbleCount = useBubbleStore((s) => s.bubbles.size);

  const [isLogOpen, setIsLogOpen] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

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

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const text = t('place.shareText', 'Come blow bubbles together! 🫧');
    try {
      if (navigator.share) {
        await navigator.share({ title: currentPlace?.name ?? 'Bubbles', text, url });
        analytics.share('native');
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        showToast(t('place.linkCopied', 'Link copied!'), 'success');
        analytics.share('clipboard');
      }
    } catch {
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        showToast(t('place.linkCopied', 'Link copied!'), 'success');
        analytics.share('clipboard_fallback');
      } catch {
        // Clipboard also failed — silently ignore
      }
    }
  }, [currentPlace, t]);

  // Close more menu on outside click
  useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMoreMenu]);

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

  // Initialize audio on first user interaction (Chrome autoplay policy)
  useEffect(() => {
    const handler = () => initAudio();
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, []);

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
      <header className="flex items-center justify-between border-b border-border px-2 py-1.5 sm:px-4 sm:py-3">
        {/* Left: Back + place name + connection */}
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
          <button
            onClick={() => navigate('/')}
            className="shrink-0 rounded-md p-1.5 text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary sm:p-2"
            title={t('place.backToLobby')}
          >
            <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="truncate text-sm font-semibold text-text-primary sm:text-lg">
            {currentPlace?.name ?? t('common.loading')}
          </h1>
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
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

        {/* Right: essential actions + overflow menu */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* User identity — color dot + name */}
          {myUser && (
            <div className="hidden items-center gap-1.5 sm:flex">
              <div className="relative">
                <button
                  onClick={() => setShowColorPicker((v) => !v)}
                  className="h-4 w-4 rounded-full border-2 border-white/30 transition-transform hover:scale-125 active:scale-95"
                  style={{ backgroundColor: myUser.color }}
                  title={t('place.changeColor', 'Change bubble color')}
                />
                {showColorPicker && (
                  <div className="absolute left-0 top-full z-50 mt-2 rounded-lg border border-border bg-bg-card p-2 shadow-lg">
                    <div className="grid grid-cols-4 gap-1.5">
                      {BUBBLE_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            send({ type: 'set_color', data: { color } });
                            setShowColorPicker(false);
                          }}
                          className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                            myUser.color === color ? 'border-white scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
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

          {/* Interaction mode toggle (visual mode only) */}
          {mode === 'visual' && (
            <button
              onClick={toggleInteractionMode}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors sm:px-2 sm:py-1.5 ${
                interactionMode === 'blow'
                  ? 'bg-accent/20 text-accent'
                  : 'bg-error/20 text-error'
              }`}
              title={interactionMode === 'blow' ? t('place.switchToPop', 'Switch to Pop mode') : t('place.switchToBlow', 'Switch to Blow mode')}
            >
              {interactionMode === 'blow' ? (
                <>
                  <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="8" strokeDasharray="4 2" />
                    <path d="M12 8v4m-2-2h4" strokeLinecap="round" />
                  </svg>
                  <span className="hidden sm:inline">{t('place.blowMode', 'Blow')}</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="8" />
                    <path d="M9 9l6 6m0-6l-6 6" strokeLinecap="round" />
                  </svg>
                  <span className="hidden sm:inline">{t('place.popMode', 'Pop')}</span>
                </>
              )}
            </button>
          )}

          {/* Bubble count */}
          <span className="text-xs text-text-secondary" title={t('place.bubbles', { count: bubbleCount })}>
            {bubbleCount} {'\u{1FAE7}'}
          </span>

          {/* Online users */}
          <div className="relative">
            <button onClick={() => setShowUsers(!showUsers)} className="flex items-center gap-1 rounded-md p-1.5" title={t('place.onlineUsers')}>
              <span className="text-xs text-text-secondary">{onlineUsers.length}</span>
              <div className="flex -space-x-1">
                {onlineUsers.slice(0, 4).map((user) => (
                  <div
                    key={user.sessionId}
                    className="h-2.5 w-2.5 rounded-full border border-bg-primary sm:h-3 sm:w-3"
                    style={{ backgroundColor: user.color }}
                  />
                ))}
              </div>
              {onlineUsers.length > 4 && (
                <span className="text-xs text-text-muted">+{onlineUsers.length - 4}</span>
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
                {/* Mobile: show color picker + name edit in user list */}
                {myUser && (
                  <div className="mt-2 border-t border-border pt-2 sm:hidden">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowColorPicker((v) => !v)}
                        className="h-4 w-4 shrink-0 rounded-full border-2 border-white/30"
                        style={{ backgroundColor: myUser.color }}
                      />
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
                          className="min-w-0 flex-1 rounded border border-border bg-bg-secondary px-1.5 py-0.5 text-sm text-text-primary outline-none focus:border-accent"
                        />
                      ) : (
                        <button onClick={handleNameEdit} className="text-sm text-text-primary hover:text-accent">
                          {myUser.displayName}
                        </button>
                      )}
                    </div>
                    {showColorPicker && (
                      <div className="mt-2 grid grid-cols-4 gap-1.5">
                        {BUBBLE_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => {
                              send({ type: 'set_color', data: { color } });
                              setShowColorPicker(false);
                            }}
                            className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                              myUser.color === color ? 'border-white scale-110' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Share — always visible */}
          <button
            onClick={handleShare}
            className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary sm:p-2"
            title={t('place.share', 'Share')}
          >
            <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>

          {/* More menu (overflow) — groups less-used actions */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setShowMoreMenu((v) => !v)}
              className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary sm:p-2"
              title={t('common.more', 'More')}
            >
              <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
              </svg>
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-full z-50 mt-2 min-w-[160px] rounded-lg border border-border bg-bg-card/95 py-1 shadow-lg backdrop-blur-sm">
                {/* Sound toggle */}
                <button
                  onClick={() => { toggleSound(); setShowMoreMenu(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-secondary"
                >
                  {isSoundEnabled ? (
                    <svg className="h-4 w-4 shrink-0 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8H4a1 1 0 00-1 1v6a1 1 0 001 1h2.5l4.5 4V4l-4.5 4z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 shrink-0 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  )}
                  {isSoundEnabled ? t('place.muteSound', 'Mute') : t('place.unmuteSound', 'Unmute')}
                </button>

                {/* Activity log */}
                <button
                  onClick={() => { setIsLogOpen((v) => !v); setShowMoreMenu(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-secondary"
                >
                  <svg className="h-4 w-4 shrink-0 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6" />
                  </svg>
                  {t('place.activityLog')}
                </button>

                {/* Cumulative stats */}
                {currentPlace && (
                  <div className="flex items-center gap-2.5 px-3 py-2 text-sm text-text-muted">
                    <svg className="h-4 w-4 shrink-0 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                    {currentPlace.totalVisitors} {'\u{1F465}'} · {currentPlace.totalBubbles} {'\u{1FAE7}'}
                  </div>
                )}

                <div className="my-1 border-t border-border" />

                {/* Language switcher */}
                <div className="px-3 py-1.5">
                  <LanguageSwitcher />
                </div>

                {/* Login / Logout */}
                <div className="px-3 py-1.5">
                  {!isLoggedIn ? (
                    <LoginDropdown size="sm" />
                  ) : (
                    <button
                      onClick={() => { logout(); setShowMoreMenu(false); }}
                      className="text-xs text-text-muted hover:text-text-primary transition-colors"
                    >
                      {t('auth.logout')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
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

      {/* Invite banner — shows after 30s, once per session */}
      <InviteBanner />

      {/* Break timer — top-left floating, compact */}
      <BreakTimer />
    </div>
  );
}

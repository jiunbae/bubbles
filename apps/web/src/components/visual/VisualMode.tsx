import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { MOUSE, TOUCH } from 'three';
import { useTranslation } from 'react-i18next';
import { SkyEnvironment } from './SkyEnvironment';
import { BubbleScene } from './BubbleScene';
import { BubbleControls } from './BubbleControls';
import { BubbleWandCursor } from './BubbleWandCursor';
import { RemoteCursors } from './RemoteCursors';
import { CursorSender } from './CursorSender';
import { CameraFeed } from './CameraFeed';
import { OrbitControls } from './OrbitControls';
import { usePlaceStore } from '@/stores/place-store';
import { useUIStore } from '@/stores/ui-store';
import { Z_INDEX } from '@/lib/z-index';
import type { BubbleSize } from '@bubbles/shared';

/* ------------------------------------------------------------------ */
/*  Size selector (S / M / L) – floating pill next to blow controls    */
/* ------------------------------------------------------------------ */

const SIZES: BubbleSize[] = ['S', 'M', 'L'];

function SizeSelector() {
  const { t } = useTranslation();
  const selectedSize = useUIStore((s) => s.selectedSize);
  const setSelectedSize = useUIStore((s) => s.setSelectedSize);
  const interactionMode = useUIStore((s) => s.interactionMode);

  if (interactionMode !== 'blow') return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 16px) + 120px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: Z_INDEX.UI_CONTROLS,
        pointerEvents: 'auto',
        display: 'flex',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 20,
        background: 'rgba(20, 20, 30, 0.8)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.15)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {SIZES.map((size) => (
        <button
          key={size}
          onClick={() => setSelectedSize(size)}
          aria-label={t(
            `visual.size${size === 'S' ? 'Small' : size === 'M' ? 'Medium' : 'Large'}`
          )}
          aria-pressed={selectedSize === size}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border:
              selectedSize === size
                ? '2px solid rgba(255,255,255,0.8)'
                : '1px solid rgba(255,255,255,0.25)',
            background:
              selectedSize === size
                ? 'rgba(100, 180, 255, 0.35)'
                : 'rgba(255,255,255,0.1)',
            color: '#fff',
            fontSize: size === 'S' ? 11 : size === 'M' ? 13 : 15,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {size}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile interaction mode control                                    */
/* ------------------------------------------------------------------ */

function MobileInteractionModeControl() {
  const { t } = useTranslation();
  const interactionMode = useUIStore((s) => s.interactionMode);
  const setInteractionMode = useUIStore((s) => s.setInteractionMode);

  return (
    <>
      <div
        className="fixed left-3 flex rounded-xl border border-white/15 bg-[rgba(20,20,30,0.85)] p-1 shadow-lg backdrop-blur-xl sm:hidden"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 176px)',
          zIndex: Z_INDEX.UI_CONTROLS,
        }}
        role="group"
        aria-label={t('visual.interactionMode')}
      >
        <button
          type="button"
          onClick={() => setInteractionMode('blow')}
          aria-label={t('place.switchToBlow')}
          aria-pressed={interactionMode === 'blow'}
          className={`min-h-11 min-w-[52px] rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
            interactionMode === 'blow'
              ? 'bg-accent text-white shadow-sm'
              : 'text-white/65 hover:bg-white/10 hover:text-white'
          }`}
        >
          {t('place.blowMode')}
        </button>
        <button
          type="button"
          onClick={() => setInteractionMode('pop')}
          aria-label={t('place.switchToPop')}
          aria-pressed={interactionMode === 'pop'}
          className={`min-h-11 min-w-[52px] rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
            interactionMode === 'pop'
              ? 'bg-error/80 text-white shadow-sm'
              : 'text-white/65 hover:bg-white/10 hover:text-white'
          }`}
        >
          {t('place.popMode')}
        </button>
      </div>

      {interactionMode === 'pop' && (
        <div
          className="pointer-events-none fixed left-1/2 max-w-[calc(100vw-9rem)] -translate-x-1/2 rounded-full border border-white/15 bg-[rgba(20,20,30,0.85)] px-3 py-2 text-center text-xs font-medium text-white/85 shadow-lg backdrop-blur-xl sm:hidden"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
            zIndex: Z_INDEX.UI_CONTROLS,
          }}
          role="status"
          aria-live="polite"
        >
          {t('visual.tapToPop')}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Onboarding / help overlay                                          */
/* ------------------------------------------------------------------ */

function OnboardingOverlay({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const [fading, setFading] = useState(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setFading(true);
    try {
      localStorage.setItem('bubbles_onboarded', '1');
    } catch {
      // Storage may be unavailable in private browsing; dismissal still works for this session.
    }
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    dismissTimeoutRef.current = setTimeout(() => {
      setFading(false);
      onDismiss();
    }, 400);
  }, [onDismiss]);

  // Auto-dismiss after 8 seconds on first show
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(dismiss, 8000);
    return () => clearTimeout(timer);
  }, [visible, dismiss]);

  // Cleanup dismiss timeout on unmount
  useEffect(() => {
    return () => {
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    };
  }, []);

  // Escape key dismisses
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, dismiss]);

  if (!visible) return null;

  const isTouch = 'ontouchstart' in window;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: Z_INDEX.ONBOARDING,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
        cursor: 'pointer',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.4s ease',
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('visual.dismissHint', 'Close controls')}
        style={{
          position: 'absolute',
          inset: 0,
          border: 0,
          padding: 0,
          background: 'transparent',
          cursor: 'pointer',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="visual-help-title"
        style={{
          position: 'relative',
          zIndex: 1,
          background: 'rgba(10, 10, 20, 0.9)',
          color: 'white',
          padding: '28px 36px',
          borderRadius: 16,
          fontSize: 15,
          lineHeight: 2,
          maxWidth: 400,
          textAlign: 'left',
          pointerEvents: 'auto',
          cursor: 'default',
        }}
      >
        <h2
          id="visual-help-title"
          style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}
        >
          {t('visual.helpTitle', 'Controls')}
        </h2>

        {/* Blow & pop */}
        <div>
          {'\u{1FAE7}'} {t('visual.blowBubbles')}
        </div>
        <div>
          {'\u{1F5B1}\uFE0F'} {t('visual.lookAround')}
        </div>
        <div>
          {'\u{1F4A5}'} {t('visual.popBubble')}
        </div>

        {/* Touch or keyboard */}
        {isTouch ? (
          <div>
            {'\u{1F44B}'}{' '}
            {t('visual.touchControls', 'Tap to blow, drag to look around')}
          </div>
        ) : (
          <div>
            {'\u2328\uFE0F'} {t('visual.spaceBlowBubbles')}
          </div>
        )}

        {/* Extra controls */}
        <div>
          {'\u{1F3A8}'}{' '}
          {t('visual.colorPicker', 'Header dot — Change bubble color')}
        </div>
        <div>
          {'\u{1F4CF}'}{' '}
          {t('visual.sizeSelector', 'S / M / L buttons — Change bubble size')}
        </div>
        <div>
          {'\u270F\uFE0F'}{' '}
          {t('visual.editName', 'Click your name — Edit display name')}
        </div>
        <div>
          {'\u{1F504}'} {t('visual.modeToggle', 'Blow / Pop toggle in header')}
        </div>

        <button
          type="button"
          onClick={dismiss}
          style={{
            display: 'block',
            margin: '12px auto 0',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 8,
            padding: '6px 14px',
            background: 'rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.75)',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {t('visual.dismissHint', 'Click anywhere or press Escape to close')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Help "?" floating button                                           */
/* ------------------------------------------------------------------ */

function HelpButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      aria-label={t('visual.showHelp', 'Show controls')}
      title={t('visual.showHelp', 'Show controls')}
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)',
        right: 16,
        zIndex: Z_INDEX.UI_CONTROLS,
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.2)',
        background: 'rgba(20, 20, 30, 0.7)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: 'rgba(255,255,255,0.7)',
        fontSize: 18,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        transition: 'all 0.15s',
        pointerEvents: 'auto',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(100, 180, 255, 0.3)';
        e.currentTarget.style.color = '#fff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(20, 20, 30, 0.7)';
        e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
      }}
    >
      ?
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main VisualMode                                                    */
/* ------------------------------------------------------------------ */

export function VisualMode() {
  const currentPlace = usePlaceStore((s) => s.currentPlace);
  const interactionMode = useUIStore((s) => s.interactionMode);
  const cameraMode = useUIStore((s) => s.cameraMode);

  // Help overlay state: show on first visit, re-showable via "?" button
  const [showHelp, setShowHelp] = useState(() => {
    try {
      return localStorage.getItem('bubbles_onboarded') !== '1';
    } catch {
      return true;
    }
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: cameraMode ? 'transparent' : '#0a0a14',
        cursor: interactionMode === 'pop' ? 'crosshair' : 'none',
        touchAction: 'none', // prevent browser zoom/scroll on touch
        overscrollBehavior: 'none', // prevent pull-to-refresh
      }}
    >
      {cameraMode && <CameraFeed />}
      <Canvas
        key={cameraMode ? 'ar' : 'default'}
        dpr={cameraMode ? [1, 1] : [1, 1.5]}
        camera={{ fov: 50, near: 0.1, far: 100, position: [0, 2, 8] }}
        gl={{ antialias: true, alpha: cameraMode, premultipliedAlpha: false }}
        style={{
          width: '100%',
          height: '100%',
          position: cameraMode ? 'absolute' : undefined,
          inset: cameraMode ? 0 : undefined,
          zIndex: cameraMode ? Z_INDEX.CANVAS_CAMERA : undefined,
          background: 'transparent',
          cursor: interactionMode === 'pop' ? 'crosshair' : 'none',
          touchAction: 'none',
        }}
      >
        <Suspense fallback={null}>
          <SkyEnvironment theme={currentPlace?.theme} cameraMode={cameraMode} />
          <BubbleScene />
          {interactionMode === 'blow' && <BubbleWandCursor />}
          <RemoteCursors />
          <CursorSender />

          <OrbitControls
            enablePan={false}
            enableZoom
            minDistance={3}
            maxDistance={20}
            minPolarAngle={(10 * Math.PI) / 180}
            maxPolarAngle={(80 * Math.PI) / 180}
            autoRotate={false}
            makeDefault
            mouseButtons={{
              LEFT: undefined, // disable left click orbit
              MIDDLE: MOUSE.DOLLY, // middle = zoom
              RIGHT: MOUSE.ROTATE, // right click drag = orbit
            }}
            touches={{
              ONE: TOUCH.ROTATE, // single finger = rotate camera
              TWO: TOUCH.DOLLY_ROTATE, // two fingers = zoom + rotate
            }}
          />
        </Suspense>
      </Canvas>

      <BubbleControls />
      <SizeSelector />
      <MobileInteractionModeControl />
      <HelpButton onClick={() => setShowHelp(true)} />
      <OnboardingOverlay
        visible={showHelp}
        onDismiss={() => setShowHelp(false)}
      />
    </div>
  );
}

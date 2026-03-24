import { Suspense, useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MOUSE, TOUCH } from 'three';
import { useTranslation } from 'react-i18next';
import { SkyEnvironment } from './SkyEnvironment';
import { BubbleScene } from './BubbleScene';
import { BubbleControls } from './BubbleControls';
import { BubbleWandCursor } from './BubbleWandCursor';
import { RemoteCursors } from './RemoteCursors';
import { CursorSender } from './CursorSender';
import { usePlaceStore } from '@/stores/place-store';
import { useUIStore } from '@/stores/ui-store';

function OnboardingOverlay() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem('bubbles_onboarded') !== '1';
    } catch {
      return true;
    }
  });
  const [fading, setFading] = useState(false);

  const dismiss = useCallback(() => {
    setFading(true);
    try {
      localStorage.setItem('bubbles_onboarded', '1');
    } catch {}
    setTimeout(() => setVisible(false), 400);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(dismiss, 5000);
    return () => clearTimeout(timer);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
        cursor: 'pointer',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.4s ease',
      }}
    >
      <div
        style={{
          background: 'rgba(10, 10, 20, 0.85)',
          color: 'white',
          padding: '24px 32px',
          borderRadius: 16,
          fontSize: 16,
          lineHeight: 2,
          maxWidth: 360,
          textAlign: 'left',
          pointerEvents: 'none',
        }}
      >
        <div>{'\u{1FAE7}'} {t('visual.blowBubbles')}</div>
        <div>{'\u{1F5B1}\uFE0F'} {t('visual.lookAround')}</div>
        <div>{'\u{1F4A5}'} {t('visual.popBubble')}</div>
        {'ontouchstart' in window ? (
          <div>{'\u{1F44B}'} {t('visual.touchControls', 'Tap to blow, drag to look around')}</div>
        ) : (
          <div>{'\u2328\uFE0F'} {t('visual.spaceBlowBubbles')}</div>
        )}
      </div>
    </div>
  );
}

export function VisualMode() {
  const currentPlace = usePlaceStore((s) => s.currentPlace);
  const interactionMode = useUIStore((s) => s.interactionMode);

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative',
      background: '#0a0a14',
      cursor: interactionMode === 'pop' ? 'crosshair' : 'none',
      touchAction: 'none',       // prevent browser zoom/scroll on touch
      overscrollBehavior: 'none', // prevent pull-to-refresh
    }}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 50, near: 0.1, far: 100, position: [0, 2, 8] }}
        gl={{ antialias: true, alpha: false }}
        style={{
          width: '100%', height: '100%',
          cursor: interactionMode === 'pop' ? 'crosshair' : 'none',
          touchAction: 'none',
        }}
      >
        <Suspense fallback={null}>
          <SkyEnvironment theme={currentPlace?.theme} />
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
              LEFT: -1 as any,          // disable left click orbit
              MIDDLE: MOUSE.DOLLY,       // middle = zoom
              RIGHT: MOUSE.ROTATE,       // right click drag = orbit
            }}
            touches={{
              ONE: TOUCH.ROTATE,          // single finger = rotate camera
              TWO: TOUCH.DOLLY_ROTATE,    // two fingers = zoom + rotate
            }}
          />
        </Suspense>
      </Canvas>

      <BubbleControls />
      <OnboardingOverlay />
    </div>
  );
}

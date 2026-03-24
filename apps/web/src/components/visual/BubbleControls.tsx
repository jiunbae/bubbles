import { useEffect, useRef, useState } from 'react';
import { useBubbleStore } from '@/stores/bubble-store';
import { BUBBLE_COLORS } from '@bubbles/shared';
import { spawnBubble } from '@/lib/bubble-factory';
import { scheduleExpiry } from './BubbleScene';

const BLOW_INTERVAL = 250; // ~4 bubbles/sec, feels natural
const MAX_BUBBLES = 80;

function spawnBatch(color: string): number {
  const store = useBubbleStore.getState();
  if (store.bubbles.size >= MAX_BUBBLES) return store.bubbles.size;

  spawnBubble(
    (Math.random() - 0.5) * 0.3,  // tight spawn near center
    0.5 + Math.random() * 0.3,
    (Math.random() - 0.5) * 0.3,
    color,
    scheduleExpiry,
  );

  return useBubbleStore.getState().bubbles.size;
}

// Global flag to prevent canvas spawner from firing when button is clicked
let buttonActive = false;
export function isButtonBlowing() { return buttonActive; }

export function BubbleControls() {
  const intervalRef = useRef<number | null>(null);
  const [bubbleCount, setBubbleCount] = useState(0);
  const [isBlowing, setIsBlowing] = useState(false);

  // Reactive mobile breakpoint (fix #20)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Subscribe to bubble count for display
  useEffect(() => {
    return useBubbleStore.subscribe((s) => setBubbleCount(s.bubbles.size));
  }, []);

  const startBlowing = () => {
    if (intervalRef.current !== null) return;
    buttonActive = true;
    setIsBlowing(true);
    spawnBatch(BUBBLE_COLORS[1]);

    // Continue spawning
    intervalRef.current = window.setInterval(() => {
      spawnBatch(BUBBLE_COLORS[1]);
    }, BLOW_INTERVAL);
  };

  const stopBlowing = () => {
    buttonActive = false;
    setIsBlowing(false);
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Spacebar
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        startBlowing();
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') stopBlowing(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      stopBlowing();
    };
  }, []);

  return (
    <div style={{
      position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)', left: '50%', transform: 'translateX(-50%)',
      zIndex: 10000, pointerEvents: 'auto',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      maxHeight: 'calc(100vh - 80px)',
    }}>
      {/* Bubble count indicator */}
      <div style={{
        color: 'rgba(255,255,255,0.6)', fontSize: 12,
        fontFamily: 'system-ui, sans-serif',
      }}>
        {bubbleCount > 0 ? `${bubbleCount} bubbles floating` : 'Hold button or press Space'}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: isMobile ? '8px 16px' : '12px 24px', borderRadius: 24,
        background: 'rgba(20, 20, 30, 0.8)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startBlowing();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            stopBlowing();
          }}
          onPointerLeave={stopBlowing}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            padding: isMobile ? '10px 28px' : '14px 40px', borderRadius: 24,
            border: isBlowing ? '2px solid rgba(255,255,255,0.7)' : '1px solid rgba(255,255,255,0.3)',
            background: isBlowing ? 'rgba(100, 180, 255, 0.4)' : 'rgba(255,255,255,0.15)',
            color: '#fff', fontSize: isMobile ? 15 : 18, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'system-ui, sans-serif',
            userSelect: 'none', WebkitUserSelect: 'none',
            touchAction: 'none',
            transform: isBlowing ? 'scale(0.95)' : 'scale(1)',
            transition: 'all 0.1s',
          }}
        >
          {isBlowing ? '🫧 Blowing...' : '🫧 Blow'}
        </button>
      </div>
    </div>
  );
}

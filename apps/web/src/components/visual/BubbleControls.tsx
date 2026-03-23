import { useEffect, useRef, useState } from 'react';
import { useBubbleStore } from '@/stores/bubble-store';
import { globalWsClient } from '@/lib/ws-client';
import { BUBBLE_COLORS, BUBBLE_LIFETIME } from '@bubbles/shared';
import type { BubbleInfo, BubbleSize } from '@bubbles/shared';
import { scheduleExpiry } from './BubbleScene';

const BLOW_INTERVAL = 250; // ~4 bubbles/sec, feels natural

let _counter = 0;
function makeId() { return `b${Date.now()}_${++_counter}`; }
function randSize(): BubbleSize {
  const r = Math.random();
  return r < 0.35 ? 'S' : r < 0.8 ? 'M' : 'L';
}
function tint(hex: string): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const v = (n: number) => Math.max(0, Math.min(255, n + Math.round((Math.random() - 0.5) * 60)));
    return `#${v(r).toString(16).padStart(2, '0')}${v(g).toString(16).padStart(2, '0')}${v(b).toString(16).padStart(2, '0')}`;
  } catch { return hex; }
}

function spawnBatch(color: string): number {
  const store = useBubbleStore.getState();
  const remaining = 80 - store.bubbles.size;
  if (remaining <= 0) return store.bubbles.size;
  const count = Math.min(2, remaining); // 2 per tick
  for (let i = 0; i < count; i++) {
    const size = randSize();
    const now = Date.now();
    const range = BUBBLE_LIFETIME[size];
    const lifetime = range.min + Math.random() * (range.max - range.min);
    const id = makeId();
    const c = tint(color);
    const bubble: BubbleInfo = {
      bubbleId: id,
      blownBy: { sessionId: 'local', displayName: 'You', isAuthenticated: false, color: c },
      x: (Math.random() - 0.5) * 2,  // fixed world position ±1
      y: 0.5 + Math.random() * 1.0,
      z: (Math.random() - 0.5) * 2,
      size, color: c, pattern: 'plain',
      seed: Math.random() * 10000,
      createdAt: now, expiresAt: now + lifetime,
    };
    useBubbleStore.getState().addBubble(bubble);
    scheduleExpiry(id, lifetime);

    // Send to server for other users
    if (globalWsClient.isConnected()) {
      globalWsClient.send({
        type: 'blow',
        data: { size, color: c, pattern: 'plain', x: bubble.x, y: bubble.y, z: bubble.z },
      });
    }
  }
  return useBubbleStore.getState().bubbles.size;
}

export function BubbleControls() {
  const intervalRef = useRef<number | null>(null);
  const [bubbleCount, setBubbleCount] = useState(0);
  const [isBlowing, setIsBlowing] = useState(false);

  // Subscribe to bubble count for display
  useEffect(() => {
    return useBubbleStore.subscribe((s) => setBubbleCount(s.bubbles.size));
  }, []);

  const startBlowing = () => {
    if (intervalRef.current !== null) return;
    setIsBlowing(true);
    spawnBatch(BUBBLE_COLORS[1]);

    // Continue spawning
    intervalRef.current = window.setInterval(() => {
      spawnBatch(BUBBLE_COLORS[1]);
    }, BLOW_INTERVAL);
  };

  const stopBlowing = () => {
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
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 10000, pointerEvents: 'auto',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
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
        padding: '12px 24px', borderRadius: 24,
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
            padding: '14px 40px', borderRadius: 24,
            border: isBlowing ? '2px solid rgba(255,255,255,0.7)' : '1px solid rgba(255,255,255,0.3)',
            background: isBlowing ? 'rgba(100, 180, 255, 0.4)' : 'rgba(255,255,255,0.15)',
            color: '#fff', fontSize: 18, fontWeight: 700,
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

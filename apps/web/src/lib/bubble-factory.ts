/**
 * Shared bubble creation utilities.
 *
 * Extracted from BubbleControls and BubbleScene to eliminate
 * duplicated tint/randSize/makeId/spawn logic.
 */
import { useBubbleStore } from '@/stores/bubble-store';
import { globalWsClient } from '@/lib/ws-client';
import { analytics } from '@/lib/analytics';
import { BUBBLE_LIFETIME } from '@bubbles/shared';
import type { BubbleInfo, BubbleSize } from '@bubbles/shared';

let _idCounter = 0;

/** Generate a unique client-side bubble ID. */
export function makeId(): string {
  return `b${Date.now()}_${++_idCounter}`;
}

/** Weighted random size: 35% S, 45% M, 20% L. */
export function randSize(): BubbleSize {
  const r = Math.random();
  return r < 0.35 ? 'S' : r < 0.8 ? 'M' : 'L';
}

/** Slightly vary a hex colour to give each bubble a unique tint. */
export function tint(hex: string): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const v = (n: number) =>
      Math.max(0, Math.min(255, n + Math.round((Math.random() - 0.5) * 60)));
    return `#${v(r).toString(16).padStart(2, '0')}${v(g).toString(16).padStart(2, '0')}${v(b).toString(16).padStart(2, '0')}`;
  } catch {
    return hex;
  }
}

/** Build a BubbleInfo object with sensible defaults. */
export function createBubbleInfo(
  x: number,
  y: number,
  z: number,
  color: string,
): BubbleInfo {
  const size = randSize();
  const now = Date.now();
  const range = BUBBLE_LIFETIME[size];
  const lifetime = range.min + Math.random() * (range.max - range.min);
  const c = tint(color);
  return {
    bubbleId: makeId(),
    blownBy: { sessionId: 'local', displayName: 'You', isAuthenticated: false, color: c },
    x,
    y,
    z,
    size,
    color: c,
    pattern: 'plain',
    seed: Math.random() * 10000,
    createdAt: now,
    expiresAt: now + lifetime,
  };
}

/**
 * Full spawn pipeline: create bubble info, insert into store, schedule
 * expiry, track analytics, and send to server.
 *
 * @param scheduleExpiry  Function that schedules client-side expiry removal.
 */
export function spawnBubble(
  x: number,
  y: number,
  z: number,
  color: string,
  scheduleExpiry: (bubbleId: string, delay: number) => void,
): BubbleInfo {
  const bubble = createBubbleInfo(x, y, z, color);
  const lifetime = bubble.expiresAt - bubble.createdAt;

  useBubbleStore.getState().addBubble(bubble);
  scheduleExpiry(bubble.bubbleId, lifetime);
  analytics.bubbleBlow(bubble.size);

  if (globalWsClient.isConnected()) {
    globalWsClient.send({
      type: 'blow',
      data: {
        size: bubble.size,
        color: bubble.color,
        pattern: 'plain',
        x: bubble.x,
        y: bubble.y,
        z: bubble.z,
        seed: bubble.seed,
        expiresAt: bubble.expiresAt,
      },
    });
  }

  return bubble;
}

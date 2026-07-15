/**
 * Shared bubble creation utilities.
 *
 * Extracted from BubbleControls and BubbleScene to eliminate
 * duplicated tint/randSize/makeId/spawn logic.
 */
import { useBubbleStore } from '@/stores/bubble-store';
import { useUIStore } from '@/stores/ui-store';
import { globalWsClient } from '@/lib/ws-client';
import { analytics } from '@/lib/analytics';
import { scheduleBubbleExpiry } from '@/lib/bubble-expiry';
import { showToast } from '@/components/shared/Toast';
import i18n from '@/i18n';
import { BUBBLE_LIFETIME } from '@bubbles/shared';
import type { BubbleInfo, BubbleSize } from '@bubbles/shared';

export const MAX_BUBBLES = 80;
const LIMIT_TOAST_COOLDOWN_MS = 3000;
let lastLimitToastAt = 0;

/** Generate a unique client-side bubble ID. */
export function makeId(): string {
  return crypto.randomUUID();
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
      Math.max(0, Math.min(255, n + Math.round((Math.random() - 0.5) * 20)));
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
  const { selectedSize: size, selectedPattern: pattern } = useUIStore.getState();
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
    pattern,
    seed: Math.random() * 10000,
    createdAt: now,
    expiresAt: now + lifetime,
  };
}

/**
 * Full spawn pipeline: create bubble info, insert into store, schedule
 * expiry, track analytics, and send to server.
 *
 */
export function spawnBubble(
  x: number,
  y: number,
  z: number,
  color: string,
): BubbleInfo | null {
  if (useBubbleStore.getState().bubbles.size >= MAX_BUBBLES) {
    const now = Date.now();
    if (now - lastLimitToastAt >= LIMIT_TOAST_COOLDOWN_MS) {
      lastLimitToastAt = now;
      showToast(i18n.t('controls.limitReached', { count: MAX_BUBBLES }), 'info');
    }
    return null;
  }

  const bubble = createBubbleInfo(x, y, z, color);

  useBubbleStore.getState().addBubble(bubble);
  scheduleBubbleExpiry(bubble.bubbleId, bubble.expiresAt);
  analytics.bubbleBlow(bubble.size);

  if (globalWsClient.isConnected()) {
    globalWsClient.send({
      type: 'blow',
      data: {
        bubbleId: bubble.bubbleId,
        size: bubble.size,
        color: bubble.color,
        pattern: bubble.pattern,
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

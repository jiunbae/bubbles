import { useMemo } from 'react';
import { useBubbleStore } from '@/stores/bubble-store';
import { BUBBLE_LIFETIME, BUBBLE_COLORS } from '@bubbles/shared';
import type { BubbleInfo, BubbleSize } from '@bubbles/shared';

const SIZES: BubbleSize[] = ['S', 'M', 'L'];

let idCounter = 0;
function generateId() {
  return `b_${Date.now()}_${++idCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

function tintColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const vary = (v: number) => Math.max(0, Math.min(255, v + Math.round((Math.random() - 0.5) * 2 * amount * 255)));
  return `#${vary(r).toString(16).padStart(2, '0')}${vary(g).toString(16).padStart(2, '0')}${vary(b).toString(16).padStart(2, '0')}`;
}

function randomSize(): BubbleSize {
  // Weighted: more M, fewer L
  const r = Math.random();
  if (r < 0.35) return 'S';
  if (r < 0.8) return 'M';
  return 'L';
}

// Standalone function — no hooks, no closures, no deps issues
// Directly calls the store. Can be called from anywhere including setInterval.
function createBubble(color: string, x: number, y: number, z: number) {
  const size = randomSize();
  const now = Date.now();
  const seed = Math.random() * 10000;
  const range = BUBBLE_LIFETIME[size];
  const lifetime = (range.min + Math.random() * (range.max - range.min)) * (0.7 + Math.random() * 0.6);
  const tintedColor = tintColor(color, 0.15);

  const bubble: BubbleInfo = {
    bubbleId: generateId(),
    blownBy: {
      sessionId: 'local',
      displayName: 'You',
      isAuthenticated: false,
      color: tintedColor,
    },
    x,
    y,
    z,
    size,
    color: tintedColor,
    pattern: 'plain',
    seed,
    createdAt: now,
    expiresAt: now + lifetime,
  };

  // Direct store access — no React dependency chain
  useBubbleStore.getState().addBubble(bubble);
  setTimeout(() => useBubbleStore.getState().removeBubble(bubble.bubbleId), lifetime);
}

// Blow from random position (button/spacebar)
export function blowBubbleRandom(color: string) {
  const angle = Math.random() * Math.PI * 2;
  const spread = Math.random() * 2.5;
  createBubble(
    color,
    Math.cos(angle) * spread,
    0.2 + Math.random() * 0.5,
    Math.sin(angle) * spread,
  );
}

// Blow at specific position (canvas click)
export function blowBubbleAtPosition(color: string, x: number, y: number, z: number) {
  createBubble(color, x, y, z);
}

// React hook — thin wrapper for reading state
export function useBubbles() {
  const bubblesMap = useBubbleStore((s) => s.bubbles);
  const removeBubble = useBubbleStore((s) => s.removeBubble);
  const bubbles = useMemo(() => Array.from(bubblesMap.values()), [bubblesMap]);

  return {
    bubbles,
    popBubble: (bubbleId: string) => removeBubble(bubbleId),
  };
}

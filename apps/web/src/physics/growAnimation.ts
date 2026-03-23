import { SIZE_RADIUS } from './bubblePhysics';
import type { BubbleSize } from '@bubbles/shared';

export interface GrowState {
  isGrowing: boolean;
  startTime: number;
  currentSize: number; // 0 to 1 (normalized)
  maxSize: BubbleSize; // from user selection
  position: [number, number, number];
}

/** Maximum grow duration in milliseconds */
export const MAX_GROW_DURATION = 2000;

/**
 * Calculate current bubble radius during the grow (hold-to-blow) phase.
 * Uses ease-out cubic: starts fast, slows down.
 */
export function getGrowRadius(elapsedMs: number, maxSize: BubbleSize): number {
  const t = Math.min(elapsedMs / MAX_GROW_DURATION, 1);
  const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
  return SIZE_RADIUS[maxSize] * eased;
}

/**
 * Calculate wobble offset during the grow phase.
 * The bubble isn't fully formed yet so it oscillates a bit.
 * Wobble amplitude grows with time (starts subtle, gets slightly more pronounced).
 */
export function getGrowWobble(elapsedMs: number): number {
  const rampUp = Math.min(elapsedMs / 500, 1); // fade in over 500ms
  return Math.sin(elapsedMs * 0.01) * 0.05 * rampUp;
}

/**
 * Create an initial GrowState.
 */
export function createGrowState(
  maxSize: BubbleSize,
  position: [number, number, number],
): GrowState {
  return {
    isGrowing: true,
    startTime: performance.now(),
    currentSize: 0,
    maxSize,
    position,
  };
}

/**
 * Get normalized progress of the grow animation (0-1).
 */
export function getGrowProgress(elapsedMs: number): number {
  const t = Math.min(elapsedMs / MAX_GROW_DURATION, 1);
  return 1 - Math.pow(1 - t, 3); // same ease-out cubic
}

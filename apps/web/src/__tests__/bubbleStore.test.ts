import { beforeEach, describe, expect, test } from 'bun:test';
import type { BubbleInfo } from '@bubbles/shared';
import { useBubbleStore } from '../stores/bubble-store';

function bubble(overrides: Partial<BubbleInfo> = {}): BubbleInfo {
  return {
    bubbleId: '123e4567-e89b-42d3-a456-426614174000',
    blownBy: {
      sessionId: 'local',
      displayName: 'You',
      isAuthenticated: false,
      color: '#87CEEB',
    },
    x: 0,
    y: 1,
    z: 0,
    size: 'M',
    color: '#87CEEB',
    pattern: 'plain',
    seed: 42,
    createdAt: 1_000,
    expiresAt: 21_000,
    ...overrides,
  };
}

describe('bubble store reconciliation', () => {
  beforeEach(() => {
    useBubbleStore.getState().clearBubbles();
    useBubbleStore.getState().clearPendingPops();
  });

  test('authoritative echo updates the optimistic object without changing its identity', () => {
    const optimistic = bubble();
    useBubbleStore.getState().addBubble(optimistic);

    const authoritative = bubble({
      blownBy: {
        sessionId: 'server-session',
        displayName: 'Guest 42',
        isAuthenticated: false,
        color: '#87CEEB',
      },
      createdAt: 1_100,
      expiresAt: 21_100,
    });
    useBubbleStore.getState().addBubble(authoritative);

    const reconciled = useBubbleStore.getState().bubbles.get(optimistic.bubbleId);
    expect(useBubbleStore.getState().bubbles.size).toBe(1);
    expect(reconciled).toBe(optimistic);
    expect(reconciled?.blownBy.displayName).toBe('Guest 42');
    expect(reconciled?.expiresAt).toBe(21_100);
  });
});

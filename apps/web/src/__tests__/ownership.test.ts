import { describe, expect, it } from 'bun:test';
import type { Place } from '@bubbles/shared';
import { isPlaceOwnedByCurrentUser } from '../lib/ownership';

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: 'place-1',
    name: 'Rooftop',
    theme: 'rooftop',
    createdBy: 'Alice',
    userCount: 0,
    bubbleCount: 0,
    totalVisitors: 0,
    totalBubbles: 0,
    createdAt: new Date(0).toISOString(),
    lastActivityAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('isPlaceOwnedByCurrentUser', () => {
  it('uses the request-scoped server result instead of display names', () => {
    expect(
      isPlaceOwnedByCurrentUser(place({ isOwnedByCurrentUser: false }), 'Alice')
    ).toBe(false);
    expect(
      isPlaceOwnedByCurrentUser(place({ isOwnedByCurrentUser: true }))
    ).toBe(true);
  });

  it('only falls back to a display name for legacy responses', () => {
    expect(isPlaceOwnedByCurrentUser(place(), 'Alice')).toBe(true);
    expect(isPlaceOwnedByCurrentUser(place(), 'Bob')).toBe(false);
  });
});

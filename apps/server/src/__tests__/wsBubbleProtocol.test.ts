import { describe, expect, it } from 'bun:test';
import {
  clampBubbleDuration,
  isValidClientBubbleId,
} from '../ws/bubbleProtocol';

describe('WebSocket bubble protocol', () => {
  it('accepts browser-generated UUIDs and rejects legacy or malformed IDs', () => {
    expect(isValidClientBubbleId('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    expect(isValidClientBubbleId('b1720000000000_1')).toBe(false);
    expect(isValidClientBubbleId('not-a-uuid')).toBe(false);
    expect(isValidClientBubbleId(undefined)).toBe(false);
  });

  it('clamps client expiry to the selected size lifetime range', () => {
    const now = 1_000_000;

    expect(clampBubbleDuration('S', now + 1_000, now)).toBe(12_000);
    expect(clampBubbleDuration('S', now + 99_000, now)).toBe(35_000);
    expect(clampBubbleDuration('L', now + 60_000, now)).toBe(60_000);
  });

  it('generates an in-range duration when the client expiry is absent', () => {
    const now = 1_000_000;
    expect(clampBubbleDuration('M', undefined, now, () => 0)).toBe(20_000);
    expect(clampBubbleDuration('M', undefined, now, () => 1)).toBe(50_000);
  });
});

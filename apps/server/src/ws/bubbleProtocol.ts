import { BUBBLE_LIFETIME } from '@bubbles/shared';
import type { BubbleSize } from '@bubbles/shared';

const CLIENT_BUBBLE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidClientBubbleId(value: unknown): value is string {
  return typeof value === 'string' && CLIENT_BUBBLE_ID_PATTERN.test(value);
}

export function clampBubbleDuration(
  size: BubbleSize,
  clientExpiresAt: unknown,
  now: number,
  random: () => number = Math.random,
): number {
  const lifetime = BUBBLE_LIFETIME[size];
  if (typeof clientExpiresAt === 'number' && Number.isFinite(clientExpiresAt)) {
    return Math.min(
      Math.max(clientExpiresAt - now, lifetime.min),
      lifetime.max,
    );
  }
  return lifetime.min + random() * (lifetime.max - lifetime.min);
}

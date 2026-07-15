import { useBubbleStore } from '@/stores/bubble-store';

const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Schedule (or replace) client-side removal for an authoritative expiry time. */
export function scheduleBubbleExpiry(bubbleId: string, expiresAt: number): void {
  cancelBubbleExpiry(bubbleId);

  const delay = Math.max(0, expiresAt - Date.now());
  const timer = setTimeout(() => {
    expiryTimers.delete(bubbleId);
    useBubbleStore.getState().removeBubble(bubbleId);
  }, delay);
  expiryTimers.set(bubbleId, timer);
}

export function cancelBubbleExpiry(bubbleId: string): void {
  const timer = expiryTimers.get(bubbleId);
  if (timer !== undefined) {
    clearTimeout(timer);
    expiryTimers.delete(bubbleId);
  }
}

export function clearBubbleExpiryTimers(): void {
  for (const timer of expiryTimers.values()) clearTimeout(timer);
  expiryTimers.clear();
}

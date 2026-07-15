import { useMemo } from 'react';
import { useBubbleStore } from '@/stores/bubble-store';
import { cancelBubbleExpiry } from '@/lib/bubble-expiry';

// React hook — thin wrapper for reading state
export function useBubbles() {
  const bubblesMap = useBubbleStore((s) => s.bubbles);
  const removeBubble = useBubbleStore((s) => s.removeBubble);
  const bubbles = useMemo(() => Array.from(bubblesMap.values()), [bubblesMap]);

  return {
    bubbles,
    popBubble: (bubbleId: string) => {
      cancelBubbleExpiry(bubbleId);
      removeBubble(bubbleId);
    },
  };
}

import { create } from 'zustand';
import type { BubbleInfo } from '@bubbles/shared';

interface BubbleState {
  bubbles: Map<string, BubbleInfo>;
  addBubble: (bubble: BubbleInfo) => void;
  removeBubble: (id: string) => void;
  clearBubbles: () => void;
  setBubbles: (bubbles: BubbleInfo[]) => void;
}

export const useBubbleStore = create<BubbleState>((set) => ({
  bubbles: new Map(),

  addBubble: (bubble: BubbleInfo) =>
    set((state) => {
      const next = new Map(state.bubbles);
      next.set(bubble.bubbleId, bubble);
      return { bubbles: next };
    }),

  removeBubble: (id: string) =>
    set((state) => {
      if (!state.bubbles.has(id)) return state; // no-op, no new Map
      const next = new Map(state.bubbles);
      next.delete(id);
      return { bubbles: next };
    }),

  clearBubbles: () => set({ bubbles: new Map() }),

  setBubbles: (bubbles: BubbleInfo[]) =>
    set({
      bubbles: new Map(bubbles.map((b) => [b.bubbleId, b])),
    }),
}));

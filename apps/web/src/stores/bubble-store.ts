import { create } from 'zustand';
import type { BubbleInfo } from '@bubbles/shared';

export interface PendingPop {
  bubbleId: string;
  x: number;
  y: number;
  z: number;
  color: string;
  size: 'S' | 'M' | 'L';
}

interface BubbleState {
  bubbles: Map<string, BubbleInfo>;
  pendingPops: PendingPop[];
  addBubble: (bubble: BubbleInfo) => void;
  removeBubble: (id: string) => void;
  popBubble: (id: string) => void; // remove + queue pop effect
  clearBubbles: () => void;
  setBubbles: (bubbles: BubbleInfo[]) => void;
  clearPendingPops: () => void;
}

export const useBubbleStore = create<BubbleState>((set) => ({
  bubbles: new Map(),
  pendingPops: [],

  addBubble: (bubble: BubbleInfo) =>
    set((state) => {
      const next = new Map(state.bubbles);
      const existing = next.get(bubble.bubbleId);
      if (existing) {
        // BubbleInstances retains the original object outside React for its
        // animation state. Reconcile the optimistic object in place so the
        // server's authoritative owner/timestamps are visible without
        // restarting the animation or temporarily changing the Map size.
        Object.assign(existing, bubble);
        next.set(bubble.bubbleId, existing);
      } else {
        next.set(bubble.bubbleId, bubble);
      }
      return { bubbles: next };
    }),

  removeBubble: (id: string) =>
    set((state) => {
      if (!state.bubbles.has(id)) return state;
      const next = new Map(state.bubbles);
      next.delete(id);
      return { bubbles: next };
    }),

  // Remove bubble AND queue a pop effect
  popBubble: (id: string) =>
    set((state) => {
      const bubble = state.bubbles.get(id);
      if (!bubble) return state;
      const next = new Map(state.bubbles);
      next.delete(id);
      return {
        bubbles: next,
        pendingPops: [...state.pendingPops, {
          bubbleId: id,
          x: bubble.x,
          y: bubble.y,
          z: bubble.z,
          color: bubble.color,
          size: bubble.size,
        }],
      };
    }),

  clearBubbles: () => set({ bubbles: new Map() }),

  setBubbles: (bubbles: BubbleInfo[]) =>
    set({
      bubbles: new Map(bubbles.map((b) => [b.bubbleId, b])),
    }),

  clearPendingPops: () => set({ pendingPops: [] }),
}));

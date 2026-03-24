import { create } from 'zustand';

export interface RemoteCursor {
  x: number;
  y: number;
  color: string;
  displayName: string;
  lastUpdate: number;
}

interface CursorState {
  remoteCursors: Map<string, RemoteCursor>;
  updateCursor: (sessionId: string, x: number, y: number, color: string, displayName: string) => void;
  removeCursor: (sessionId: string) => void;
  pruneStale: (maxAge: number) => void;
}

export const useCursorStore = create<CursorState>((set) => ({
  remoteCursors: new Map(),

  updateCursor: (sessionId, x, y, color, displayName) =>
    set((state) => {
      const next = new Map(state.remoteCursors);
      next.set(sessionId, { x, y, color, displayName, lastUpdate: Date.now() });
      return { remoteCursors: next };
    }),

  removeCursor: (sessionId) =>
    set((state) => {
      const next = new Map(state.remoteCursors);
      next.delete(sessionId);
      return { remoteCursors: next };
    }),

  pruneStale: (maxAge: number) =>
    set((state) => {
      const now = Date.now();
      let changed = false;
      const next = new Map(state.remoteCursors);
      for (const [id, cursor] of next) {
        if (now - cursor.lastUpdate > maxAge) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? { remoteCursors: next } : state;
    }),
}));

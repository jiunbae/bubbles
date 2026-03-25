import { create } from 'zustand';
import type { BubbleSize, BubblePattern } from '@bubbles/shared';

type AppMode = 'visual' | 'stealth';
type InteractionMode = 'blow' | 'pop';

interface UIState {
  mode: AppMode;
  interactionMode: InteractionMode;
  isSoundEnabled: boolean;
  isAmbientEnabled: boolean;
  ambientVolume: number;
  selectedSize: BubbleSize;
  selectedColor: string;
  selectedPattern: BubblePattern;
  setMode: (mode: AppMode) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  toggleInteractionMode: () => void;
  toggleSound: () => void;
  toggleAmbient: () => void;
  setAmbientVolume: (v: number) => void;
  setSelectedSize: (size: BubbleSize) => void;
  setSelectedColor: (color: string) => void;
  setSelectedPattern: (pattern: BubblePattern) => void;
}

function loadMode(): AppMode {
  try {
    const stored = localStorage.getItem('bubbles_mode');
    if (stored === 'visual' || stored === 'stealth') return stored;
  } catch {
    // ignore
  }
  return 'visual';
}

function loadAmbientEnabled(): boolean {
  try {
    const stored = localStorage.getItem('bubbles_ambient_enabled');
    if (stored === 'false') return false;
  } catch {
    // ignore
  }
  return true;
}

function loadAmbientVolume(): number {
  try {
    const stored = localStorage.getItem('bubbles_ambient_volume');
    if (stored !== null) {
      const v = parseFloat(stored);
      if (!isNaN(v) && v >= 0 && v <= 1) return v;
    }
  } catch {
    // ignore
  }
  return 0.3;
}

export const useUIStore = create<UIState>((set) => ({
  mode: loadMode(),
  interactionMode: 'blow' as InteractionMode,
  isSoundEnabled: true,
  isAmbientEnabled: loadAmbientEnabled(),
  ambientVolume: loadAmbientVolume(),
  selectedSize: 'M',
  selectedColor: '#87CEEB',
  selectedPattern: 'plain',

  setMode: (mode: AppMode) => {
    localStorage.setItem('bubbles_mode', mode);
    set({ mode });
  },

  setInteractionMode: (interactionMode: InteractionMode) => set({ interactionMode }),

  toggleInteractionMode: () => set((state) => ({
    interactionMode: state.interactionMode === 'blow' ? 'pop' : 'blow',
  })),

  toggleSound: () => set((state) => ({ isSoundEnabled: !state.isSoundEnabled })),

  toggleAmbient: () => set((state) => {
    const next = !state.isAmbientEnabled;
    localStorage.setItem('bubbles_ambient_enabled', String(next));
    return { isAmbientEnabled: next };
  }),

  setAmbientVolume: (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    localStorage.setItem('bubbles_ambient_volume', String(clamped));
    set({ ambientVolume: clamped });
  },

  setSelectedSize: (size: BubbleSize) => set({ selectedSize: size }),

  setSelectedColor: (color: string) => set({ selectedColor: color }),

  setSelectedPattern: (pattern: BubblePattern) =>
    set({ selectedPattern: pattern }),
}));

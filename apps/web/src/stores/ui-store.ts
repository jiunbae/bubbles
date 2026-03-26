import { create } from 'zustand';
import type { BubbleSize, BubblePattern } from '@bubbles/shared';

type AppMode = 'visual' | 'stealth';
type InteractionMode = 'blow' | 'pop';

interface UIState {
  mode: AppMode;
  interactionMode: InteractionMode;
  isSoundEnabled: boolean;
  selectedSize: BubbleSize;
  selectedColor: string;
  selectedPattern: BubblePattern;
  setMode: (mode: AppMode) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  toggleInteractionMode: () => void;
  toggleSound: () => void;
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

export const useUIStore = create<UIState>((set) => ({
  mode: loadMode(),
  interactionMode: 'blow' as InteractionMode,
  isSoundEnabled: true,
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

  setSelectedSize: (size: BubbleSize) => set({ selectedSize: size }),

  setSelectedColor: (color: string) => set({ selectedColor: color }),

  setSelectedPattern: (pattern: BubblePattern) =>
    set({ selectedPattern: pattern }),
}));

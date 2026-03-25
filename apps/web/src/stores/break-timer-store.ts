import { create } from 'zustand';

const STORAGE_KEY = 'bubbles_break_stats';

interface PersistedStats {
  todayCount: number;
  todayDate: string;
  totalAllTime: number;
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadStats(): PersistedStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedStats;
      // Reset todayCount if date changed
      if (parsed.todayDate !== getTodayDate()) {
        return { todayCount: 0, todayDate: getTodayDate(), totalAllTime: parsed.totalAllTime };
      }
      return parsed;
    }
  } catch {
    // ignore
  }
  return { todayCount: 0, todayDate: getTodayDate(), totalAllTime: 0 };
}

function saveStats(stats: PersistedStats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

interface BreakTimerState {
  // Timer state
  isActive: boolean;
  duration: number;
  remaining: number;
  isComplete: boolean;
  startedAt: number | null;

  // Daily tracking (persisted to localStorage)
  todayCount: number;
  todayDate: string;
  totalAllTime: number;

  // Actions
  start: (durationSec: number) => void;
  cancel: () => void;
  tick: () => void;
  clearComplete: () => void;
}

const initialStats = loadStats();

export const useBreakTimerStore = create<BreakTimerState>((set, get) => ({
  isActive: false,
  duration: 0,
  remaining: 0,
  isComplete: false,
  startedAt: null,

  todayCount: initialStats.todayCount,
  todayDate: initialStats.todayDate,
  totalAllTime: initialStats.totalAllTime,

  start: (durationSec: number) => {
    set({
      isActive: true,
      duration: durationSec,
      remaining: durationSec,
      isComplete: false,
      startedAt: Date.now(),
    });
  },

  cancel: () => {
    set({
      isActive: false,
      duration: 0,
      remaining: 0,
      isComplete: false,
      startedAt: null,
    });
  },

  tick: () => {
    const { isActive, duration, startedAt } = get();
    if (!isActive || !startedAt) return;

    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const remaining = Math.max(0, duration - elapsed);

    if (remaining <= 0) {
      // Break complete — update stats
      const today = getTodayDate();
      const state = get();
      const todayCount = state.todayDate === today ? state.todayCount + 1 : 1;
      const totalAllTime = state.totalAllTime + 1;
      const stats: PersistedStats = { todayCount, todayDate: today, totalAllTime };
      saveStats(stats);

      set({
        isActive: false,
        remaining: 0,
        isComplete: true,
        startedAt: null,
        todayCount,
        todayDate: today,
        totalAllTime,
      });
    } else {
      set({ remaining });
    }
  },

  clearComplete: () => {
    set({ isComplete: false });
  },
}));

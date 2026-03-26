import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakTimerStore } from '@/stores/break-timer-store';

const TICK_MS = 250;
const AUTO_DISMISS_MS = 3000;

const DURATION_PRESETS = [
  { key: 'duration1', seconds: 60 },
  { key: 'duration3', seconds: 180 },
  { key: 'duration5', seconds: 300 },
] as const;

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function BreakTimer() {
  const { t } = useTranslation();
  const isActive = useBreakTimerStore((s) => s.isActive);
  const remaining = useBreakTimerStore((s) => s.remaining);
  const duration = useBreakTimerStore((s) => s.duration);
  const isComplete = useBreakTimerStore((s) => s.isComplete);
  const todayCount = useBreakTimerStore((s) => s.todayCount);
  const todayDate = useBreakTimerStore((s) => s.todayDate);
  const start = useBreakTimerStore((s) => s.start);
  const cancel = useBreakTimerStore((s) => s.cancel);
  const tick = useBreakTimerStore((s) => s.tick);
  const clearComplete = useBreakTimerStore((s) => s.clearComplete);

  const [isExpanded, setIsExpanded] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const dismissRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tick interval while active
  useEffect(() => {
    if (isActive) {
      intervalRef.current = window.setInterval(tick, TICK_MS);
    }
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, tick]);

  // Auto-dismiss complete state
  useEffect(() => {
    if (isComplete) {
      dismissRef.current = window.setTimeout(clearComplete, AUTO_DISMISS_MS);
    }
    return () => {
      if (dismissRef.current !== null) {
        window.clearTimeout(dismissRef.current);
        dismissRef.current = null;
      }
    };
  }, [isComplete, clearComplete]);

  // Close panel on outside click
  useEffect(() => {
    if (!isExpanded) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isExpanded]);

  const today = new Date().toISOString().slice(0, 10);
  const displayCount = todayDate === today ? todayCount : 0;
  const progress = duration > 0 ? (duration - remaining) / duration : 0;

  // When timer is active, always show the countdown (compact)
  if (isActive && !isComplete) {
    return (
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+80px)] left-3 z-[100] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:left-4">
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[rgba(20,20,30,0.85)] px-3 py-1.5 shadow-lg backdrop-blur-xl">
          {/* Mini progress ring */}
          <svg className="h-6 w-6 -rotate-90" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" />
            <circle
              cx="12" cy="12" r="10" fill="none"
              stroke="rgba(100,180,255,0.8)" strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${progress * 62.83} 62.83`}
            />
          </svg>
          <span className="text-sm font-bold tabular-nums tracking-wide text-white">
            {formatTime(remaining)}
          </span>
          <button
            onClick={cancel}
            className="ml-0.5 rounded-full p-0.5 text-white/50 transition-colors hover:text-white"
            title={t('breakTimer.cancel')}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Complete state — brief celebration
  if (isComplete) {
    return (
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+80px)] left-3 z-[100] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:left-4">
        <div className="animate-[scaleIn_0.3s_ease-out] rounded-full border border-white/15 bg-[rgba(20,20,30,0.85)] px-4 py-2 shadow-lg backdrop-blur-xl">
          <span className="text-sm font-semibold text-white">
            {'\uD83C\uDF89'} {t('breakTimer.complete')}
          </span>
        </div>
        <style>{`
          @keyframes scaleIn {
            from { transform: scale(0.8); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // Idle state — small trigger button that expands to show presets
  return (
    <div
      ref={containerRef}
      className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+80px)] left-3 z-[100] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:left-4"
    >
      {isExpanded ? (
        <div className="rounded-2xl border border-white/15 bg-[rgba(20,20,30,0.85)] p-3 shadow-lg backdrop-blur-xl">
          <div className="mb-2 text-xs font-medium text-white/70">
            {'\u2615'} {t('breakTimer.startBreak')}
          </div>
          <div className="flex gap-1.5">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.key}
                onClick={() => {
                  start(preset.seconds);
                  setIsExpanded(false);
                }}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent/30"
              >
                {t(`breakTimer.${preset.key}`)}
              </button>
            ))}
          </div>
          {displayCount > 0 && (
            <div className="mt-2 text-center text-[10px] text-white/40">
              {t('breakTimer.todayCount', { count: displayCount })}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-1.5 rounded-full border border-white/15 bg-[rgba(20,20,30,0.7)] px-3 py-1.5 text-xs font-medium text-white/70 shadow-md backdrop-blur-xl transition-colors hover:bg-[rgba(20,20,30,0.9)] hover:text-white"
          title={t('breakTimer.startBreak')}
        >
          {'\u2615'}
          {displayCount > 0 && (
            <span className="tabular-nums text-white/50">{displayCount}</span>
          )}
        </button>
      )}
    </div>
  );
}

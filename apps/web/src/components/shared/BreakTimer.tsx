import { useEffect, useRef } from 'react';
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

  const intervalRef = useRef<number | null>(null);
  const dismissRef = useRef<number | null>(null);

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

  // Check if todayCount is still for today (date may have rolled over)
  const today = new Date().toISOString().slice(0, 10);
  const displayCount = todayDate === today ? todayCount : 0;

  const progress = duration > 0 ? (duration - remaining) / duration : 0;

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)',
      left: 16,
      zIndex: 10000,
      pointerEvents: 'auto',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: 'rgba(20, 20, 30, 0.8)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 16,
        padding: '12px 16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        minWidth: 160,
      }}>
        {/* Complete state */}
        {isComplete && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              color: '#fff',
              fontSize: 16,
              fontWeight: 700,
              marginBottom: 4,
            }}>
              {'\uD83C\uDF89'} {t('breakTimer.complete')}
            </div>
          </div>
        )}

        {/* Active state */}
        {isActive && !isComplete && (
          <div style={{ textAlign: 'center' }}>
            {/* Progress bar */}
            <div style={{
              width: '100%',
              height: 4,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.15)',
              marginBottom: 10,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${progress * 100}%`,
                height: '100%',
                borderRadius: 2,
                background: 'rgba(100, 180, 255, 0.8)',
                transition: 'width 0.25s linear',
              }} />
            </div>
            <div style={{
              color: '#fff',
              fontSize: 28,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: 2,
              marginBottom: 8,
            }}>
              {formatTime(remaining)}
            </div>
            <button
              onClick={cancel}
              style={{
                padding: '6px 16px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.7)',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {t('breakTimer.cancel')}
            </button>
          </div>
        )}

        {/* Idle state */}
        {!isActive && !isComplete && (
          <div>
            <div style={{
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 8,
            }}>
              {'\u2615'} {t('breakTimer.startBreak')}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => start(preset.seconds)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'system-ui, sans-serif',
                    transition: 'all 0.15s',
                  }}
                  onPointerEnter={(e) => {
                    (e.target as HTMLButtonElement).style.background = 'rgba(100, 180, 255, 0.3)';
                  }}
                  onPointerLeave={(e) => {
                    (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
                  }}
                >
                  {t(`breakTimer.${preset.key}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Daily count */}
        <div style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: 11,
          marginTop: 8,
          textAlign: 'center',
        }}>
          {displayCount > 0
            ? t('breakTimer.todayCount', { count: displayCount })
            : t('breakTimer.todayNone')
          }
        </div>
      </div>
    </div>
  );
}

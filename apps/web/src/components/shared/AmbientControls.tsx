import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/ui-store';

/**
 * Ambient sound controls — icon button + dropdown with toggle and volume slider.
 * Glass-morphism dropdown style matching existing UI.
 */
export function AmbientControls() {
  const { t } = useTranslation();
  const isAmbientEnabled = useUIStore((s) => s.isAmbientEnabled);
  const ambientVolume = useUIStore((s) => s.ambientVolume);
  const toggleAmbient = useUIStore((s) => s.toggleAmbient);
  const setAmbientVolume = useUIStore((s) => s.setAmbientVolume);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="rounded-md p-2 text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
        title={t('ambient.toggle')}
      >
        {/* Waves / ambient sound icon */}
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {isAmbientEnabled ? (
            <>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13" />
              <circle cx="6" cy="18" r="3" fill="none" />
              <circle cx="18" cy="16" r="3" fill="none" />
            </>
          ) : (
            <>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13" />
              <circle cx="6" cy="18" r="3" fill="none" />
              <circle cx="18" cy="16" r="3" fill="none" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
            </>
          )}
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 min-w-[200px] rounded-lg border border-border bg-bg-card/90 p-3 shadow-lg backdrop-blur-md">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary">{t('ambient.toggle')}</span>
            <button
              onClick={toggleAmbient}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                isAmbientEnabled ? 'bg-accent' : 'bg-bg-secondary'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  isAmbientEnabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Status text */}
          <div className="mt-1 text-xs text-text-muted">
            {isAmbientEnabled ? t('ambient.on') : t('ambient.off')}
          </div>

          {/* Volume slider */}
          <div className="mt-3">
            <label className="mb-1.5 block text-xs text-text-secondary">{t('ambient.volume')}</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={ambientVolume}
              onChange={(e) => setAmbientVolume(parseFloat(e.target.value))}
              disabled={!isAmbientEnabled}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-bg-secondary accent-accent disabled:cursor-not-allowed disabled:opacity-40"
            />
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/ui-store';

export function ModeSwitch() {
  const { t } = useTranslation();
  const { mode, setMode } = useUIStore();

  const toggle = () => {
    setMode(mode === 'visual' ? 'stealth' : 'visual');
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const label =
    mode === 'visual'
      ? t('mode.switchToStealth')
      : t('mode.switchToVisual');

  return (
    <button
      onClick={toggle}
      className="group relative rounded-md p-1.5 text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
      title={label}
      aria-label={label}
    >
      {mode === 'visual' ? (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
      ) : (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.5 6.5m3.378 3.378L6.5 6.5m0 0L3 3m3.5 3.5l11 11m0 0l3.5 3.5m-3.5-3.5l3.5 3.5"
          />
        </svg>
      )}

      {/* Tooltip */}
      <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-bg-card px-2 py-1 text-xs text-text-secondary opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label} (Ctrl+Shift+M)
      </span>
    </button>
  );
}

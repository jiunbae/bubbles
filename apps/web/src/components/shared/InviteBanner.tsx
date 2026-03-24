import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showToast } from '@/components/shared/Toast';

const SESSION_KEY = 'bubbles_invite_shown';
const DELAY_MS = 30_000;

export function InviteBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;

    const timer = setTimeout(() => {
      if (!sessionStorage.getItem(SESSION_KEY)) {
        setVisible(true);
        sessionStorage.setItem(SESSION_KEY, '1');
      }
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast(t('place.linkCopied'), 'success');
    } catch {
      // Fallback: do nothing
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed left-1/2 top-16 z-40 -translate-x-1/2 animate-[slideUp_0.3s_ease-out]">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur-sm">
        <span className="text-sm text-text-secondary">
          {t('place.inviteBanner')}
        </span>
        <button
          onClick={handleCopyLink}
          className="whitespace-nowrap rounded-lg bg-accent/20 px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/30"
        >
          {t('place.copyLink')}
        </button>
        <button
          onClick={() => setVisible(false)}
          className="rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
          aria-label={t('place.inviteDismiss')}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translate(-50%, 100%); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

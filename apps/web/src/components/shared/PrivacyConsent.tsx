import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrivacyConsent } from '@/providers/PrivacyProvider';
import { Z_INDEX } from '@/lib/z-index';
import type { PrivacyChoices } from '@/lib/privacy-consent';
import { ADVERTISING_AVAILABLE } from '@/lib/advertising';

const ACCEPT_ALL: PrivacyChoices = {
  analytics: true,
  advertising: ADVERTISING_AVAILABLE,
};
const REJECT_OPTIONAL: PrivacyChoices = {
  analytics: false,
  advertising: false,
};

function PrivacySettingsDialog({ returnFocusId }: { returnFocusId: string }) {
  const { t } = useTranslation();
  const { choices, closeSettings, saveChoices } = usePrivacyConsent();
  const [draft, setDraft] = useState<PrivacyChoices>(choices);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstControlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstControlRef.current?.focus();
    return () => {
      window.setTimeout(() => {
        const returnTarget =
          document.getElementById(returnFocusId) ??
          document.getElementById('privacy-settings-button');
        returnTarget?.focus();
      }, 0);
    };
  }, [returnFocusId]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSettings();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), a[href]'
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      style={{ zIndex: Z_INDEX.PRIVACY }}
    >
      <dialog
        open
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby="privacy-settings-title"
        aria-describedby="privacy-settings-description"
        onKeyDown={handleKeyDown}
        className="relative m-0 max-h-[min(90vh,44rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-bg-card p-5 text-left text-text-primary shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="privacy-settings-title"
              className="text-xl font-semibold text-text-primary"
            >
              {t('privacy.settingsTitle')}
            </h2>
            <p
              id="privacy-settings-description"
              className="mt-2 text-sm leading-6 text-text-secondary"
            >
              {t(
                ADVERTISING_AVAILABLE
                  ? 'privacy.settingsDescription'
                  : 'privacy.settingsDescriptionNoAds'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={closeSettings}
            aria-label={t('privacy.closeSettings')}
            className="shrink-0 rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <div className="rounded-xl border border-border bg-bg-primary/40 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium text-text-primary">
                  {t('privacy.essentialTitle')}
                </h3>
                <p className="mt-1 text-sm leading-5 text-text-secondary">
                  {t('privacy.essentialDescription')}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
                {t('privacy.alwaysActive')}
              </span>
            </div>
          </div>

          <label
            aria-label={t('privacy.analyticsTitle')}
            className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-bg-primary/40 p-4 transition-colors hover:border-accent/60"
          >
            <span>
              <span className="block font-medium text-text-primary">
                {t('privacy.analyticsTitle')}
              </span>
              <span className="mt-1 block text-sm leading-5 text-text-secondary">
                {t('privacy.analyticsDescription')}
              </span>
            </span>
            <input
              ref={firstControlRef}
              type="checkbox"
              checked={draft.analytics}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  analytics: event.target.checked,
                }))
              }
              className="mt-1 h-5 w-5 shrink-0 accent-accent"
            />
          </label>

          {ADVERTISING_AVAILABLE && (
            <label
              aria-label={t('privacy.advertisingTitle')}
              className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-bg-primary/40 p-4 transition-colors hover:border-accent/60"
            >
              <span>
                <span className="block font-medium text-text-primary">
                  {t('privacy.advertisingTitle')}
                </span>
                <span className="mt-1 block text-sm leading-5 text-text-secondary">
                  {t('privacy.advertisingDescription')}
                </span>
              </span>
              <input
                type="checkbox"
                checked={draft.advertising}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    advertising: event.target.checked,
                  }))
                }
                className="mt-1 h-5 w-5 shrink-0 accent-accent"
              />
            </label>
          )}
        </div>

        <p className="mt-4 text-xs leading-5 text-text-muted">
          {t('privacy.storageNote')}{' '}
          <a
            href="/privacy"
            className="text-text-secondary underline decoration-text-muted underline-offset-2 hover:text-text-primary"
          >
            {t('privacy.noticeLink')}
          </a>{' '}
          <span aria-hidden="true">·</span>{' '}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noreferrer"
            className="text-text-secondary underline decoration-text-muted underline-offset-2 hover:text-text-primary"
          >
            {t('privacy.googlePrivacyPolicy')}
          </a>
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => saveChoices(REJECT_OPTIONAL)}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t('privacy.rejectOptional')}
          </button>
          <button
            type="button"
            onClick={() => saveChoices(draft)}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card"
          >
            {t('privacy.saveSettings')}
          </button>
        </div>
      </dialog>
    </div>
  );
}

export function PrivacyConsent() {
  const { t } = useTranslation();
  const { hasDecision, isSettingsOpen, openSettings, saveChoices } =
    usePrivacyConsent();
  const returnFocusIdRef = useRef('privacy-customize-button');

  const handleOpenSettings = (returnFocusId: string) => {
    returnFocusIdRef.current = returnFocusId;
    openSettings();
  };

  return (
    <>
      {!hasDecision && !isSettingsOpen && (
        <section
          role="dialog"
          aria-labelledby="privacy-consent-title"
          aria-describedby="privacy-consent-description"
          className="fixed inset-x-3 bottom-3 mx-auto max-w-3xl rounded-2xl border border-border bg-bg-card/95 p-4 shadow-2xl backdrop-blur-md sm:bottom-5 sm:p-5"
          style={{ zIndex: Z_INDEX.PRIVACY }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <h2
                id="privacy-consent-title"
                className="font-semibold text-text-primary"
              >
                {t('privacy.consentTitle')}
              </h2>
              <p
                id="privacy-consent-description"
                className="mt-1 text-sm leading-5 text-text-secondary"
              >
                {t(
                  ADVERTISING_AVAILABLE
                    ? 'privacy.consentDescription'
                    : 'privacy.consentDescriptionNoAds'
                )}
              </p>
              <a
                href="/privacy"
                className="mt-1 inline-block text-xs text-text-secondary underline decoration-text-muted underline-offset-2 hover:text-text-primary"
              >
                {t('privacy.noticeLink')}
              </a>
            </div>
            <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
              <button
                type="button"
                onClick={() => saveChoices(REJECT_OPTIONAL)}
                className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {t('privacy.rejectOptional')}
              </button>
              <button
                id="privacy-customize-button"
                type="button"
                onClick={() => handleOpenSettings('privacy-customize-button')}
                className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {t('privacy.customize')}
              </button>
              <button
                type="button"
                onClick={() => saveChoices(ACCEPT_ALL)}
                className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card"
              >
                {t('privacy.acceptAll')}
              </button>
            </div>
          </div>
        </section>
      )}

      {hasDecision && !isSettingsOpen && (
        <button
          id="privacy-settings-button"
          type="button"
          onClick={() => handleOpenSettings('privacy-settings-button')}
          className="fixed bottom-3 left-3 flex items-center gap-1.5 rounded-full border border-border bg-bg-card/90 px-3 py-2 text-xs font-medium text-text-secondary shadow-lg backdrop-blur-sm transition-colors hover:bg-bg-card hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:bottom-4 sm:left-40"
          style={{ zIndex: Z_INDEX.PRIVACY_BUTTON }}
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3.5 5.5 6v5.2c0 4.2 2.7 7.6 6.5 9.3 3.8-1.7 6.5-5.1 6.5-9.3V6L12 3.5Z"
            />
            <path strokeLinecap="round" d="M9.5 12 11 13.5l3.5-3.5" />
          </svg>
          {t('privacy.settingsButton')}
        </button>
      )}

      {isSettingsOpen && (
        <PrivacySettingsDialog returnFocusId={returnFocusIdRef.current} />
      )}
    </>
  );
}

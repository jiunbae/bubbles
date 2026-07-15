import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { ADVERTISING_AVAILABLE } from '@/lib/advertising';

export function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <main className="min-h-screen bg-bg-primary px-4 pb-48 pt-8 text-text-primary sm:pb-32 sm:pt-12">
      <div className="mx-auto max-w-3xl">
        <nav
          aria-label={t('privacyNotice.navigationLabel')}
          className="mb-10 flex items-center justify-between gap-4"
        >
          <Link
            to="/"
            className="rounded-lg text-sm font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ← {t('common.backToLobby')}
          </Link>
          <LanguageSwitcher />
        </nav>

        <header className="border-b border-border pb-8">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">
            Bubbles
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {t('privacyNotice.pageTitle')}
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-text-secondary">
            {t('privacyNotice.introduction')}
          </p>
        </header>

        <div className="space-y-10 py-8">
          <section aria-labelledby="privacy-essential-heading">
            <h2
              id="privacy-essential-heading"
              className="text-xl font-semibold"
            >
              {t('privacyNotice.essentialHeading')}
            </h2>
            <ul className="mt-4 list-disc space-y-3 pl-5 leading-7 text-text-secondary marker:text-accent">
              <li>{t('privacyNotice.essentialSession')}</li>
              <li>{t('privacyNotice.essentialAccount')}</li>
              <li>{t('privacyNotice.essentialPreferences')}</li>
              <li>{t('privacyNotice.essentialRooms')}</li>
            </ul>
          </section>

          <section aria-labelledby="privacy-optional-heading">
            <h2 id="privacy-optional-heading" className="text-xl font-semibold">
              {t('privacyNotice.optionalHeading')}
            </h2>
            <div className="mt-4 space-y-4">
              <article className="rounded-xl border border-border bg-bg-card/60 p-5">
                <h3 className="font-medium">{t('privacy.analyticsTitle')}</h3>
                <p className="mt-2 leading-7 text-text-secondary">
                  {t('privacyNotice.analyticsDetails')}
                </p>
              </article>
              <article className="rounded-xl border border-border bg-bg-card/60 p-5">
                <h3 className="font-medium">{t('privacy.advertisingTitle')}</h3>
                <p className="mt-2 leading-7 text-text-secondary">
                  {t(
                    ADVERTISING_AVAILABLE
                      ? 'privacyNotice.advertisingAvailable'
                      : 'privacyNotice.advertisingUnavailable'
                  )}
                </p>
              </article>
            </div>
            <p className="mt-4 text-sm leading-6 text-text-secondary">
              {t('privacyNotice.googleServices')}{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-text-muted underline-offset-2 hover:text-text-primary"
              >
                {t('privacy.googlePrivacyPolicy')}
              </a>
            </p>
          </section>

          <section aria-labelledby="privacy-controls-heading">
            <h2 id="privacy-controls-heading" className="text-xl font-semibold">
              {t('privacyNotice.controlsHeading')}
            </h2>
            <ul className="mt-4 list-disc space-y-3 pl-5 leading-7 text-text-secondary marker:text-accent">
              <li>{t('privacyNotice.controlsDefault')}</li>
              <li>{t('privacyNotice.controlsRevisit')}</li>
              <li>{t('privacyNotice.controlsRevoke')}</li>
              <li>{t('privacyNotice.controlsStorage')}</li>
            </ul>
          </section>

          <aside className="rounded-xl border border-accent/30 bg-accent/10 p-5 text-sm leading-6 text-text-secondary">
            <h2 className="font-semibold text-text-primary">
              {t('privacyNotice.reviewHeading')}
            </h2>
            <p className="mt-2">{t('privacyNotice.reviewNote')}</p>
          </aside>
        </div>
      </div>
    </main>
  );
}

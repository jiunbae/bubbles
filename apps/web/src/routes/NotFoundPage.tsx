import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 text-center">
      <div className="text-7xl opacity-60">404</div>
      <h1 className="text-2xl font-semibold text-text-primary">
        {t('notFound.title')}
      </h1>
      <p className="text-text-secondary">
        {t('notFound.description')}
      </p>
      <Link
        to="/"
        className="rounded-lg bg-accent px-5 py-2.5 text-white transition-colors hover:bg-accent-hover"
      >
        {t('common.backToLobby')}
      </Link>
    </div>
  );
}

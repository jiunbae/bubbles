import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createPlace } from '@/lib/api';
import { MAX_PLACE_NAME_LENGTH, PLACE_THEMES, type PlaceTheme } from '@bubbles/shared';
import { showToast } from '@/components/shared/Toast';

export function CreatePlaceForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<PlaceTheme>('rooftop');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const isValid = trimmedName.length >= 1 && trimmedName.length <= MAX_PLACE_NAME_LENGTH;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const place = await createPlace(trimmedName, theme);
      showToast(`Created "${place.name}"`, 'success');
      navigate(`/place/${place.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('errors.failedToCreatePlace');
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-text-muted transition-all duration-200 hover:border-accent/50 hover:text-text-secondary"
      >
        <svg
          className="h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        <span className="text-sm font-medium">{t('lobby.newPlace')}</span>
      </button>
    );
  }

  const themeLabels: Record<string, { label: string; description: string }> = {
    rooftop: { label: t('themes.rooftop'), description: t('themes.rooftopDesc') },
    park: { label: t('themes.park'), description: t('themes.parkDesc') },
    alley: { label: t('themes.alley'), description: t('themes.alleyDesc') },
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-bg-card p-5"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        placeholder={t('lobby.placeNamePlaceholder')}
        maxLength={MAX_PLACE_NAME_LENGTH}
        autoFocus
        className="rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
      />

      {/* Theme selection */}
      <div className="flex gap-2">
        {PLACE_THEMES.map((thm) => (
          <button
            key={thm.value}
            type="button"
            onClick={() => setTheme(thm.value)}
            className={`flex-1 flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition-all ${
              theme === thm.value
                ? 'border-accent bg-accent/10 text-text-primary'
                : 'border-border bg-bg-primary text-text-muted hover:border-accent/30'
            }`}
          >
            <span className="text-lg">{thm.emoji}</span>
            <span className="font-medium">{themeLabels[thm.value]?.label ?? thm.label}</span>
            <span className="text-[10px] opacity-70">{themeLabels[thm.value]?.description ?? thm.description}</span>
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? t('common.creating') : t('common.create')}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setName('');
            setTheme('rooftop');
            setError(null);
          }}
          className="rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-secondary"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PLACE_THEMES, type Place } from '@bubbles/shared';

interface PlaceCardProps {
  place: Place;
}

export function PlaceCard({ place }: PlaceCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/place/${place.id}`)}
      className="group flex min-h-[100px] flex-col gap-3 rounded-xl border border-border bg-bg-card p-4 text-left transition-all duration-200 active:scale-[0.98] hover:-translate-y-1 hover:border-accent/40 hover:bg-bg-card-hover hover:shadow-lg hover:shadow-accent/5 sm:min-h-[120px] sm:p-5"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-xl">{PLACE_THEMES.find((t) => t.value === place.theme)?.emoji ?? '🏙️'}</span>
        <h3 className="truncate text-lg font-semibold text-text-primary group-hover:text-accent-hover">
          {place.name}
        </h3>
      </div>

      <div className="flex items-center gap-4 text-sm text-text-secondary">
        {/* User count as dots */}
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-1">
            {Array.from({ length: Math.min(place.userCount, 5) }, (_, i) => (
              <div
                key={i}
                className="h-2.5 w-2.5 rounded-full border border-bg-card"
                style={{
                  backgroundColor: [
                    '#FFB5C2',
                    '#87CEEB',
                    '#98FB98',
                    '#DDA0DD',
                    '#FFD700',
                  ][i],
                }}
              />
            ))}
          </div>
          <span>
            {t('lobby.user', { count: place.userCount })}
          </span>
        </div>

        {/* Bubble count */}
        <div className="flex items-center gap-1">
          <span className="opacity-60">o</span>
          <span>{t('lobby.bubbleCount', { count: place.bubbleCount })}</span>
        </div>
      </div>
    </button>
  );
}

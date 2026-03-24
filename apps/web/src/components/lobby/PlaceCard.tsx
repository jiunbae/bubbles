import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PLACE_THEMES, type Place, type PlaceTheme } from '@bubbles/shared';

const THEME_GRADIENTS: Record<PlaceTheme, string> = {
  rooftop: 'linear-gradient(90deg, #1e3a5f, #e87a3a)',
  park: 'linear-gradient(90deg, #1a472a, #3a7d44)',
  alley: 'linear-gradient(90deg, #5c3a21, #c2463a)',
};

interface PlaceCardProps {
  place: Place;
}

export function PlaceCard({ place }: PlaceCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/place/${place.id}`)}
      className="group relative flex min-h-[100px] flex-col gap-3 overflow-hidden rounded-xl border border-border bg-bg-card p-4 text-left transition-all duration-200 active:scale-[0.98] hover:-translate-y-1 hover:border-accent/40 hover:bg-bg-card-hover hover:shadow-lg hover:shadow-accent/5 sm:min-h-[120px] sm:p-5"
    >
      {/* Theme gradient bar */}
      <div
        className="absolute inset-x-0 top-0 h-1 opacity-60 transition-opacity group-hover:opacity-100"
        style={{ background: THEME_GRADIENTS[place.theme] ?? THEME_GRADIENTS.rooftop }}
      />
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

      </div>

      {/* Cumulative stats */}
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span>{t('lobby.totalVisitors', { count: place.totalVisitors })}</span>
        <span>{t('lobby.totalBubbles', { count: place.totalBubbles })}</span>
      </div>
    </button>
  );
}

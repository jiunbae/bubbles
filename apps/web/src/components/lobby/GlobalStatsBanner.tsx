import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaceStore } from '@/stores/place-store';
import { useAnimatedCount } from '@/hooks/useAnimatedCount';

export function GlobalStatsBanner() {
  const { t } = useTranslation();
  const places = usePlaceStore((s) => s.places);

  const { totalBubbles, totalVisitors } = useMemo(() => {
    let bubbles = 0;
    let visitors = 0;
    for (const p of places) {
      bubbles += p.totalBubbles;
      visitors += p.totalVisitors;
    }
    return { totalBubbles: bubbles, totalVisitors: visitors };
  }, [places]);

  const animatedBubbles = useAnimatedCount(totalBubbles);
  const animatedVisitors = useAnimatedCount(totalVisitors);

  if (totalBubbles === 0 && totalVisitors === 0) return null;

  return (
    <p className="text-sm text-text-muted">
      {t('lobby.globalStats', {
        bubbles: animatedBubbles.toLocaleString(),
        visitors: animatedVisitors.toLocaleString(),
      })}
    </p>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface FakeStatusBarProps {
  actionCount: number;
  bubbleCount: number;
  isCalculating: boolean;
}

export function FakeStatusBar({ actionCount, bubbleCount, isCalculating }: FakeStatusBarProps) {
  const { t } = useTranslation();
  const [zoom] = useState(100);

  return (
    <div className="flex items-center justify-between h-[24px] bg-[#217346] text-white text-[11px] px-3 select-none shrink-0">
      {/* Left */}
      <div className="flex items-center gap-4">
        <span>{isCalculating ? t('stealth.calculating') : t('stealth.ready')}</span>
      </div>

      {/* Center */}
      <div className="flex items-center gap-6">
        <span>{t('stealth.rows', { count: actionCount })}</span>
        <span className="border-l border-white/30 pl-6">{t('stealth.active', { count: bubbleCount })}</span>
        <span className="border-l border-white/30 pl-6">{t('stealth.sum', { value: (actionCount * 26.7).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') })}</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        <span>{t('stealth.sheet1')}</span>
        <span className="border-l border-white/30 pl-4">{zoom}%</span>
      </div>
    </div>
  );
}

import { useState } from 'react';

interface FakeStatusBarProps {
  actionCount: number;
  bubbleCount: number;
  isCalculating: boolean;
}

export function FakeStatusBar({ actionCount, bubbleCount, isCalculating }: FakeStatusBarProps) {
  const [zoom] = useState(100);

  return (
    <div className="flex items-center justify-between h-[24px] bg-[#217346] text-white text-[11px] px-3 select-none shrink-0">
      {/* Left */}
      <div className="flex items-center gap-4">
        <span>{isCalculating ? 'Calculating...' : 'Ready'}</span>
      </div>

      {/* Center */}
      <div className="flex items-center gap-6">
        <span>Rows: {actionCount}</span>
        <span className="border-l border-white/30 pl-6">Active: {bubbleCount}</span>
        <span className="border-l border-white/30 pl-6">Sum: {(actionCount * 26.7).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        <span>Sheet1</span>
        <span className="border-l border-white/30 pl-4">{zoom}%</span>
      </div>
    </div>
  );
}

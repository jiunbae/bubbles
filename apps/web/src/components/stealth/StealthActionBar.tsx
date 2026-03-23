import { useState, useRef, useEffect } from 'react';

interface StealthActionBarProps {
  onBlowBubble: () => void;
  onPopBubble: (bubbleId: string) => void;
  poppableBubbles: { id: string; label: string }[];
}

export function StealthActionBar({
  onBlowBubble,
  onPopBubble,
  poppableBubbles,
}: StealthActionBarProps) {
  const [showPopDropdown, setShowPopDropdown] = useState(false);
  const popRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropRef.current &&
        !dropRef.current.contains(e.target as Node) &&
        popRef.current &&
        !popRef.current.contains(e.target as Node)
      ) {
        setShowPopDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="flex items-center h-[30px] bg-[#f3f4f6] border-b border-[#d1d5db] px-2 gap-2 select-none text-[12px]">
      {/* Blow Bubble */}
      <button
        className="flex items-center gap-1 px-3 py-1 rounded-sm hover:bg-[#dbeafe] text-[#1e40af] border border-[#93c5fd] bg-[#eff6ff]"
        title="Blow Bubble — Ctrl+Enter"
        onClick={onBlowBubble}
      >
        <span>🫧</span>
        <span>Blow Bubble</span>
      </button>

      {/* Pop Bubble */}
      <div className="relative">
        <button
          ref={popRef}
          className="flex items-center gap-1 px-3 py-1 rounded-sm hover:bg-[#fee2e2] text-[#991b1b] border border-[#fca5a5] bg-[#fef2f2]"
          title="Pop Bubble — Delete"
          onClick={() => setShowPopDropdown(!showPopDropdown)}
        >
          <span>💥</span>
          <span>Pop Bubble</span>
          <svg width="8" height="6" viewBox="0 0 8 6" fill="#555"><path d="M0 0l4 6 4-6z" /></svg>
        </button>
        {showPopDropdown && (
          <div
            ref={dropRef}
            className="absolute top-full left-0 mt-1 bg-white border border-[#c0c0c0] shadow-md rounded-sm min-w-[160px] py-1 z-50"
          >
            {poppableBubbles.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-[#999]">No rows to delete</div>
            ) : (
              poppableBubbles.map((b) => (
                <button
                  key={b.id}
                  className="w-full text-left px-3 py-1 text-[12px] hover:bg-[#fde8e8] text-[#333]"
                  onClick={() => {
                    onPopBubble(b.id);
                    setShowPopDropdown(false);
                  }}
                >
                  {b.label}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Shortcut hints */}
      <div className="flex-1" />
      <div className="flex items-center gap-4 text-[11px] text-[#999]">
        <span>Ctrl+Enter: Blow</span>
        <span>Del: Pop</span>
        <span>Ctrl+Shift+M: Visual Mode</span>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BUBBLE_COLORS, type BubbleSize, type BubblePattern } from '@bubbles/shared';
import { SIZE_FONT_MAP, PATTERN_BORDER_MAP } from './stealth-utils';

interface StealthToolbarProps {
  selectedSize: BubbleSize;
  selectedColor: string;
  selectedPattern: BubblePattern;
  onSizeChange: (size: BubbleSize) => void;
  onColorChange: (color: string) => void;
  onPatternChange: (pattern: BubblePattern) => void;
  onBlowBubble: () => void;
  onPopBubble: (bubbleId: string) => void;
  poppableBubbles: { id: string; label: string }[];
}

function ToolbarSeparator() {
  return <div className="w-[1px] h-[20px] bg-[#d1d5db] mx-1" />;
}

function ToolbarButton({
  children,
  title,
  onClick,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      className={`flex items-center justify-center min-w-[28px] min-h-[28px] p-1.5 rounded-sm text-[13px] ${
        active ? 'bg-[#dde3ea] border border-[#b0b6be]' : 'hover:bg-[#e8eaed] border border-transparent'
      } text-[#333]`}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Dropdown({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 bg-white border border-[#c0c0c0] shadow-md rounded-sm z-50"
    >
      {children}
    </div>
  );
}

export function StealthToolbar({
  selectedSize,
  selectedColor,
  selectedPattern,
  onSizeChange,
  onColorChange,
  onPatternChange,
  onBlowBubble,
  onPopBubble,
  poppableBubbles,
}: StealthToolbarProps) {
  const { t } = useTranslation();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showBorderDropdown, setShowBorderDropdown] = useState(false);
  const [showDeleteDropdown, setShowDeleteDropdown] = useState(false);

  const colorRef = useRef<HTMLButtonElement>(null);
  const sizeRef = useRef<HTMLButtonElement>(null);
  const borderRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);

  const currentSizeLabel = SIZE_FONT_MAP.find((s) => s.size === selectedSize)?.label ?? '12';

  return (
    <div className="flex items-center h-[36px] bg-[#f9fafb] border-b border-[#d1d5db] px-2 gap-[2px] select-none">
      {/* Clipboard group (decorative) */}
      <ToolbarButton title={t('stealthToolbar.paste')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#555" strokeWidth="1.5">
          <rect x="4" y="4" width="10" height="11" rx="1" />
          <rect x="2" y="1" width="10" height="11" rx="1" fill="white" stroke="#555" />
        </svg>
      </ToolbarButton>
      <ToolbarButton title={t('stealthToolbar.cut')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#555" strokeWidth="1.5">
          <circle cx="5" cy="12" r="2.5" /><circle cx="11" cy="12" r="2.5" />
          <line x1="5" y1="9.5" x2="11" y2="2" /><line x1="11" y1="9.5" x2="5" y2="2" />
        </svg>
      </ToolbarButton>
      <ToolbarButton title={t('stealthToolbar.copy')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#555" strokeWidth="1.5">
          <rect x="5" y="5" width="9" height="10" rx="1" /><rect x="2" y="2" width="9" height="10" rx="1" fill="white" stroke="#555" />
        </svg>
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Bold / Italic / Underline (decorative) */}
      <ToolbarButton title={t('stealthToolbar.bold')}><span className="font-bold">B</span></ToolbarButton>
      <ToolbarButton title={t('stealthToolbar.italic')}><span className="italic">I</span></ToolbarButton>
      <ToolbarButton title={t('stealthToolbar.underline')}><span className="underline">U</span></ToolbarButton>

      <ToolbarSeparator />

      {/* Font size = SIZE selector */}
      <div className="relative hidden sm:block">
        <button
          ref={sizeRef}
          className="flex items-center h-[26px] px-2 border border-[#d1d5db] rounded-sm bg-white hover:bg-[#f3f4f6] text-[13px] text-[#333] gap-1 min-w-[48px]"
          title={t('stealthToolbar.fontSize')}
          onClick={() => setShowSizeDropdown(!showSizeDropdown)}
        >
          <span>{currentSizeLabel}</span>
          <svg width="8" height="6" viewBox="0 0 8 6" fill="#555"><path d="M0 0l4 6 4-6z" /></svg>
        </button>
        {showSizeDropdown && (
          <Dropdown anchorRef={sizeRef} onClose={() => setShowSizeDropdown(false)}>
            <div className="py-1 min-w-[60px]">
              {SIZE_FONT_MAP.map((entry) => (
                <button
                  key={entry.size}
                  className={`w-full text-left px-3 py-1 text-[13px] hover:bg-[#e8f0fe] ${
                    selectedSize === entry.size ? 'bg-[#e8f0fe] font-medium' : ''
                  }`}
                  onClick={() => {
                    onSizeChange(entry.size);
                    setShowSizeDropdown(false);
                  }}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </Dropdown>
        )}
      </div>

      <ToolbarSeparator />

      {/* Fill color = COLOR selector */}
      <div className="relative">
        <button
          ref={colorRef}
          className="flex items-center justify-center w-[28px] h-[26px] rounded-sm hover:bg-[#e8eaed] border border-transparent"
          title={t('stealthToolbar.fillColor')}
          onClick={() => setShowColorPicker(!showColorPicker)}
        >
          <div className="flex flex-col items-center">
            <svg width="14" height="12" viewBox="0 0 16 14" fill="#555">
              <path d="M1 10 L5 1 L9 10 Z" />
              <path d="M12 4 Q16 8 12 12 Q8 8 12 4" fill="#555" />
            </svg>
            <div className="w-[14px] h-[3px] mt-[1px] rounded-sm" style={{ backgroundColor: selectedColor }} />
          </div>
        </button>
        {showColorPicker && (
          <Dropdown anchorRef={colorRef} onClose={() => setShowColorPicker(false)}>
            <div className="p-2">
              <div className="text-[11px] text-[#666] mb-1 px-1">{t('stealth.themeColors')}</div>
              <div className="grid grid-cols-4 gap-1">
                {BUBBLE_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`w-[24px] h-[24px] rounded-sm border ${
                      selectedColor === color ? 'border-[#1a73e8] border-2' : 'border-[#ccc]'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                    onClick={() => {
                      onColorChange(color);
                      setShowColorPicker(false);
                    }}
                  />
                ))}
              </div>
            </div>
          </Dropdown>
        )}
      </div>

      {/* Borders = PATTERN selector */}
      <div className="relative hidden sm:block">
        <button
          ref={borderRef}
          className="flex items-center justify-center w-[28px] h-[26px] rounded-sm hover:bg-[#e8eaed] border border-transparent text-[14px]"
          title={t('stealthToolbar.borders')}
          onClick={() => setShowBorderDropdown(!showBorderDropdown)}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#555" strokeWidth="1.5">
            <rect x="1" y="1" width="14" height="14" />
            <line x1="8" y1="1" x2="8" y2="15" />
            <line x1="1" y1="8" x2="15" y2="8" />
          </svg>
        </button>
        {showBorderDropdown && (
          <Dropdown anchorRef={borderRef} onClose={() => setShowBorderDropdown(false)}>
            <div className="py-1 min-w-[140px]">
              {PATTERN_BORDER_MAP.map((entry) => (
                <button
                  key={entry.pattern}
                  className={`w-full text-left px-3 py-1 text-[13px] flex items-center gap-2 hover:bg-[#e8f0fe] ${
                    selectedPattern === entry.pattern ? 'bg-[#e8f0fe] font-medium' : ''
                  }`}
                  onClick={() => {
                    onPatternChange(entry.pattern);
                    setShowBorderDropdown(false);
                  }}
                >
                  <span className="w-[16px] text-center">{entry.icon}</span>
                  <span>{entry.label}</span>
                </button>
              ))}
            </div>
          </Dropdown>
        )}
      </div>

      <ToolbarSeparator />

      {/* BLOW BUBBLE */}
      <button
        className="flex items-center h-[26px] px-2 rounded-sm hover:bg-[#dbeafe] border border-[#93c5fd] text-[13px] text-[#1e40af] gap-1 bg-[#eff6ff]"
        title={t('stealthToolbar.blowBubble')}
        onClick={onBlowBubble}
      >
        <span>🫧</span>
        <span className="hidden sm:inline">{t('stealth.blowBubble')}</span>
      </button>

      {/* POP BUBBLE */}
      <div className="relative">
        <button
          ref={deleteRef}
          className="flex items-center h-[26px] px-2 rounded-sm hover:bg-[#fee2e2] border border-[#fca5a5] text-[13px] text-[#991b1b] gap-1 bg-[#fef2f2]"
          title={t('stealthToolbar.popBubble')}
          onClick={() => setShowDeleteDropdown(!showDeleteDropdown)}
        >
          <span>💥</span>
          <span className="hidden sm:inline">{t('stealth.popBubble')}</span>
          <svg width="8" height="6" viewBox="0 0 8 6" fill="#555"><path d="M0 0l4 6 4-6z" /></svg>
        </button>
        {showDeleteDropdown && (
          <Dropdown anchorRef={deleteRef} onClose={() => setShowDeleteDropdown(false)}>
            <div className="py-1 min-w-[160px]">
              {poppableBubbles.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-[#999]">{t('stealth.noRowsToDelete')}</div>
              ) : (
                poppableBubbles.map((b) => (
                  <button
                    key={b.id}
                    className="w-full text-left px-3 py-1 text-[13px] hover:bg-[#fde8e8] text-[#333]"
                    onClick={() => {
                      onPopBubble(b.id);
                      setShowDeleteDropdown(false);
                    }}
                  >
                    {b.label}
                  </button>
                ))
              )}
            </div>
          </Dropdown>
        )}
      </div>

      <ToolbarSeparator />

      {/* Alignment (decorative) */}
      <ToolbarButton title={t('stealthToolbar.alignLeft')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#555" strokeWidth="1.5">
          <line x1="2" y1="3" x2="14" y2="3" /><line x1="2" y1="6.5" x2="10" y2="6.5" />
          <line x1="2" y1="10" x2="12" y2="10" /><line x1="2" y1="13.5" x2="8" y2="13.5" />
        </svg>
      </ToolbarButton>
      <ToolbarButton title={t('stealthToolbar.alignCenter')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#555" strokeWidth="1.5">
          <line x1="2" y1="3" x2="14" y2="3" /><line x1="4" y1="6.5" x2="12" y2="6.5" />
          <line x1="3" y1="10" x2="13" y2="10" /><line x1="5" y1="13.5" x2="11" y2="13.5" />
        </svg>
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Merge & Center (decorative) */}
      <span className="hidden sm:inline-flex"><ToolbarButton title={t('stealthToolbar.mergeCenter')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#555" strokeWidth="1.3">
          <rect x="1" y="4" width="14" height="8" rx="1" />
          <line x1="8" y1="4" x2="8" y2="12" strokeDasharray="2 2" />
        </svg>
      </ToolbarButton></span>
    </div>
  );
}

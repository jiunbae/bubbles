import { useState, useRef, useEffect, type ReactNode } from 'react';

interface FakeMenuBarProps {
  onBlowBubble: () => void;
  onSwitchToVisual: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  divider?: boolean;
  action?: () => void;
  disabled?: boolean;
}

function MenuDropdown({
  items,
  onClose,
}: {
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-0 bg-white border border-[#c0c0c0] shadow-md rounded-sm min-w-[220px] py-1 z-50"
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="border-t border-[#e0e0e0] my-1" />
        ) : (
          <button
            key={i}
            className={`w-full text-left px-4 py-[5px] text-[13px] flex items-center justify-between ${
              item.disabled
                ? 'text-[#999] cursor-default'
                : 'text-[#333] hover:bg-[#e8f0fe]'
            }`}
            onClick={() => {
              item.action?.();
              onClose();
            }}
            disabled={item.disabled}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="text-[11px] text-[#999] ml-6">{item.shortcut}</span>
            )}
          </button>
        ),
      )}
    </div>
  );
}

export function FakeMenuBar({ onBlowBubble, onSwitchToVisual }: FakeMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: 'New Workbook', shortcut: 'Ctrl+N', disabled: true },
      { label: 'Open...', shortcut: 'Ctrl+O', disabled: true },
      { label: 'Save', shortcut: 'Ctrl+S', disabled: true },
      { label: 'Save As...', shortcut: 'Ctrl+Shift+S', disabled: true },
      { label: '', divider: true },
      { label: 'Print...', shortcut: 'Ctrl+P', disabled: true },
      { label: 'Export as PDF', disabled: true },
      { label: '', divider: true },
      { label: 'Close', disabled: true },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', disabled: true },
      { label: 'Redo', shortcut: 'Ctrl+Y', disabled: true },
      { label: '', divider: true },
      { label: 'Cut', shortcut: 'Ctrl+X', disabled: true },
      { label: 'Copy', shortcut: 'Ctrl+C', disabled: true },
      { label: 'Paste', shortcut: 'Ctrl+V', disabled: true },
      { label: '', divider: true },
      { label: 'Find & Replace...', shortcut: 'Ctrl+H', disabled: true },
    ],
    View: [
      { label: 'Normal View', disabled: true },
      { label: 'Page Layout', disabled: true },
      { label: 'Page Break Preview', disabled: true },
      { label: '', divider: true },
      { label: 'Switch to Presentation Mode', action: onSwitchToVisual },
      { label: '', divider: true },
      { label: 'Freeze Panes', disabled: true },
      { label: 'Gridlines', disabled: true },
      { label: 'Formula Bar', disabled: true },
    ],
    Insert: [
      { label: 'New Row...', shortcut: 'Ctrl+Enter', action: onBlowBubble },
      { label: 'Remove Selected Row', shortcut: 'Delete', disabled: true },
      { label: '', divider: true },
      { label: 'Chart...', disabled: true },
      { label: 'Table', disabled: true },
      { label: 'Pivot Table', disabled: true },
      { label: '', divider: true },
      { label: 'Image...', disabled: true },
      { label: 'Comment', shortcut: 'Ctrl+Shift+M', disabled: true },
    ],
    Format: [
      { label: 'Number Format...', disabled: true },
      { label: 'Conditional Formatting', disabled: true },
      { label: '', divider: true },
      { label: 'Column Width...', disabled: true },
      { label: 'Row Height...', disabled: true },
      { label: '', divider: true },
      { label: 'Cell Style...', disabled: true },
    ],
    Data: [
      { label: 'Sort A to Z', disabled: true },
      { label: 'Sort Z to A', disabled: true },
      { label: '', divider: true },
      { label: 'Filter', shortcut: 'Ctrl+Shift+L', disabled: true },
      { label: 'Data Validation...', disabled: true },
      { label: '', divider: true },
      { label: 'Text to Columns...', disabled: true },
      { label: 'Remove Duplicates', disabled: true },
    ],
    Tools: [
      { label: 'Spelling...', shortcut: 'F7', disabled: true },
      { label: 'Protect Sheet...', disabled: true },
      { label: '', divider: true },
      { label: 'Macros...', shortcut: 'Alt+F8', disabled: true },
    ],
    Help: [
      { label: 'Help Topics', shortcut: 'F1', disabled: true },
      { label: 'Keyboard Shortcuts', disabled: true },
      { label: '', divider: true },
      { label: 'About', disabled: true },
    ],
  };

  return (
    <div className="flex items-center h-[28px] bg-[#f3f4f6] border-b border-[#d1d5db] px-1 select-none text-[13px]">
      {Object.keys(menus).map((menuName) => (
        <div key={menuName} className="relative">
          <button
            className={`px-3 py-1 rounded-sm ${
              openMenu === menuName ? 'bg-[#dde3ea]' : 'hover:bg-[#e8eaed]'
            } text-[#333]`}
            onMouseDown={() => setOpenMenu(openMenu === menuName ? null : menuName)}
            onMouseEnter={() => openMenu && setOpenMenu(menuName)}
          >
            {menuName}
          </button>
          {openMenu === menuName && (
            <MenuDropdown
              items={menus[menuName]}
              onClose={() => setOpenMenu(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

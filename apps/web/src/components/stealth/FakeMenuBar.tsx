import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const menuNames = [
    { key: 'File', label: t('stealthMenu.file') },
    { key: 'Edit', label: t('stealthMenu.edit') },
    { key: 'View', label: t('stealthMenu.view') },
    { key: 'Insert', label: t('stealthMenu.insert') },
    { key: 'Format', label: t('stealthMenu.format') },
    { key: 'Data', label: t('stealthMenu.data') },
    { key: 'Tools', label: t('stealthMenu.tools') },
    { key: 'Help', label: t('stealthMenu.help') },
  ];

  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: t('stealthMenu.newWorkbook'), shortcut: 'Ctrl+N', disabled: true },
      { label: t('stealthMenu.open'), shortcut: 'Ctrl+O', disabled: true },
      { label: t('stealthMenu.save'), shortcut: 'Ctrl+S', disabled: true },
      { label: t('stealthMenu.saveAs'), shortcut: 'Ctrl+Shift+S', disabled: true },
      { label: '', divider: true },
      { label: t('stealthMenu.print'), shortcut: 'Ctrl+P', disabled: true },
      { label: t('stealthMenu.exportPdf'), disabled: true },
      { label: '', divider: true },
      { label: t('stealthMenu.close'), disabled: true },
    ],
    Edit: [
      { label: t('stealthMenu.undo'), shortcut: 'Ctrl+Z', disabled: true },
      { label: t('stealthMenu.redo'), shortcut: 'Ctrl+Y', disabled: true },
      { label: '', divider: true },
      { label: t('stealthMenu.cut'), shortcut: 'Ctrl+X', disabled: true },
      { label: t('stealthMenu.copy'), shortcut: 'Ctrl+C', disabled: true },
      { label: t('stealthMenu.paste'), shortcut: 'Ctrl+V', disabled: true },
      { label: '', divider: true },
      { label: t('stealthMenu.findReplace'), shortcut: 'Ctrl+H', disabled: true },
    ],
    View: [
      { label: t('stealthMenu.normalView'), disabled: true },
      { label: t('stealthMenu.pageLayout'), disabled: true },
      { label: t('stealthMenu.pageBreakPreview'), disabled: true },
      { label: '', divider: true },
      { label: t('stealthMenu.switchPresentation'), action: onSwitchToVisual },
      { label: '', divider: true },
      { label: t('stealthMenu.freezePanes'), disabled: true },
      { label: t('stealthMenu.gridlines'), disabled: true },
      { label: t('stealthMenu.formulaBar'), disabled: true },
    ],
    Insert: [
      { label: t('stealthMenu.newRow'), shortcut: 'Ctrl+Enter', action: onBlowBubble },
      { label: t('stealthMenu.removeSelectedRow'), shortcut: 'Delete', disabled: true },
      { label: '', divider: true },
      { label: t('stealthMenu.chart'), disabled: true },
      { label: t('stealthMenu.table'), disabled: true },
      { label: t('stealthMenu.pivotTable'), disabled: true },
      { label: '', divider: true },
      { label: t('stealthMenu.image'), disabled: true },
      { label: t('stealthMenu.comment'), shortcut: 'Ctrl+Shift+M', disabled: true },
    ],
    Format: [
      { label: t('stealthMenu.numberFormat'), disabled: true },
      { label: t('stealthMenu.conditionalFormatting'), disabled: true },
      { label: '', divider: true },
      { label: t('stealthMenu.columnWidth'), disabled: true },
      { label: t('stealthMenu.rowHeight'), disabled: true },
      { label: '', divider: true },
      { label: t('stealthMenu.cellStyle'), disabled: true },
    ],
    Data: [
      { label: t('stealthMenu.sortAZ'), disabled: true },
      { label: t('stealthMenu.sortZA'), disabled: true },
      { label: '', divider: true },
      { label: t('stealthMenu.filter'), shortcut: 'Ctrl+Shift+L', disabled: true },
      { label: t('stealthMenu.dataValidation'), disabled: true },
      { label: '', divider: true },
      { label: t('stealthMenu.textToColumns'), disabled: true },
      { label: t('stealthMenu.removeDuplicates'), disabled: true },
    ],
    Tools: [
      { label: t('stealthMenu.spelling'), shortcut: 'F7', disabled: true },
      { label: t('stealthMenu.protectSheet'), disabled: true },
      { label: '', divider: true },
      { label: t('stealthMenu.macros'), shortcut: 'Alt+F8', disabled: true },
    ],
    Help: [
      { label: t('stealthMenu.helpTopics'), shortcut: 'F1', disabled: true },
      { label: t('stealthMenu.keyboardShortcuts'), disabled: true },
      { label: '', divider: true },
      { label: t('stealthMenu.about'), disabled: true },
    ],
  };

  return (
    <div className="flex items-center h-[28px] bg-[#f3f4f6] border-b border-[#d1d5db] px-1 select-none text-[13px]">
      {menuNames.map(({ key, label }) => (
        <div key={key} className="relative">
          <button
            className={`px-3 py-1 rounded-sm ${
              openMenu === key ? 'bg-[#dde3ea]' : 'hover:bg-[#e8eaed]'
            } text-[#333]`}
            onMouseDown={() => setOpenMenu(openMenu === key ? null : key)}
            onMouseEnter={() => openMenu && setOpenMenu(key)}
          >
            {label}
          </button>
          {openMenu === key && (
            <MenuDropdown
              items={menus[key]}
              onClose={() => setOpenMenu(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

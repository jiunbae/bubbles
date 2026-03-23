import { generateFakeFormula } from './stealth-utils';

interface FakeFormulaBarProps {
  selectedCell: { row: number; col: string } | null;
  cellContent: string | null;
  isBlowing: boolean;
}

export function FakeFormulaBar({ selectedCell, cellContent, isBlowing }: FakeFormulaBarProps) {
  const cellRef = selectedCell ? `${selectedCell.col}${selectedCell.row}` : '';
  const displayValue = isBlowing
    ? '=GENERATE(B:B, "new", TODAY())'
    : cellContent ?? (selectedCell ? generateFakeFormula(selectedCell.row, selectedCell.col) : '');

  return (
    <div className="flex items-center border-b border-[#d1d5db] bg-white h-[30px] text-[13px]">
      {/* Cell reference box */}
      <div className="flex items-center justify-center w-[80px] h-full border-r border-[#d1d5db] px-2 bg-white">
        <span className="font-medium text-[#333] select-none">{cellRef}</span>
      </div>

      {/* fx label */}
      <div className="flex items-center justify-center w-[30px] h-full border-r border-[#d1d5db] text-[#999] italic select-none">
        <span>fx</span>
      </div>

      {/* Formula / content area */}
      <div className="flex-1 h-full flex items-center px-2 bg-white">
        <span className="text-[#333] font-mono text-[12px] truncate">{displayValue}</span>
      </div>
    </div>
  );
}

import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { SpreadsheetRow } from './stealth-utils';

interface SpreadsheetViewProps {
  rows: SpreadsheetRow[];
  selectedCell: { row: number; col: string } | null;
  onCellSelect: (row: number, col: string) => void;
  newRowId: string | null; // id used for highlight animation
}

const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
const HEADER_KEYS: Record<string, string> = {
  A: 'stealthCols.timestamp',
  B: 'stealthCols.status',
  C: 'stealthCols.assignee',
  D: 'stealthCols.task',
  E: 'stealthCols.priority',
  F: 'stealthCols.category',
  G: 'stealthCols.notes',
};

const COL_WIDTHS: Record<string, string> = {
  A: 'w-[90px]',
  B: 'w-[80px]',
  C: 'w-[110px]',
  D: 'min-w-[200px]',
  E: 'w-[80px]',
  F: 'w-[100px]',
  G: 'w-[120px]',
};

function getCellValue(row: SpreadsheetRow, col: string): string {
  switch (col) {
    case 'A': return row.timestamp;
    case 'B': return row.status;
    case 'C': return row.assignee;
    case 'D': return row.task;
    case 'E': return row.priority;
    case 'F': return row.category;
    case 'G': return row.notes;
    default: return '';
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'NEW': return 'text-[#1a73e8]';
    case 'DONE': return 'text-[#217346]';
    case 'ACTIVE': return 'text-[#e67c00]';
    case 'ON HOLD': return 'text-[#999]';
    case 'CLOSED': return 'text-[#999]';
    default: return 'text-[#333]';
  }
}

export function SpreadsheetView({
  rows,
  selectedCell,
  onCellSelect,
  newRowId,
}: SpreadsheetViewProps) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevRowCount = useRef(rows.length);

  // Auto-scroll when new rows appear
  useEffect(() => {
    if (rows.length > prevRowCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevRowCount.current = rows.length;
  }, [rows.length]);

  // Fill empty rows to look like a real spreadsheet
  const VISIBLE_EMPTY_ROWS = Math.max(0, 25 - rows.length);

  return (
    <div className="flex-1 overflow-auto bg-white">
      <div className="overflow-x-auto min-w-0">
      <table className="w-full border-collapse text-[13px] font-[system-ui] table-fixed min-w-[640px]">
        {/* Column headers */}
        <thead className="sticky top-0 z-10">
          <tr>
            {/* Row number column header */}
            <th className="w-[40px] min-w-[40px] bg-[#f3f4f6] border border-[#d1d5db] text-[#666]" />
            {COLUMNS.map((col) => (
              <th
                key={col}
                className={`${COL_WIDTHS[col]} bg-[#f3f4f6] border border-[#d1d5db] px-2 py-1 text-center font-medium text-[#666] text-[12px]`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Header data row (row 1) */}
          <tr>
            <td className="bg-[#f3f4f6] border border-[#d1d5db] text-center text-[12px] text-[#666] font-medium">
              1
            </td>
            {COLUMNS.map((col) => {
              const isSelected = selectedCell?.row === 1 && selectedCell?.col === col;
              return (
                <td
                  key={col}
                  className={`border px-2 py-1 font-semibold text-[#333] bg-[#f9fafb] cursor-default ${
                    isSelected ? 'border-[#1a73e8] border-2 bg-[#e8f0fe]' : 'border-[#d1d5db]'
                  }`}
                  onClick={() => onCellSelect(1, col)}
                >
                  {t(HEADER_KEYS[col])}
                </td>
              );
            })}
          </tr>

          {/* Data rows */}
          {rows.map((row, i) => {
            const rowNum = i + 2;
            const isNew = newRowId !== null && i === rows.length - 1;
            return (
              <tr
                key={i}
                className={`hover:bg-[#f8f9fa] ${isNew ? 'animate-[stealth-row-flash_1s_ease-out]' : ''}`}
              >
                <td className="bg-[#f3f4f6] border border-[#d1d5db] text-center text-[12px] text-[#666] font-medium">
                  {rowNum}
                </td>
                {COLUMNS.map((col) => {
                  const isSelected = selectedCell?.row === rowNum && selectedCell?.col === col;
                  const value = getCellValue(row, col);
                  const extraClass = col === 'B' ? statusColor(value) : '';
                  return (
                    <td
                      key={col}
                      className={`border px-2 py-1 cursor-default truncate ${extraClass} ${
                        isSelected
                          ? 'border-[#1a73e8] border-2 bg-[#e8f0fe]'
                          : 'border-[#d1d5db]'
                      }`}
                      onClick={() => onCellSelect(rowNum, col)}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {/* Empty rows to fill the view */}
          {Array.from({ length: VISIBLE_EMPTY_ROWS }).map((_, i) => {
            const rowNum = rows.length + 2 + i;
            return (
              <tr key={`empty-${i}`} className="hover:bg-[#f8f9fa]">
                <td className="bg-[#f3f4f6] border border-[#d1d5db] text-center text-[12px] text-[#666]">
                  {rowNum}
                </td>
                {COLUMNS.map((col) => {
                  const isSelected = selectedCell?.row === rowNum && selectedCell?.col === col;
                  return (
                    <td
                      key={col}
                      className={`border px-2 py-1 cursor-default ${
                        isSelected
                          ? 'border-[#1a73e8] border-2 bg-[#e8f0fe]'
                          : 'border-[#d1d5db]'
                      }`}
                      onClick={() => onCellSelect(rowNum, col)}
                    >
                      &nbsp;
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div ref={bottomRef} />

      {/* Inject keyframe animation */}
      <style>{`
        @keyframes stealth-row-flash {
          0% { background-color: #fff9c4; }
          100% { background-color: transparent; }
        }
      `}</style>
    </div>
  );
}

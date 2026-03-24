import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBubbles, blowBubbleRandom } from '@/hooks/useBubbles';
import { globalWsClient } from '@/lib/ws-client';
import { useUIStore } from '@/stores/ui-store';
import { useBubbleStore } from '@/stores/bubble-store';
import { usePlaceStore } from '@/stores/place-store';
import { FakeMenuBar } from './FakeMenuBar';
import { StealthToolbar } from './StealthToolbar';
import { StealthActionBar } from './StealthActionBar';
import { FakeFormulaBar } from './FakeFormulaBar';
import { SpreadsheetView } from './SpreadsheetView';
import { SheetTabs, UsersSheetView, PlacesSheetView } from './SheetTabs';
import { FakeStatusBar } from './FakeStatusBar';
import {
  actionToRow,
  bubbleToActionEntry,
  type ActionLogEntry,
  type SpreadsheetRow,
} from './stealth-utils';

export function StealthMode() {
  const { t } = useTranslation();
  const { bubbles, popBubble } = useBubbles();
  const bubblesMap = useBubbleStore((s) => s.bubbles);
  const onlineUsers = usePlaceStore((s) => s.onlineUsers);
  const places = usePlaceStore((s) => s.places);
  const selectedSize = useUIStore((s) => s.selectedSize);
  const selectedColor = useUIStore((s) => s.selectedColor);
  const selectedPattern = useUIStore((s) => s.selectedPattern);
  const setSelectedSize = useUIStore((s) => s.setSelectedSize);
  const setSelectedColor = useUIStore((s) => s.setSelectedColor);
  const setSelectedPattern = useUIStore((s) => s.setSelectedPattern);
  const setMode = useUIStore((s) => s.setMode);

  // Action log state
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [spreadsheetRows, setSpreadsheetRows] = useState<SpreadsheetRow[]>([]);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: string } | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [newRowId, setNewRowId] = useState<string | null>(null);

  const prevBubbleIdsRef = useRef<Set<string>>(new Set());
  const prevUserIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  // Initialize from existing bubbles on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const existing = Array.from(bubblesMap.values());
    if (existing.length > 0) {
      const entries = existing.map(bubbleToActionEntry);
      setActionLog(entries);
      setSpreadsheetRows(entries.map(actionToRow));
      prevBubbleIdsRef.current = new Set(existing.map((b) => b.bubbleId));
    }
    prevUserIdsRef.current = new Set(onlineUsers.map((u) => u.sessionId));
  }, [bubblesMap, onlineUsers]);

  // Watch for new/removed bubbles and user changes
  useEffect(() => {
    const currentIds = new Set(bubbles.map((b) => b.bubbleId));
    const prevIds = prevBubbleIdsRef.current;

    // New bubbles
    for (const b of bubbles) {
      if (!prevIds.has(b.bubbleId)) {
        const entry = bubbleToActionEntry(b);
        setActionLog((prev) => [...prev, entry]);
        setSpreadsheetRows((prev) => [...prev, actionToRow(entry)]);
        setNewRowId(b.bubbleId);
        flashCalculating();
      }
    }

    // Removed bubbles (popped/expired)
    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        const entry: ActionLogEntry = {
          id: `pop-${id}`,
          timestamp: Date.now(),
          kind: 'pop',
          userName: 'System',
          bubbleId: id,
        };
        setActionLog((prev) => [...prev, entry]);
        setSpreadsheetRows((prev) => [...prev, actionToRow(entry)]);
        setNewRowId(entry.id);
        flashCalculating();
      }
    }

    prevBubbleIdsRef.current = currentIds;
  }, [bubbles]);

  // Watch for user join/leave
  useEffect(() => {
    const currentIds = new Set(onlineUsers.map((u) => u.sessionId));
    const prevIds = prevUserIdsRef.current;

    for (const u of onlineUsers) {
      if (!prevIds.has(u.sessionId)) {
        const entry: ActionLogEntry = {
          id: `join-${u.sessionId}`,
          timestamp: Date.now(),
          kind: 'join',
          userName: u.displayName,
        };
        setActionLog((prev) => [...prev, entry]);
        setSpreadsheetRows((prev) => [...prev, actionToRow(entry)]);
        setNewRowId(entry.id);
      }
    }

    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        const entry: ActionLogEntry = {
          id: `leave-${id}`,
          timestamp: Date.now(),
          kind: 'leave',
          userName: id.slice(0, 8),
        };
        setActionLog((prev) => [...prev, entry]);
        setSpreadsheetRows((prev) => [...prev, actionToRow(entry)]);
        setNewRowId(entry.id);
      }
    }

    prevUserIdsRef.current = currentIds;
  }, [onlineUsers]);

  // Flash "Calculating..." briefly
  const flashCalculating = useCallback(() => {
    setIsCalculating(true);
    setTimeout(() => setIsCalculating(false), 800);
  }, []);

  // Blow bubble handler
  const handleBlowBubble = useCallback(() => {
    blowBubbleRandom(selectedColor);
    if (globalWsClient.isConnected()) {
      globalWsClient.send({ type: 'blow', data: { size: 'M', color: selectedColor, pattern: 'plain' } });
    }
    flashCalculating();
  }, [selectedColor, flashCalculating]);

  // Pop bubble handler
  const handlePopBubble = useCallback(
    (bubbleId: string) => {
      popBubble(bubbleId);
      if (globalWsClient.isConnected()) {
        globalWsClient.send({ type: 'pop', data: { bubbleId } });
      }
      flashCalculating();
    },
    [popBubble, flashCalculating],
  );

  // Switch to visual mode
  const handleSwitchToVisual = useCallback(() => {
    setMode('visual');
  }, [setMode]);

  // Build poppable bubbles list (for the toolbar/action bar dropdowns)
  const poppableBubbles = useMemo(
    () =>
      bubbles.map((b, i) => ({
        id: b.bubbleId,
        label: `Row ${i + 2} — ${b.blownBy.displayName} (${b.size})`,
      })),
    [bubbles],
  );

  // Selected cell content
  const cellContent = useMemo(() => {
    if (!selectedCell) return null;
    if (selectedCell.row === 1) {
      const headers: Record<string, string> = {
        A: 'Timestamp', B: 'Status', C: 'Assignee', D: 'Task', E: 'Priority', F: 'Category', G: 'Notes',
      };
      return headers[selectedCell.col] ?? '';
    }
    const dataRow = spreadsheetRows[selectedCell.row - 2];
    if (!dataRow) return '';
    const colMap: Record<string, keyof SpreadsheetRow> = {
      A: 'timestamp', B: 'status', C: 'assignee', D: 'task', E: 'priority', F: 'category', G: 'notes',
    };
    return dataRow[colMap[selectedCell.col]] ?? '';
  }, [selectedCell, spreadsheetRows]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+Enter = blow bubble
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleBlowBubble();
      }
      // Delete = pop most recent bubble (not your own - we pop the first available)
      if (e.key === 'Delete' && !e.ctrlKey && !e.shiftKey) {
        if (bubbles.length > 0) {
          e.preventDefault();
          handlePopBubble(bubbles[bubbles.length - 1].bubbleId);
        }
      }
      // Ctrl+Shift+M = switch to visual mode
      if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        handleSwitchToVisual();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBlowBubble, handlePopBubble, handleSwitchToVisual, bubbles]);

  return (
    <div className="flex flex-col h-screen bg-white font-[system-ui] text-[#333]">
      {/* Title bar */}
      <div className="flex items-center justify-between h-[32px] bg-[#217346] px-4 select-none shrink-0">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
            <rect x="1" y="1" width="14" height="14" rx="2" fill="#217346" stroke="white" strokeWidth="1" />
            <text x="4" y="12" fontSize="10" fill="white" fontWeight="bold">X</text>
          </svg>
          <span className="text-white text-[13px] font-medium">{t('stealth.titleBar')}</span>
        </div>
        <div className="flex items-center gap-2 text-white text-[12px]">
          <span className="opacity-70">{t('stealth.autoSave')}</span>
        </div>
      </div>

      {/* Menu bar */}
      <FakeMenuBar onBlowBubble={handleBlowBubble} onSwitchToVisual={handleSwitchToVisual} />

      {/* Toolbar */}
      <StealthToolbar
        selectedSize={selectedSize}
        selectedColor={selectedColor}
        selectedPattern={selectedPattern}
        onSizeChange={setSelectedSize}
        onColorChange={setSelectedColor}
        onPatternChange={setSelectedPattern}
        onBlowBubble={handleBlowBubble}
        onPopBubble={handlePopBubble}
        poppableBubbles={poppableBubbles}
      />

      {/* Action bar */}
      <StealthActionBar
        onBlowBubble={handleBlowBubble}
        onPopBubble={handlePopBubble}
        poppableBubbles={poppableBubbles}
      />

      {/* Formula bar */}
      <FakeFormulaBar
        selectedCell={selectedCell}
        cellContent={cellContent}
        isBlowing={isCalculating}
      />

      {/* Main content area */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === 0 && (
          <SpreadsheetView
            rows={spreadsheetRows}
            selectedCell={selectedCell}
            onCellSelect={(row, col) => setSelectedCell({ row, col })}
            newRowId={newRowId}
          />
        )}
        {activeTab === 1 && <UsersSheetView users={onlineUsers} />}
        {activeTab === 2 && <PlacesSheetView places={places} />}
      </div>

      {/* Sheet tabs */}
      <SheetTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onlineUsers={onlineUsers}
        places={places}
      />

      {/* Status bar */}
      <FakeStatusBar
        actionCount={spreadsheetRows.length}
        bubbleCount={bubbles.length}
        isCalculating={isCalculating}
      />
    </div>
  );
}

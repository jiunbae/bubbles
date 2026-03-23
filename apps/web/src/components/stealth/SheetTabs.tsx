import { useState, useRef, useEffect } from 'react';
import type { UserInfo, Place } from '@bubbles/shared';

interface SheetTabsProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
  onlineUsers: UserInfo[];
  places: Place[];
  onSwitchPlace?: (placeId: string) => void;
}

export function SheetTabs({
  activeTab,
  onTabChange,
  onlineUsers,
  places,
  onSwitchPlace,
}: SheetTabsProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tab: number } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const tabs = [
    { label: 'Sheet1', tooltip: 'Task Tracker' },
    { label: 'Sheet2', tooltip: 'Team Summary' },
    { label: 'Sheet3', tooltip: 'Projects' },
  ];

  return (
    <div className="flex items-end h-[28px] bg-[#e8eaed] border-t border-[#d1d5db] select-none relative">
      {/* Navigation arrows (decorative) */}
      <div className="flex items-center px-1 gap-[1px]">
        <button className="w-[20px] h-[20px] flex items-center justify-center text-[10px] text-[#666] hover:bg-[#d1d5db] rounded-sm">
          ◀
        </button>
        <button className="w-[20px] h-[20px] flex items-center justify-center text-[10px] text-[#666] hover:bg-[#d1d5db] rounded-sm">
          ▶
        </button>
      </div>

      {/* Tabs */}
      {tabs.map((tab, i) => (
        <button
          key={i}
          className={`px-4 py-1 text-[12px] border-t border-x ${
            activeTab === i
              ? 'bg-white border-[#d1d5db] text-[#333] font-medium -mb-[1px] z-10'
              : 'bg-[#e0e2e6] border-transparent text-[#666] hover:bg-[#d8dade]'
          } rounded-t-sm`}
          title={tab.tooltip}
          onClick={() => onTabChange(i)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, tab: i });
          }}
        >
          {tab.label}
        </button>
      ))}

      {/* Add sheet button (decorative) */}
      <button className="w-[24px] h-[20px] flex items-center justify-center text-[14px] text-[#666] hover:bg-[#d1d5db] rounded-sm ml-1">
        +
      </button>

      <div className="flex-1" />

      {/* Scrollbar track (decorative) */}
      <div className="w-[120px] h-[14px] bg-[#d1d5db] rounded-full mr-2 mb-1">
        <div className="w-[40px] h-full bg-[#b0b6be] rounded-full" />
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={ctxRef}
          className="fixed bg-white border border-[#c0c0c0] shadow-md rounded-sm py-1 min-w-[160px] z-50 text-[13px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className="w-full text-left px-4 py-1 hover:bg-[#e8f0fe] text-[#999] cursor-default" disabled>
            Insert Sheet
          </button>
          <button className="w-full text-left px-4 py-1 hover:bg-[#e8f0fe] text-[#999] cursor-default" disabled>
            Delete Sheet
          </button>
          <button className="w-full text-left px-4 py-1 hover:bg-[#e8f0fe] text-[#999] cursor-default" disabled>
            Rename
          </button>
          <div className="border-t border-[#e0e0e0] my-1" />
          <button className="w-full text-left px-4 py-1 hover:bg-[#e8f0fe] text-[#999] cursor-default" disabled>
            Move or Copy...
          </button>
          <button className="w-full text-left px-4 py-1 hover:bg-[#e8f0fe] text-[#999] cursor-default" disabled>
            Tab Color
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-views for Sheet2 (users) and Sheet3 (places)
// ---------------------------------------------------------------------------

export function UsersSheetView({ users }: { users: UserInfo[] }) {
  const headers = ['#', 'Name', 'Session ID', 'Status', 'Role'];
  return (
    <div className="flex-1 overflow-auto bg-white">
      <table className="w-full border-collapse text-[13px] font-[system-ui]">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="border border-[#d1d5db] bg-[#f3f4f6] px-3 py-1 text-left font-medium text-[#333] sticky top-0"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u, i) => (
            <tr key={u.sessionId} className="hover:bg-[#f8f9fa]">
              <td className="border border-[#d1d5db] px-3 py-1 text-[#999] bg-[#f9fafb] w-[40px]">{i + 1}</td>
              <td className="border border-[#d1d5db] px-3 py-1">{u.displayName}</td>
              <td className="border border-[#d1d5db] px-3 py-1 font-mono text-[11px] text-[#666]">{u.sessionId.slice(0, 8)}...</td>
              <td className="border border-[#d1d5db] px-3 py-1">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2" />
                Online
              </td>
              <td className="border border-[#d1d5db] px-3 py-1">{u.isAuthenticated ? 'Member' : 'Guest'}</td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="border border-[#d1d5db] px-3 py-4 text-center text-[#999]">
                No team members online
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function PlacesSheetView({
  places,
  onSwitch,
}: {
  places: Place[];
  onSwitch?: (placeId: string) => void;
}) {
  const headers = ['#', 'Project Name', 'Members', 'Items', 'Created', 'Last Activity'];
  return (
    <div className="flex-1 overflow-auto bg-white">
      <table className="w-full border-collapse text-[13px] font-[system-ui]">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="border border-[#d1d5db] bg-[#f3f4f6] px-3 py-1 text-left font-medium text-[#333] sticky top-0"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {places.map((p, i) => (
            <tr
              key={p.id}
              className="hover:bg-[#f8f9fa] cursor-pointer"
              onDoubleClick={() => onSwitch?.(p.id)}
            >
              <td className="border border-[#d1d5db] px-3 py-1 text-[#999] bg-[#f9fafb] w-[40px]">{i + 1}</td>
              <td className="border border-[#d1d5db] px-3 py-1 text-[#1a73e8] underline">{p.name}</td>
              <td className="border border-[#d1d5db] px-3 py-1">{p.userCount}</td>
              <td className="border border-[#d1d5db] px-3 py-1">{p.bubbleCount}</td>
              <td className="border border-[#d1d5db] px-3 py-1 text-[#666]">{new Date(p.createdAt).toLocaleDateString()}</td>
              <td className="border border-[#d1d5db] px-3 py-1 text-[#666]">{new Date(p.lastActivityAt).toLocaleDateString()}</td>
            </tr>
          ))}
          {places.length === 0 && (
            <tr>
              <td colSpan={6} className="border border-[#d1d5db] px-3 py-4 text-center text-[#999]">
                No projects available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

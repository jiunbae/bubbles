import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBubbleStore } from '@/stores/bubble-store';
import { usePlaceStore } from '@/stores/place-store';

interface ActivityLogProps {
  placeId: string;
  onClose: () => void;
}

interface LogEntry {
  id: number;
  time: Date;
  textKey: string;
  textParams?: Record<string, string | number>;
}

const MAX_ENTRIES = 50;
let _logId = 0;

export function ActivityLog({ placeId: _placeId, onClose }: ActivityLogProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevBubbleCountRef = useRef<number>(0);
  const prevUsersRef = useRef<Set<string>>(new Set());

  // Track bubble blows (batch: "5 bubbles blown")
  useEffect(() => {
    const unsub = useBubbleStore.subscribe((state) => {
      const count = state.bubbles.size;
      const prev = prevBubbleCountRef.current;
      if (count > prev) {
        const diff = count - prev;
        const entry: LogEntry = {
          id: ++_logId,
          time: new Date(),
          textKey: 'activity.bubbleBlown',
          textParams: { count: diff },
        };
        setLogs((l) => [entry, ...l].slice(0, MAX_ENTRIES));
      }
      prevBubbleCountRef.current = count;
    });
    return unsub;
  }, []);

  // Track user join/leave
  useEffect(() => {
    const unsub = usePlaceStore.subscribe((state) => {
      const currentIds = new Set(state.onlineUsers.map((u) => u.sessionId));
      const prev = prevUsersRef.current;

      // Joined
      for (const user of state.onlineUsers) {
        if (!prev.has(user.sessionId)) {
          setLogs((l) =>
            [{ id: ++_logId, time: new Date(), textKey: 'activity.userJoined', textParams: { name: user.displayName } }, ...l].slice(
              0,
              MAX_ENTRIES,
            ),
          );
        }
      }

      // Left
      for (const sid of prev) {
        if (!currentIds.has(sid)) {
          setLogs((l) =>
            [{ id: ++_logId, time: new Date(), textKey: 'activity.userLeft' }, ...l].slice(0, MAX_ENTRIES),
          );
        }
      }

      prevUsersRef.current = currentIds;
    });
    return unsub;
  }, []);

  // Auto-scroll to top on new entries
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [logs.length]);

  function formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/40 md:hidden"
        onClick={onClose}
      />

      <aside
        className="
          scrollbar-thin
          fixed bottom-0 left-0 right-0 z-40 max-h-[60vh] overflow-y-auto
          rounded-t-xl border-t border-border bg-bg-secondary p-4
          md:relative md:bottom-auto md:left-auto md:right-auto md:z-auto
          md:max-h-none md:w-80 md:rounded-none md:rounded-l-none md:border-l md:border-t-0
        "
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('activity.title')}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-2 text-text-muted transition-colors hover:text-text-primary"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {logs.length === 0 && (
          <p className="py-8 text-center text-sm text-text-muted">
            {t('activity.empty')}
          </p>
        )}

        <div ref={scrollRef} className="space-y-1">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-baseline gap-2 rounded px-2 py-1 text-sm hover:bg-bg-card"
            >
              <span className="shrink-0 text-xs text-text-muted">
                {formatTime(log.time)}
              </span>
              <span className="text-text-secondary">{t(log.textKey, log.textParams)}</span>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { getPlaceLogs, type ActionLog } from '@/lib/api';

interface ActivityLogProps {
  placeId: string;
  onClose: () => void;
}

const MAX_ENTRIES = 50;

export function ActivityLog({ placeId, onClose }: ActivityLogProps) {
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getPlaceLogs(placeId)
      .then(({ logs: data }) => {
        if (!cancelled) {
          setLogs(data.slice(0, MAX_ENTRIES));
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
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
            Activity Log
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors hover:text-text-primary"
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

        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        )}

        {!isLoading && logs.length === 0 && (
          <p className="py-8 text-center text-sm text-text-muted">
            No activity yet
          </p>
        )}

        <div ref={scrollRef} className="space-y-1">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-baseline gap-2 rounded px-2 py-1 text-sm hover:bg-bg-card"
            >
              <span className="shrink-0 text-xs text-text-muted">
                {formatTime(log.createdAt)}
              </span>
              <span className="text-text-secondary">{log.details}</span>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

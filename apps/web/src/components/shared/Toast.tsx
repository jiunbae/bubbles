import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Z_INDEX } from '@/lib/z-index';

interface ToastMessage {
  id: number;
  text: string;
  type: 'info' | 'success' | 'error';
}

interface ToastContextValue {
  toast: (text: string, type?: ToastMessage['type']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Return a no-op when outside provider (e.g. during SSR or before mount)
    return { toast: () => {} };
  }
  return ctx;
}

// Standalone toaster that manages its own state
export function Toaster() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timeoutMapRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timeoutMapRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timeoutMapRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      for (const timer of timeoutMapRef.current.values()) {
        clearTimeout(timer);
      }
      timeoutMapRef.current.clear();
    };
  }, []);

  // Expose a global toast function via window for convenience
  const toast = useCallback(
    (text: string, type: ToastMessage['type'] = 'info') => {
      const id = ++nextId;
      setToasts((prev) => [...prev.slice(-4), { id, text, type }]);
      const timer = setTimeout(() => dismiss(id), 4000);
      timeoutMapRef.current.set(id, timer);
    },
    [dismiss],
  );

  // Make toast available globally
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__bubbles_toast = toast;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 flex flex-col items-end gap-2 sm:left-auto" style={{ zIndex: Z_INDEX.TOAST }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto animate-[slideIn_0.2s_ease-out] rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg transition-all max-w-full sm:max-w-sm ${
            t.type === 'error'
              ? 'bg-error/90 text-white'
              : t.type === 'success'
                ? 'bg-success/90 text-black'
                : 'bg-bg-card text-text-primary border border-border'
          }`}
          onClick={() => dismiss(t.id)}
          role="alert"
        >
          {t.text}
        </div>
      ))}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Helper to fire a toast from anywhere
export function showToast(text: string, type: ToastMessage['type'] = 'info') {
  const fn = (window as unknown as Record<string, unknown>).__bubbles_toast as
    | ((text: string, type: ToastMessage['type']) => void)
    | undefined;
  fn?.(text, type);
}

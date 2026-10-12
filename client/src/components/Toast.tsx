import { X } from '@phosphor-icons/react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastOptions {
  message: string;
  /** Optional single action, e.g. Undo. */
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

/** One toast at a time, bottom centre, in the ink band style. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const nextId = useRef(0);

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      window.clearTimeout(timer.current);
      setToast({ ...options, id: ++nextId.current });
      timer.current = window.setTimeout(dismiss, options.durationMs ?? 5000);
    },
    [dismiss],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  dismiss();
                  toast.action!.onClick();
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" className="toast-close" onClick={dismiss} aria-label="Dismiss">
              <X size={14} weight="bold" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside ToastProvider');
  return show;
}

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (type, message, timeout = 4500) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t.slice(-3), { id, type, message }]);
      if (timeout) setTimeout(() => dismiss(id), timeout);
    },
    [dismiss],
  );
  const api = useMemo(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m, 7000), info: (m) => push('info', m) }),
    [push],
  );
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
  const colors = { success: 'border-emerald-200 text-emerald-800', error: 'border-red-200 text-red-800', info: 'border-blue-200 text-blue-800' };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-full max-w-sm flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div key={t.id} className={`pointer-events-auto flex items-start gap-3 rounded-lg border bg-white p-3 text-sm shadow-lg ${colors[t.type]}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button type="button" onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

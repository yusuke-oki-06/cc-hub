'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type ToastTone = 'default' | 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { show: () => undefined };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: ToastTone = 'default') => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[1000] flex w-[320px] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={
              'pointer-events-auto flex items-start gap-2 rounded-card border px-3 py-2 font-sans text-[13px] shadow-whisper ' +
              toneClasses(t.tone)
            }
          >
            <ToastIcon tone={t.tone} />
            <span className="flex-1 leading-[1.4]">{t.message}</span>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="shrink-0 rounded p-0.5 text-stone hover:bg-sand hover:text-charcoal"
              aria-label="通知を閉じる"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M2 2l8 8M10 2l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function toneClasses(tone: ToastTone): string {
  switch (tone) {
    case 'success':
      return 'border-[#bcd5a6] bg-[#f3f8ec] text-[#3f5a24]';
    case 'error':
      return 'border-[#e0a9a9] bg-[#fbeaea] text-error-crimson';
    default:
      return 'border-border-warm bg-white text-charcoal';
  }
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'success') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mt-[1px] shrink-0">
        <circle cx="8" cy="8" r="7" fill="#7a9a3a" />
        <path d="M5 8.2l2 2 4-4.4" stroke="white" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tone === 'error') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mt-[1px] shrink-0">
        <circle cx="8" cy="8" r="7" fill="#c96442" />
        <path d="M8 4v5M8 11v.01" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mt-[1px] shrink-0 text-stone">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M8 5.5v3.5M8 11.2v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// Useful in callers that don't know if a provider is mounted yet.
export function useOptionalToast(): ToastContextValue {
  return useContext(ToastContext) ?? { show: () => undefined };
}

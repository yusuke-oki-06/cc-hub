'use client';
import { useEffect, useState } from 'react';

type Theme = 'parchment' | 'airbnb';

const STORAGE_KEY = 'cc-hub-theme';

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  if (theme === 'parchment') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // noop — private mode etc
  }
}

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'parchment';
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'airbnb' ? 'airbnb' : 'parchment';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('parchment');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setHydrated(true);
  }, []);

  const onPick = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div
      className="inline-flex overflow-hidden rounded-full border text-[10px] font-sans"
      style={{ borderColor: 'var(--border)' }}
      aria-label="テーマ切替"
      title="デザインテーマ切替"
    >
      <button
        type="button"
        onClick={() => onPick('parchment')}
        className="px-2 py-[3px] transition"
        style={{
          backgroundColor:
            hydrated && theme === 'parchment' ? 'var(--surface-raised)' : 'transparent',
          color:
            hydrated && theme === 'parchment' ? 'var(--text)' : 'var(--text-muted)',
        }}
      >
        Parchment
      </button>
      <button
        type="button"
        onClick={() => onPick('airbnb')}
        className="px-2 py-[3px] transition"
        style={{
          backgroundColor:
            hydrated && theme === 'airbnb' ? 'var(--primary)' : 'transparent',
          color:
            hydrated && theme === 'airbnb' ? '#ffffff' : 'var(--text-muted)',
        }}
      >
        Airbnb
      </button>
    </div>
  );
}

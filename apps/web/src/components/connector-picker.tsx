'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export interface Connector {
  slug: string;
  displayName: string;
}

interface Props {
  /** 現在有効な slug 集合 (undefined = まだ初期化前) */
  enabledSlugs: Set<string> | undefined;
  /** トグル切替 */
  onToggle: (slug: string, enabled: boolean) => void;
  /** 初期化時に全コネクタを有効化するためのコールバック */
  onInitialize: (allSlugs: string[]) => void;
}

/**
 * claude.ai 風のコネクタ個別トグル。プロファイルに紐づく MCP 一覧を
 * GET /api/mcp/available から取得し、各コネクタを個別に ON/OFF できる。
 * 選択状態は親が localStorage で永続化する前提。
 */
export function ConnectorPicker({ enabledSlugs, onToggle, onInitialize }: Props) {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api<{ connectors: Connector[] }>('/api/mcp/available');
        if (cancelled) return;
        setConnectors(r.connectors);
        if (enabledSlugs === undefined) {
          onInitialize(r.connectors.map((c) => c.slug));
        }
      } catch {
        // silent — MCP取得失敗時はピッカー自体非表示
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // クリック外で閉じる
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const t = setTimeout(() => document.addEventListener('click', onDoc), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onDoc);
    };
  }, [open]);

  if (!loaded || connectors.length === 0) return null;

  const activeCount = enabledSlugs
    ? connectors.filter((c) => enabledSlugs.has(c.slug)).length
    : connectors.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center gap-1.5 rounded-full border border-border-cream bg-white px-2.5 py-1 font-sans text-[12px] text-near hover:bg-sand"
        title="コネクタを選択"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 2h4M6 14h4M2 6v4M14 6v4M5 5l-2-2M11 5l2-2M5 11l-2 2M11 11l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        <span className="font-medium">コネクタ</span>
        <span className="font-mono text-[11px] text-stone">
          {activeCount}/{connectors.length}
        </span>
        <span aria-hidden="true" className="text-stone">▾</span>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full right-0 z-30 mb-1 w-64 overflow-hidden rounded-card border border-border-warm bg-white shadow-whisper"
        >
          <div className="border-b border-border-cream px-3 py-2 font-sans text-[11px] font-medium uppercase tracking-[0.5px] text-stone">
            コネクタ
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {connectors.map((c) => {
              const on = enabledSlugs ? enabledSlugs.has(c.slug) : true;
              return (
                <li key={c.slug}>
                  <button
                    type="button"
                    onClick={() => onToggle(c.slug, !on)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-sans text-[13px] text-near hover:bg-sand"
                  >
                    <span className="min-w-0 flex-1 truncate">{c.displayName}</span>
                    <Toggle on={on} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={
        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition ' +
        (on ? 'bg-terracotta' : 'bg-[#d1cfc5]')
      }
    >
      <span
        className={
          'absolute h-3 w-3 rounded-full bg-white shadow-sm transition ' +
          (on ? 'left-[14px]' : 'left-[2px]')
        }
      />
    </span>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export interface Connector {
  slug: string;
  displayName: string;
}

interface UseConnectorsArgs {
  enabledSlugs: Set<string> | undefined;
  onInitialize: (allSlugs: string[]) => void;
}

/**
 * プロファイルに紐づく MCP 一覧を GET /api/mcp/available から取得する。
 * 初回ロード時に親側の enabledSlugs が未初期化なら全 ON で初期化する。
 */
export function useConnectors({ enabledSlugs, onInitialize }: UseConnectorsArgs) {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loaded, setLoaded] = useState(false);

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
        // silent — MCP 取得失敗時は何も表示しない
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connectors, loaded };
}

interface ConnectorMenuSectionProps {
  connectors: Connector[];
  enabledSlugs: Set<string> | undefined;
  onToggle: (slug: string, enabled: boolean) => void;
}

/**
 * 「+」メニュー内で MCP コネクタ一覧をトグル表示するセクション。
 * composer のツールバーに独立したピルを置かず、追加メニュー経由で選ぶ設計。
 */
export function ConnectorMenuSection({
  connectors,
  enabledSlugs,
  onToggle,
}: ConnectorMenuSectionProps) {
  return (
    <div className="border-t border-border-cream">
      <div className="px-3 py-2 font-sans text-[11px] font-medium uppercase tracking-[0.5px] text-stone">
        MCP コネクタ
      </div>
      <ul className="max-h-60 overflow-y-auto pb-1">
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
  );
}

interface ConnectorPickerProps {
  enabledSlugs: Set<string> | undefined;
  onToggle: (slug: string, enabled: boolean) => void;
  onInitialize: (allSlugs: string[]) => void;
}

/**
 * フォーム用の独立コネクタセレクタ (ルーティン設定画面など)。
 * composer からは + メニュー経由に移行したので、こちらは
 * 「設定フォームの 1 フィールドとしてコネクタを選ぶ」用途のみ。
 */
export function ConnectorPicker({ enabledSlugs, onToggle, onInitialize }: ConnectorPickerProps) {
  const { connectors, loaded } = useConnectors({ enabledSlugs, onInitialize });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-border-cream bg-white px-2.5 py-1 font-sans text-[12px] text-near hover:bg-sand"
        title="コネクタを選択"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M6 2h4M6 14h4M2 6v4M14 6v4M5 5l-2-2M11 5l2-2M5 11l-2 2M11 11l2 2"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        <span className="font-medium">コネクタ</span>
        <span className="font-mono text-[11px] text-stone">
          {activeCount}/{connectors.length}
        </span>
        <span aria-hidden="true" className="text-stone">
          ▾
        </span>
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-card border border-border-warm bg-white shadow-whisper"
        >
          <ConnectorMenuSection
            connectors={connectors}
            enabledSlugs={enabledSlugs}
            onToggle={onToggle}
          />
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

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';

export interface SkillItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  installCount: number;
}

interface Props {
  /** If set, the popover is anchored to a referencing textarea and driven by
   *  the current `/`-query that follows the trigger. */
  variant: 'modal' | 'inline';
  onPick: (skill: SkillItem) => void;
  onClose: () => void;
  /** For inline variant: the current filter text typed after the `/`. */
  query?: string;
  /** For inline variant: absolute screen position (top/left) for the popover. */
  anchor?: { top: number; left: number };
}

// Fetch-once cache so repeated opens don't hammer the runner.
let cache: SkillItem[] | null = null;
let inflight: Promise<SkillItem[]> | null = null;
async function loadSkills(): Promise<SkillItem[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = api<{ skills: SkillItem[] }>('/api/skills?status=published&orderBy=popular')
    .then((r) => {
      cache = r.skills;
      return r.skills;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function clearSkillPickerCache() {
  cache = null;
}

export function SkillPicker({ variant, onPick, onClose, query = '', anchor }: Props) {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadSkills().then((s) => {
      if (alive) {
        setSkills(s);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const effectiveQuery = variant === 'inline' ? query : search;

  const filtered = useMemo(() => {
    const q = effectiveQuery.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.slug.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q),
    );
  }, [skills, effectiveQuery]);

  // Reset active index when the filter changes so Enter picks the right row.
  useEffect(() => {
    setActive(0);
  }, [effectiveQuery]);

  useEffect(() => {
    if (variant === 'modal') {
      inputRef.current?.focus();
    }
  }, [variant]);

  // Keyboard navigation (shared by both variants; inline gets its keys
  // forwarded via the keydown handler on the textarea).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (filtered.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && variant === 'inline') {
        e.preventDefault();
        const pick = filtered[active];
        if (pick) onPick(pick);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [filtered, active, onPick, onClose, variant]);

  const list = (
    <ul className="max-h-[280px] overflow-y-auto py-1">
      {loading && (
        <li className="px-4 py-3 font-sans text-[12px] text-stone">読み込み中…</li>
      )}
      {!loading && filtered.length === 0 && (
        <li className="px-4 py-6 text-center font-sans text-[12px] text-stone">
          一致するスキルがありません
        </li>
      )}
      {filtered.map((s, i) => (
        <li key={s.id}>
          <button
            type="button"
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(s)}
            className={
              'flex w-full items-start gap-3 px-4 py-2 text-left transition ' +
              (i === active ? 'bg-sand' : 'hover:bg-sand')
            }
          >
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-terracotta/10 font-mono text-[11px] text-terracotta">
              /
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="font-mono text-[12px] text-near">{s.slug}</span>
                <span className="truncate font-sans text-[12px] text-olive">{s.title}</span>
              </span>
              {s.description && (
                <span className="line-clamp-2 font-sans text-[11px] text-stone">
                  {s.description}
                </span>
              )}
            </span>
            <span className="mt-0.5 shrink-0 font-mono text-[10px] text-stone">
              {s.installCount}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  if (variant === 'inline') {
    return (
      <div
        className="fixed z-[950] w-[400px] overflow-hidden rounded-card border border-border-warm bg-white shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
        style={{
          top: anchor?.top ?? 0,
          left: anchor?.left ?? 0,
        }}
        onMouseDown={(e) => e.preventDefault()} // keep textarea focused
      >
        <header className="border-b border-border-cream bg-parchment/60 px-4 py-2 font-sans text-[11px] uppercase tracking-wider text-stone">
          スキル
          <span className="ml-2 normal-case text-stone/70">
            ↑↓ で移動・Enter で挿入・Esc で閉じる
          </span>
        </header>
        {list}
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[900] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] overflow-hidden rounded-card border border-border-warm bg-white shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border-cream px-5 py-4">
          <div>
            <h2 className="font-serif text-[18px] leading-[1.2] text-near">スキルを選ぶ</h2>
            <p className="mt-1 font-sans text-[12px] text-stone">
              選択するとプロンプトの先頭に <code className="font-mono">/slug</code> が挿入されます。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="shrink-0 rounded p-1 text-stone hover:bg-sand hover:text-charcoal"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2l-10 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="border-b border-border-cream px-5 py-3">
          <div className="flex items-center gap-2 rounded-card border border-border-cream bg-ivory px-3 py-1.5 focus-within:border-terracotta">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-stone">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" fill="none" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const pick = filtered[active];
                  if (pick) onPick(pick);
                }
              }}
              placeholder="スキルを検索 (名前・用途)"
              className="flex-1 bg-transparent font-sans text-[13px] text-near placeholder:text-stone focus:outline-none"
            />
          </div>
        </div>
        {list}
      </div>
    </div>
  );
}

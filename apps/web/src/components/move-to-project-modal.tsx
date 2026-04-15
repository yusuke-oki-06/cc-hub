'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface Project {
  id: string;
  name: string;
  taskCount?: number;
}

interface Props {
  currentProjectId: string | null;
  currentProjectName: string | null;
  projects: Project[];
  onMove: (projectId: string, projectName: string) => Promise<void> | void;
  onClose: () => void;
}

export function MoveToProjectModal({
  currentProjectId,
  currentProjectName,
  projects,
  onMove,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = projects.filter((p) => p.id !== currentProjectId);
    if (!q) return visible;
    return visible.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query, currentProjectId]);

  const showCreate =
    query.trim().length > 0 &&
    !projects.some((p) => p.name.toLowerCase() === query.trim().toLowerCase());

  const pick = async (p: Project) => {
    if (busy) return;
    setBusy(true);
    try {
      await onMove(p.id, p.name);
    } finally {
      setBusy(false);
    }
  };

  const createAndMove = async () => {
    if (busy) return;
    const name = query.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await api<Project>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      await onMove(created.id, created.name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[900] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] overflow-hidden rounded-card border border-border-warm bg-white shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border-cream px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[18px] leading-[1.2] text-near">チャットを移動</h2>
            <p className="mt-1 font-sans text-[12px] text-stone">
              {currentProjectName
                ? `このチャットは ${currentProjectName} にあります。移動先の別のプロジェクトを選択してください。`
                : 'このチャットを移動するプロジェクトを選択してください。'}
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="プロジェクトを検索または作成"
              className="flex-1 bg-transparent font-sans text-[13px] text-near placeholder:text-stone focus:outline-none"
            />
          </div>
        </div>

        <ul className="max-h-[320px] overflow-y-auto py-1">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => pick(p)}
                disabled={busy}
                className="flex w-full items-center gap-3 px-5 py-2 text-left font-sans text-[13px] text-charcoal transition hover:bg-sand disabled:opacity-50"
              >
                <FolderIcon />
                <span className="flex-1 truncate text-near">{p.name}</span>
                {typeof p.taskCount === 'number' && (
                  <span className="shrink-0 font-mono text-[11px] text-stone">
                    {p.taskCount} 件
                  </span>
                )}
              </button>
            </li>
          ))}
          {showCreate && (
            <li>
              <button
                type="button"
                onClick={createAndMove}
                disabled={busy}
                className="flex w-full items-center gap-3 border-t border-border-cream px-5 py-2 text-left font-sans text-[13px] text-terracotta transition hover:bg-sand disabled:opacity-50"
              >
                <PlusIcon />
                <span className="flex-1 truncate">
                  「{query.trim()}」という名前で新規プロジェクトを作成
                </span>
              </button>
            </li>
          )}
          {filtered.length === 0 && !showCreate && (
            <li className="px-5 py-6 text-center font-sans text-[12px] text-stone">
              プロジェクトがありません
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-stone">
      <path
        d="M2 4.5a1 1 0 011-1h3.5l1.2 1.4H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

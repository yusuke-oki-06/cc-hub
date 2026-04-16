'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

export interface SessionRowData {
  taskId: string;
  sessionId: string | null;
  taskName: string;
  status: string;
  turnCount: number;
  lastActivityAt: string;
  projectId: string | null;
  projectName: string | null;
  isBusy: boolean;
}

export interface SessionTableProps {
  rows: SessionRowData[];
  projects: { id: string; name: string }[];
  pinnedIds: string[];
  onTogglePin: (sessionId: string) => void;
  onRefresh: () => void;
}

export function SessionTable({ rows, projects, pinnedIds, onTogglePin }: SessionTableProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; rows: SessionRowData[] }>();
    for (const r of rows) {
      const key = r.projectId ?? '__none__';
      const name = r.projectName ?? 'プロジェクト未設定';
      if (!map.has(key)) map.set(key, { name, rows: [] });
      map.get(key)!.rows.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#7a9a3a] opacity-70" />
          <span className="relative inline-block h-2 w-2 rounded-full bg-[#7a9a3a]" />
        </span>
        <span className="font-sans text-[13px] font-medium text-near">
          アクティブセッション ({rows.length})
        </span>
      </div>

      <div className="space-y-4">
        {grouped.map(([key, group]) => (
          <div key={key}>
            {grouped.length > 1 && (
              <div className="mb-1 flex items-baseline gap-2 px-1">
                <h3 className="font-sans text-[11px] font-medium uppercase tracking-[0.5px] text-stone">
                  {group.name}
                </h3>
                <span className="font-mono text-[10px] text-stone">{group.rows.length}</span>
              </div>
            )}
            <div className="overflow-hidden rounded-card border border-border-warm bg-white">
              {group.rows.map((r, i) => (
                <Link
                  key={r.taskId}
                  href={`/tasks/${r.taskId}`}
                  className={
                    'flex items-center gap-3 px-4 py-2.5 hover:bg-ivory transition' +
                    (i > 0 ? ' border-t border-border-cream' : '')
                  }
                >
                  <StatusIcon status={r.status} />
                  <span className="min-w-0 flex-1 truncate font-sans text-[13px] font-medium text-near">
                    {r.taskName}
                  </span>
                  <Badge tone={statusTone(r.status)} className="shrink-0">
                    {statusLabel(r.status)}
                  </Badge>
                  <span className="shrink-0 font-mono text-[11px] text-stone w-14 text-right">
                    {r.turnCount} turns
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-stone w-12 text-right">
                    {formatRelativeTime(r.lastActivityAt)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'running' || status === 'queued') {
    return (
      <span className="relative inline-flex h-2 w-2 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#7a9a3a] opacity-70" />
        <span className="relative inline-block h-2 w-2 rounded-full bg-[#7a9a3a]" />
      </span>
    );
  }
  if (status === 'succeeded') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" className="shrink-0 text-[#7a9a3a]">
        <path d="M4 8.5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'failed' || status === 'aborted') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" className="shrink-0 text-[#b53333]">
        <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return <span className="h-2 w-2 shrink-0 rounded-full bg-[#c7c3b8]" />;
}

function statusTone(s: string): 'default' | 'success' | 'warn' | 'danger' {
  if (s === 'succeeded') return 'success';
  if (s === 'running' || s === 'queued') return 'warn';
  if (s === 'failed' || s === 'aborted') return 'danger';
  return 'default';
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    queued: '待機中',
    running: '実行中',
    succeeded: '完了',
    failed: '失敗',
    aborted: '中断',
  };
  return map[s] ?? s;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '今';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

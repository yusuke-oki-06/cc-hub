'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

interface Usage {
  todayUsd: number;
  weekUsd: number;
  monthUsd: number;
  taskCount: number;
  activeUsers: number;
  timeSavedMinutesMonth: number;
  minutesSavedPerTask: number;
  succeededCountMonth: number;
  topTasks: Array<{ taskId: string; prompt: string; costUsd: number; createdAt: string }>;
  perDay: Array<{ day: string; cost: number; tasks: number }>;
}

function formatTimeSaved(minutes: number): string {
  if (minutes < 60) return `${minutes} 分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} 時間` : `${h} 時間 ${m} 分`;
}

export default function AdminInsights() {
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => {
    void api<Usage>('/api/admin/usage-summary')
      .then(setU)
      .catch(() => null);
  }, []);
  const maxCost = Math.max(0.01, ...(u?.perDay.map((p) => p.cost) ?? [0]));

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-10 space-y-6">
      <Link href="/" className="font-sans text-[13px] text-stone hover:text-olive">
        ← ダッシュボード
      </Link>
      <header className="flex items-center justify-between border-b border-border-warm pb-4">
        <div>
          <h1 className="font-serif text-[36px] leading-[1.1] text-near">利用状況 (管理者)</h1>
          <p className="mt-1 font-sans text-[12px] text-stone">
            詳細な trace は{' '}
            <a
              href={process.env.NEXT_PUBLIC_LANGFUSE_URL ?? 'http://localhost:3100'}
              target="_blank"
              rel="noreferrer"
              className="underline text-terracotta"
            >
              Langfuse ↗
            </a>
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="今日" value={`$${u?.todayUsd.toFixed(3) ?? '…'}`} />
        <StatCard label="今週" value={`$${u?.weekUsd.toFixed(2) ?? '…'}`} />
        <StatCard label="今月" value={`$${u?.monthUsd.toFixed(2) ?? '…'}`} />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="今月のタスク数" value={`${u?.taskCount ?? '…'}`} />
        <StatCard label="今月のアクティブユーザー" value={`${u?.activeUsers ?? '…'}`} />
        <StatCard
          label="今月の稼働削減時間"
          value={u ? formatTimeSaved(u.timeSavedMinutesMonth) : '…'}
          hint={u ? `完了 ${u.succeededCountMonth} 件 × 人手 ${u.minutesSavedPerTask} 分/件の概算` : undefined}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>直近 28 日の日次コスト</CardTitle>
        </CardHeader>
        <div className="flex h-36 items-end gap-1">
          {u?.perDay.map((p) => (
            <div
              key={p.day}
              className="flex-1 rounded-t bg-terracotta/80 hover:bg-terracotta"
              style={{ height: `${(p.cost / maxCost) * 100}%` }}
              title={`${p.day}: $${p.cost.toFixed(3)} (${p.tasks} tasks)`}
            />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>コスト上位タスク</CardTitle>
        </CardHeader>
        <ul className="space-y-2 font-sans text-[13px]">
          {u?.topTasks.map((t) => (
            <li key={t.taskId} className="flex items-start justify-between border-b border-border-cream pb-2">
              <div className="min-w-0 flex-1">
                <div className="line-clamp-1 text-near">{t.prompt}</div>
                <div className="font-mono text-[10px] text-stone">
                  {new Date(t.createdAt).toLocaleString('ja-JP')}
                </div>
              </div>
              <div className="ml-3 shrink-0 font-serif text-[14px] text-near">
                ${t.costUsd.toFixed(3)}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <div className="font-sans text-[12px] text-stone">{label}</div>
      <div className="mt-1 font-serif text-[32px] leading-[1] text-near">{value}</div>
      {hint && <div className="mt-1 font-sans text-[11px] text-stone">{hint}</div>}
    </Card>
  );
}

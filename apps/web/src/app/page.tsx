'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { TokenSetup } from '@/components/token-setup';

interface Task {
  id: string;
  prompt: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'aborted';
  profileId: string;
  costUsd: number;
  createdAt: string;
  finishedAt: string | null;
}
interface Budget {
  userId: string;
  dailyUsedUsd: number;
  monthlyUsedUsd: number;
  dailyCapUsd: number;
  monthlyCapUsd: number;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [error, setError] = useState<string>();

  const load = async () => {
    try {
      const [t, b] = await Promise.all([
        api<{ tasks: Task[] }>('/api/tasks'),
        api<Budget>('/api/me/budget'),
      ]);
      setTasks(t.tasks);
      setBudget(b);
      setError(undefined);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  useEffect(() => {
    void load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CC Hub</h1>
          <p className="text-xs text-slate-400">社内 AI 業務アシスタント基盤 (Phase 1 PoC)</p>
        </div>
        <div className="flex gap-2">
          <Link href="/tasks/new">
            <Button>+ 新規タスク</Button>
          </Link>
          <Link href="/audit">
            <Button variant="ghost">監査</Button>
          </Link>
          <Link href="/profiles">
            <Button variant="ghost">Profile</Button>
          </Link>
        </div>
      </header>

      <TokenSetup />

      {error && (
        <Card className="border-red-900/60 bg-red-900/10">
          <div className="text-sm text-red-300">API エラー: {error}</div>
        </Card>
      )}

      <section className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>日次利用</CardTitle>
          </CardHeader>
          {budget ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold">
                  ${budget.dailyUsedUsd.toFixed(3)}
                </span>
                <span className="text-xs text-slate-400">cap ${budget.dailyCapUsd.toFixed(2)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-brand-500"
                  style={{
                    width: `${Math.min(100, (budget.dailyUsedUsd / budget.dailyCapUsd) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">loading</div>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>月次利用</CardTitle>
          </CardHeader>
          {budget ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold">
                  ${budget.monthlyUsedUsd.toFixed(2)}
                </span>
                <span className="text-xs text-slate-400">
                  cap ${budget.monthlyCapUsd.toFixed(2)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${Math.min(100, (budget.monthlyUsedUsd / budget.monthlyCapUsd) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">loading</div>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-300">最近のタスク</h2>
        <div className="space-y-2">
          {tasks.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`}>
              <Card className="hover:border-brand-500/50 transition cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                      <span className="text-xs text-slate-500 font-mono">
                        {t.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-slate-500">{t.profileId}</span>
                    </div>
                    <div className="line-clamp-1 text-sm text-slate-100">{t.prompt}</div>
                    <div className="text-[11px] text-slate-500">
                      {new Date(t.createdAt).toLocaleString('ja-JP')}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-slate-200">${t.costUsd.toFixed(3)}</div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          {tasks.length === 0 && (
            <Card>
              <div className="text-center text-sm text-slate-500">
                タスクはまだありません。「+ 新規タスク」から作成してください。
              </div>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

function statusTone(s: string): 'default' | 'success' | 'warn' | 'danger' {
  if (s === 'succeeded') return 'success';
  if (s === 'running' || s === 'queued') return 'warn';
  if (s === 'failed' || s === 'aborted') return 'danger';
  return 'default';
}

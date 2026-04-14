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
    <div className="mx-auto max-w-[1200px] px-8 py-12 space-y-10">
      {/* Masthead */}
      <header className="flex items-start justify-between border-b border-border-warm pb-6">
        <div>
          <h1 className="font-serif text-[48px] leading-[1.1] text-near">CC Hub</h1>
        </div>
        <nav className="flex items-center gap-1">
          <Link href="/audit">
            <Button variant="ghost" size="sm">監査</Button>
          </Link>
          <Link href="/profiles">
            <Button variant="ghost" size="sm">Profile</Button>
          </Link>
          <a
            href="http://localhost:3100"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex"
          >
            <Button variant="ghost" size="sm">Langfuse ↗</Button>
          </a>
          <Link href="/tasks/new" className="ml-2">
            <Button variant="primary">+ 新規タスク</Button>
          </Link>
        </nav>
      </header>

      <TokenSetup />

      {error && (
        <Card className="border-[#e0a9a9] bg-[#f8e5e5]">
          <div className="text-sm text-error-crimson">API エラー: {error}</div>
        </Card>
      )}

      {/* Budget cards */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <BudgetCard
          label="日次利用"
          used={budget?.dailyUsedUsd}
          cap={budget?.dailyCapUsd}
          accent="bg-terracotta"
        />
        <BudgetCard
          label="月次利用"
          used={budget?.monthlyUsedUsd}
          cap={budget?.monthlyCapUsd}
          accent="bg-[#4b6a2a]"
        />
      </section>

      {/* Recent tasks */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-subhead-sm text-near">最近のタスク</h2>
          <span className="font-sans text-[13px] text-stone">{tasks.length} 件</span>
        </div>
        <div className="space-y-3">
          {tasks.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`} className="block">
              <Card className="hover:shadow-ring transition cursor-pointer">
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                      <span className="font-mono text-[12px] text-stone">
                        {t.id.slice(0, 8)}
                      </span>
                      <span className="font-sans text-[12px] text-stone">· {t.profileId}</span>
                    </div>
                    <div className="font-serif text-[20px] leading-[1.3] text-near line-clamp-2">
                      {t.prompt}
                    </div>
                    <div className="font-sans text-[12px] text-stone">
                      {new Date(t.createdAt).toLocaleString('ja-JP')}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-serif text-feature text-near">${t.costUsd.toFixed(3)}</div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          {tasks.length === 0 && (
            <Card>
              <div className="py-6 text-center font-sans text-sm text-olive">
                タスクはまだありません。「+ 新規タスク」から始めてください。
              </div>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

function BudgetCard({
  label,
  used,
  cap,
  accent,
}: {
  label: string;
  used?: number;
  cap?: number;
  accent: string;
}) {
  const ratio = used !== undefined && cap ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        {used !== undefined && cap !== undefined && (
          <span className="font-sans text-[12px] text-stone">
            cap ${cap.toFixed(2)}
          </span>
        )}
      </CardHeader>
      {used !== undefined && cap !== undefined ? (
        <div className="space-y-3">
          <div className="font-serif text-[40px] leading-[1.1] text-near">
            ${used.toFixed(3)}
          </div>
          <div className="h-[6px] overflow-hidden rounded-full bg-border-warm">
            <div
              className={`h-full rounded-full ${accent}`}
              style={{ width: `${ratio}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="text-xs text-stone">loading</div>
      )}
    </Card>
  );
}

function statusTone(s: string): 'default' | 'success' | 'warn' | 'danger' {
  if (s === 'succeeded') return 'success';
  if (s === 'running' || s === 'queued') return 'warn';
  if (s === 'failed' || s === 'aborted') return 'danger';
  return 'default';
}

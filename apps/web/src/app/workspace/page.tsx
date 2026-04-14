'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { subscribeSession } from '@/lib/sse';
import { buildTimeline } from '@/lib/render/friendly';
import type { SseEvent } from '@cc-hub/shared';

interface ActiveSession {
  sessionId: string;
  taskId: string;
  taskPrompt: string;
  status: string;
  turnCount: number;
  lastActivityAt: string;
  containerId: string;
  isBusy: boolean;
}

export default function Workspace() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const load = () =>
    api<{ sessions: ActiveSession[] }>('/api/sessions/active').then((r) =>
      setSessions(r.sessions),
    );
  useEffect(() => {
    void load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Auto-pin first up-to-3 active sessions on initial load
    setPinned((prev) => {
      if (prev.length > 0) return prev;
      return sessions.slice(0, 3).map((s) => s.sessionId);
    });
  }, [sessions]);

  const togglePin = (sid: string) => {
    setPinned((prev) => {
      if (prev.includes(sid)) return prev.filter((x) => x !== sid);
      if (prev.length >= 3) return [prev[1] ?? '', prev[2] ?? '', sid].filter(Boolean) as string[];
      return [...prev, sid];
    });
  };

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-10 space-y-4">
      <Link href="/" className="font-sans text-[13px] text-stone hover:text-olive">
        ← ダッシュボード
      </Link>
      <header className="flex items-center justify-between border-b border-border-warm pb-4">
        <h1 className="font-serif text-[32px] leading-[1.1] text-near">ワークスペース</h1>
        <Link href="/tasks/new">
          <Button>+ 新規タスク</Button>
        </Link>
      </header>
      <div className="grid grid-cols-[240px_1fr] gap-4">
        <aside className="space-y-2">
          <div className="font-sans text-[12px] font-medium text-olive">
            アクティブ ({sessions.length})
          </div>
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => togglePin(s.sessionId)}
              className={
                'w-full rounded-card border px-3 py-2 text-left transition ' +
                (pinned.includes(s.sessionId)
                  ? 'border-terracotta bg-[#faf3dd]'
                  : 'border-border-cream bg-ivory hover:shadow-ring')
              }
            >
              <div className="flex items-center gap-1.5">
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                {s.isBusy && <Badge tone="warn">実行中</Badge>}
              </div>
              <div className="mt-1 line-clamp-2 font-sans text-[12px] text-near">
                {s.taskPrompt}
              </div>
              <div className="mt-1 font-mono text-[10px] text-stone">
                turn {s.turnCount} · {s.sessionId.slice(0, 8)}
              </div>
            </button>
          ))}
          {sessions.length === 0 && (
            <div className="rounded-card border border-border-cream bg-ivory px-3 py-6 text-center font-sans text-[12px] text-stone">
              アクティブなセッションなし
            </div>
          )}
        </aside>
        <section
          className={
            'grid gap-3 ' +
            (pinned.length >= 3
              ? 'grid-cols-3'
              : pinned.length === 2
                ? 'grid-cols-2'
                : 'grid-cols-1')
          }
        >
          {pinned.map((sid) => (
            <SessionPane key={sid} sessionId={sid} onClose={() => togglePin(sid)} />
          ))}
          {pinned.length === 0 && (
            <Card>
              <div className="py-12 text-center font-sans text-[13px] text-stone">
                左のリストからセッションを選択
              </div>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

function SessionPane({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const timeline = useMemo(() => buildTimeline(events).slice(-10), [events]);

  useEffect(() => {
    const handle = subscribeSession(sessionId, (ev) => {
      setEvents((prev) => (prev.some((e) => e.seq === ev.seq) ? prev : [...prev, ev]));
      const init = ev.payload as { taskId?: string } | null;
      if (!taskId && init?.taskId) setTaskId(init.taskId);
    });
    return () => handle.close();
  }, [sessionId, taskId]);

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>session {sessionId.slice(0, 8)}</CardTitle>
        <div className="flex items-center gap-1.5">
          {taskId && (
            <Link href={`/tasks/${taskId}`}>
              <Button variant="ghost" size="sm">
                詳細
              </Button>
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            外す
          </Button>
        </div>
      </CardHeader>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {timeline.map((it) => (
          <div
            key={it.seq}
            className="rounded-card border border-border-cream bg-white px-3 py-2 font-sans text-[12px]"
          >
            <div className="font-medium text-near">{it.title}</div>
            {it.body && (
              <div className="mt-1 whitespace-pre-wrap text-charcoal line-clamp-6">
                {it.body}
              </div>
            )}
          </div>
        ))}
        {timeline.length === 0 && (
          <div className="text-center font-sans text-[12px] text-stone py-4">待機中</div>
        )}
      </div>
    </Card>
  );
}

function statusTone(s: string): 'default' | 'success' | 'warn' | 'danger' {
  if (s === 'succeeded') return 'success';
  if (s === 'running' || s === 'queued') return 'warn';
  if (s === 'failed' || s === 'aborted') return 'danger';
  return 'default';
}

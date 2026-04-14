'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { subscribeSession } from '@/lib/sse';
import type { SseEvent } from '@cc-hub/shared';

interface Task {
  id: string;
  prompt: string;
  status: string;
  profileId: string;
  costUsd: number;
  createdAt: string;
  sessionId: string | null;
}

export default function TaskView() {
  const params = useParams<{ id: string }>();
  const taskId = params?.id ?? '';
  const [task, setTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const sessionId = task?.sessionId ?? null;

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    const loop = async () => {
      while (!cancelled) {
        try {
          const t = await api<Task>(`/api/tasks/${taskId}`);
          if (cancelled) return;
          setTask(t);
          if (t.sessionId) break;
        } catch {
          // ignore
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    };
    void loop();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    if (!sessionId) return;
    const handle = subscribeSession(sessionId, (ev) => {
      setConnected(true);
      setEvents((prev) => (prev.some((e) => e.seq === ev.seq) ? prev : [...prev, ev]));
    });
    return () => handle.close();
  }, [sessionId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [events.length]);

  const permissionOpen = useMemo(
    () =>
      events.filter(
        (e) =>
          e.type === 'permission_request' &&
          !events.some(
            (r) =>
              r.type === 'permission_resolved' &&
              (r.payload as { requestId?: string } | null)?.requestId ===
                (e.payload as { requestId?: string } | null)?.requestId,
          ),
      ),
    [events],
  );

  const onAbort = async () => {
    if (!sessionId) return;
    await api(`/api/sessions/${sessionId}/abort`, { method: 'POST' });
  };

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-10 space-y-6">
      <Link href="/" className="font-sans text-[13px] text-stone hover:text-olive">
        ← ダッシュボード
      </Link>
      <header className="flex items-start justify-between gap-6 border-b border-border-warm pb-5">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            {task && <Badge tone={statusTone(task.status)}>{task.status}</Badge>}
            <span className="font-mono text-[12px] text-stone">
              task {taskId.slice(0, 8)}
            </span>
            <span className="font-mono text-[12px] text-stone">
              · session {sessionId?.slice(0, 8) ?? '…'}
            </span>
            <span className="font-sans text-[12px] text-stone">
              · {connected ? 'SSE 接続中' : '接続待ち'}
            </span>
          </div>
          <h1 className="font-serif text-[28px] leading-[1.2] text-near line-clamp-2">
            {task?.prompt ?? '…'}
          </h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="sand" size="sm">共有</Button>
          <Button
            variant="dark"
            size="sm"
            onClick={onAbort}
            disabled={!sessionId}
          >
            中断
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>ストリーム</CardTitle>
            <span className="font-sans text-[12px] text-stone">{events.length} events</span>
          </CardHeader>
          <div ref={listRef} className="max-h-[64vh] overflow-y-auto space-y-3 pr-2">
            {events.map((ev) => (
              <EventRow key={ev.seq} ev={ev} />
            ))}
            {events.length === 0 && (
              <div className="py-12 text-center font-sans text-[13px] text-stone">
                イベント待ち… Claude が起動するまで数秒かかります
              </div>
            )}
          </div>
        </Card>

        <aside className="space-y-4">
          {permissionOpen.length > 0 && (
            <PermissionQueue events={permissionOpen} sessionId={sessionId} />
          )}
          <Card>
            <CardHeader>
              <CardTitle>メタ情報</CardTitle>
            </CardHeader>
            <dl className="space-y-2 font-sans text-[13px]">
              <div className="flex justify-between">
                <dt className="text-stone">profile</dt>
                <dd className="font-mono text-near">{task?.profileId ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone">cost</dt>
                <dd className="text-near">${task?.costUsd.toFixed(3) ?? '0.000'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone">created</dt>
                <dd className="text-near">
                  {task ? new Date(task.createdAt).toLocaleString('ja-JP') : '—'}
                </dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function EventRow({ ev }: { ev: SseEvent }) {
  const summary = summarize(ev);
  const border =
    ev.type.startsWith('error')
      ? 'border-[#e0a9a9] bg-[#fbeaea]'
      : ev.type === 'result'
        ? 'border-[#c9d9ab] bg-[#f2f6e8]'
        : ev.type === 'guardrail.blocked' || ev.type === 'budget.exceeded'
          ? 'border-[#e3d196] bg-[#faf3dd]'
          : ev.type === 'permission_request'
            ? 'border-[#e4b89a] bg-[#f9e8dc]'
            : 'border-border-cream bg-white';
  return (
    <div className={`rounded-card border px-4 py-3 ${border}`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-sans text-[10px] uppercase tracking-[0.5px] text-stone">
          seq {ev.seq} · {ev.type}
        </span>
        <span className="font-mono text-[10px] text-stone">
          {ev.createdAt?.slice(11, 19)}
        </span>
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.6] text-near">
        {summary}
      </pre>
    </div>
  );
}

function summarize(ev: SseEvent): string {
  try {
    const p = ev.payload as Record<string, unknown> | null;
    if (!p) return '(empty)';
    if (ev.type === 'assistant.message' && p.message) {
      const m = p.message as { content?: Array<{ type: string; text?: string }> };
      const texts = (m.content ?? [])
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text!)
        .join('\n');
      if (texts) return texts;
    }
    if (ev.type === 'result' && typeof p.result === 'string') return p.result;
    if (ev.type === 'tool_use' && typeof p.name === 'string') {
      return `[tool] ${p.name}\n${JSON.stringify(p.input ?? {}, null, 2)}`;
    }
    return JSON.stringify(p, null, 2).slice(0, 2000);
  } catch {
    return JSON.stringify(ev.payload).slice(0, 2000);
  }
}

function PermissionQueue({
  events,
  sessionId,
}: {
  events: SseEvent[];
  sessionId: string | null;
}) {
  return (
    <Card className="border-[#e4b89a] bg-[#f9e8dc]">
      <CardHeader>
        <CardTitle>承認待ち ({events.length})</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        {events.map((ev) => {
          const p = ev.payload as { requestId?: string; toolName?: string; input?: unknown };
          return (
            <div key={ev.seq} className="rounded-card border border-border-warm bg-white p-3">
              <div className="font-sans text-[13px] text-near">
                <b>{p.toolName ?? 'Tool'}</b> の実行許可
              </div>
              <pre className="mt-1 font-mono text-[11px] text-olive whitespace-pre-wrap">
                {JSON.stringify(p.input ?? {}, null, 2).slice(0, 600)}
              </pre>
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (!sessionId || !p.requestId) return;
                    void api(`/api/sessions/${sessionId}/permission`, {
                      method: 'POST',
                      body: JSON.stringify({ requestId: p.requestId, decision: 'deny' }),
                    });
                  }}
                >
                  拒否
                </Button>
                <Button
                  size="sm"
                  variant="sand"
                  onClick={() => {
                    if (!sessionId || !p.requestId) return;
                    void api(`/api/sessions/${sessionId}/permission`, {
                      method: 'POST',
                      body: JSON.stringify({ requestId: p.requestId, decision: 'allow_once' }),
                    });
                  }}
                >
                  1回のみ許可
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    if (!sessionId || !p.requestId) return;
                    void api(`/api/sessions/${sessionId}/permission`, {
                      method: 'POST',
                      body: JSON.stringify({ requestId: p.requestId, decision: 'allow' }),
                    });
                  }}
                >
                  常に許可
                </Button>
              </div>
            </div>
          );
        })}
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

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
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

export default function TaskView({ params }: { params: { id: string } }) {
  const [task, setTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const sessionId = task?.sessionId ?? null;

  useEffect(() => {
    // Codex 指摘: ?sid に依存せず task → session を API で解決
    const loop = async () => {
      while (true) {
        try {
          const t = await api<Task>(`/api/tasks/${params.id}`);
          setTask(t);
          if (t.sessionId) break;
        } catch {
          // ignore; retry
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    };
    void loop();
  }, [params.id]);

  useEffect(() => {
    if (!sessionId) return;
    const handle = subscribeSession(sessionId, (ev) => {
      setConnected(true);
      setEvents((prev) => [...prev, ev]);
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
    <div className="mx-auto max-w-5xl p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{task?.prompt ?? '…'}</h1>
            {task && <Badge>{task.status}</Badge>}
          </div>
          <div className="text-xs text-slate-500 font-mono mt-1">
            task {params.id.slice(0, 8)} · session {sessionId?.slice(0, 8) ?? '—'} ·{' '}
            {connected ? 'SSE 接続中' : '接続待ち'}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="danger" onClick={onAbort}>
            中断
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>ストリーム</CardTitle>
          <div className="text-xs text-slate-500">{events.length} events</div>
        </CardHeader>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto space-y-2 pr-2">
          {events.map((ev) => (
            <EventRow key={ev.seq} ev={ev} />
          ))}
          {events.length === 0 && (
            <div className="text-xs text-slate-500">
              イベント待ち… Claude が起動するまで数秒かかります
            </div>
          )}
        </div>
      </Card>

      {permissionOpen.length > 0 && <PermissionQueue events={permissionOpen} sessionId={sessionId} />}
    </div>
  );
}

function EventRow({ ev }: { ev: SseEvent }) {
  const tone = toneFor(ev.type);
  const summary = summarize(ev);
  return (
    <div
      className={
        'rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs font-mono ' + tone
      }
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          seq {ev.seq} · {ev.type}
        </span>
        <span className="text-[10px] text-slate-600">{ev.createdAt?.slice(11, 19)}</span>
      </div>
      <pre className="whitespace-pre-wrap break-words text-slate-100">{summary}</pre>
    </div>
  );
}

function toneFor(t: string): string {
  if (t.startsWith('error')) return 'border-red-900/70';
  if (t === 'result') return 'border-emerald-800/70';
  if (t === 'guardrail.blocked' || t === 'budget.exceeded') return 'border-amber-800/70';
  if (t === 'permission_request') return 'border-brand-700/70';
  return '';
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
    <Card className="border-brand-500/50 bg-brand-500/5">
      <CardHeader>
        <CardTitle>承認待ち ({events.length})</CardTitle>
      </CardHeader>
      <div className="space-y-2">
        {events.map((ev) => {
          const p = ev.payload as { requestId?: string; toolName?: string; input?: unknown };
          return (
            <div key={ev.seq} className="rounded border border-slate-700 bg-slate-900 p-3">
              <div className="text-xs text-slate-300">
                <b>{p.toolName ?? 'Tool'}</b> の実行許可
              </div>
              <pre className="mt-1 text-[11px] text-slate-400 whitespace-pre-wrap">
                {JSON.stringify(p.input ?? {}, null, 2).slice(0, 800)}
              </pre>
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
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

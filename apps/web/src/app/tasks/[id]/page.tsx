'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { subscribeSession } from '@/lib/sse';
import { buildTimeline, type FriendlyItem } from '@/lib/render/friendly';
import { PromptComposer, type ComposerSubmit } from '@/components/prompt-composer';
import { ChatMessage, ChatThinking } from '@/components/chat-message';
import type { SseEvent, ToolProfile } from '@cc-hub/shared';

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
  const router = useRouter();
  const taskId = params?.id ?? '';
  const [task, setTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [profile, setProfile] = useState<ToolProfile | undefined>();
  const [retrying, setRetrying] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const sessionId = task?.sessionId ?? null;
  const timeline = useMemo(() => buildTimeline(events), [events]);
  const traceUrl = useMemo(() => {
    // pick the most recent langfuseTraceUrl from any event payload
    for (let i = events.length - 1; i >= 0; i--) {
      const p = events[i]?.payload as { langfuseTraceUrl?: string } | null;
      if (p?.langfuseTraceUrl) return p.langfuseTraceUrl;
    }
    return null;
  }, [events]);
  const saasLinks = useMemo(
    () => events.filter((e) => e.type === 'saas_link'),
    [events],
  );
  // T-1: surface start/prompt failures as a retry-able banner
  const lastError = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev?.type === 'error') {
        const p = ev.payload as { message?: string; scope?: string; raw?: unknown } | null;
        if (p?.message) return { message: p.message, scope: p.scope ?? null };
      }
    }
    return null;
  }, [events]);
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
  const isRunning = task?.status === 'running' || task?.status === 'queued';

  // Poll task info until sessionId is known
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

  // Poll task status to keep badges fresh
  useEffect(() => {
    if (!taskId) return;
    const id = setInterval(async () => {
      try {
        const t = await api<Task>(`/api/tasks/${taskId}`);
        setTask(t);
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(id);
  }, [taskId]);

  // Load profile for composer allowlist context
  useEffect(() => {
    if (!task?.profileId) return;
    api<{ profiles: ToolProfile[] }>('/api/profiles')
      .then((r) => setProfile(r.profiles.find((p) => p.id === task.profileId)))
      .catch(() => undefined);
  }, [task?.profileId]);

  useEffect(() => {
    if (!sessionId) return;
    const handle = subscribeSession(sessionId, (ev) => {
      setConnected(true);
      setEvents((prev) => (prev.some((e) => e.seq === ev.seq) ? prev : [...prev, ev]));
      // T-4: optimistic status update so ThinkingIndicator clears within
      // SSE latency (<100ms) instead of waiting for the 3s poll.
      if (ev.type === 'result' || ev.type === 'turn.ended') {
        const code = (ev.payload as { exitCode?: number } | null)?.exitCode;
        setTask((prev) =>
          prev
            ? { ...prev, status: code === 0 || code === undefined ? 'succeeded' : 'failed' }
            : prev,
        );
      } else if (ev.type === 'error') {
        setTask((prev) => (prev ? { ...prev, status: 'failed' } : prev));
      }
    });
    return () => handle.close();
  }, [sessionId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [timeline.length]);

  const onAbort = async () => {
    if (!sessionId) return;
    await api(`/api/sessions/${sessionId}/abort`, { method: 'POST' });
  };

  const sendPrompt = async (payload: ComposerSubmit) => {
    if (!sessionId) return;
    await api(`/api/sessions/${sessionId}/claude/prompt`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const sendShortcut = async (text: string) => {
    if (!sessionId) return;
    await api(`/api/sessions/${sessionId}/claude/prompt`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  };

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-10 space-y-5">
      <Link href="/" className="font-sans text-[13px] text-stone hover:text-olive">
        ← ダッシュボード
      </Link>
      <header className="flex items-start justify-between gap-6 border-b border-border-warm pb-5">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            {task && <Badge tone={statusTone(task.status)}>{statusLabel(task.status)}</Badge>}
            <span className="font-sans text-[12px] text-stone">
              {connected ? 'ライブ中' : '接続待ち'}
            </span>
            <span className="font-mono text-[11px] text-stone">
              · session {sessionId?.slice(0, 8) ?? '…'}
            </span>
          </div>
          <h1 className="font-serif text-[26px] leading-[1.2] text-near line-clamp-2">
            {task?.prompt ?? '…'}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isRunning && (
            <Button variant="dark" size="sm" onClick={onAbort} disabled={!sessionId}>
              中断
            </Button>
          )}
        </div>
      </header>

      {lastError && (
        <Card className="border-[#e0a9a9] bg-[#fbeaea]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="font-sans text-[13px] font-medium text-near">
                実行エラー{lastError.scope ? ` (${lastError.scope})` : ''}
              </div>
              <div className="font-mono text-[12px] text-charcoal break-words">
                {lastError.message}
              </div>
            </div>
            <Button
              size="sm"
              variant="primary"
              disabled={!sessionId || retrying || isRunning}
              onClick={async () => {
                if (!sessionId) return;
                setRetrying(true);
                try {
                  await api(`/api/sessions/${sessionId}/claude/start`, {
                    method: 'POST',
                    body: JSON.stringify({}),
                  });
                  setTask((prev) => (prev ? { ...prev, status: 'running' } : prev));
                } catch (e) {
                  console.error('[task] retry failed', e);
                } finally {
                  setRetrying(false);
                }
              }}
            >
              {retrying ? '再実行中…' : '再実行'}
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
        {/* Main column: timeline + composer (Claude.ai-style, narrow reading width) */}
        <section className="mx-auto w-full max-w-[760px] space-y-4">
          <div ref={listRef} className="max-h-[68vh] overflow-y-auto pr-2">
            <div className="space-y-4 py-2">
              {timeline.map((it) => (
                <ChatMessage
                  key={it.seq}
                  item={it}
                  renderInline={(i) => <PermissionInlineCard item={i} sessionId={sessionId} />}
                />
              ))}
              {isRunning && showThinking(timeline) && <ChatThinking />}
              {timeline.length === 0 && !isRunning && !sessionId && (
                <div className="py-10 text-center font-sans text-[13px] text-stone">
                  セッションを準備中…
                </div>
              )}
            </div>
          </div>

          {/* Composer */}
          <PromptComposer
            variant="followup"
            profile={profile}
            disabled={!sessionId || isRunning}
            onSubmit={sendPrompt}
            extraActions={
              <>
                <ShortcutButton
                  label="履歴を整理"
                  title="/compact を送信して会話履歴を圧縮"
                  onClick={() =>
                    sendShortcut(
                      '/compact 会話履歴を圧縮してください (要点を保持、冗長な確認は削除)',
                    )
                  }
                  disabled={!sessionId || isRunning}
                />
                <ShortcutButton
                  label="CLAUDE.md を生成"
                  title="このワークスペースに CLAUDE.md を作る"
                  onClick={() =>
                    sendShortcut(
                      'ワークスペース (/workspace) の内容を分析し、この作業環境で Claude が守るべき指針を CLAUDE.md として生成してください。',
                    )
                  }
                  disabled={!sessionId || isRunning}
                />
                <ShortcutButton
                  label="新しいセッション"
                  title="現状を保存せず新しい会話を開始"
                  onClick={() => router.push('/')}
                />
              </>
            }
          />
        </section>

        {/* Right rail: meta / permissions / SaaS */}
        <aside className="space-y-4">
          {permissionOpen.length > 0 && (
            <PermissionQueue events={permissionOpen} sessionId={sessionId} />
          )}
          {saasLinks.length > 0 && <SaasPanel events={saasLinks} />}
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
                <dd className="text-near">${task?.costUsd?.toFixed(3) ?? '0.000'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone">作成</dt>
                <dd className="text-near">
                  {task ? new Date(task.createdAt).toLocaleString('ja-JP') : '—'}
                </dd>
              </div>
              {traceUrl && (
                <div className="pt-2 border-t border-border-cream">
                  <a
                    href={traceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-sans text-[12px] text-terracotta hover:underline"
                  >
                    詳細トレースを見る (Langfuse) ↗
                  </a>
                  <p className="mt-1 font-sans text-[10px] leading-[1.5] text-stone">
                    Langfuse は Claude の動きを記録した詳細ログです。管理者向け。
                  </p>
                </div>
              )}
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// Whether to show the thinking indicator — suppress when the last event is
// already a terminal result or an active tool (where the tool line itself
// doubles as a "working" affordance).
function showThinking(timeline: FriendlyItem[]): boolean {
  const last = timeline[timeline.length - 1];
  if (!last) return true;
  if (last.kind === 'result.success' || last.kind === 'result.failure') return false;
  if (last.kind === 'tool.running') return false;
  return true;
}

function ShortcutButton({
  label,
  title,
  onClick,
  disabled,
}: {
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded-card border border-border-cream bg-white px-2 py-[3px] font-sans text-[12px] text-charcoal hover:bg-sand disabled:opacity-50"
    >
      {label}
    </button>
  );
}


function PermissionInlineCard({
  item,
  sessionId,
}: {
  item: FriendlyItem;
  sessionId: string | null;
}) {
  const payload = item.data as
    | { requestId?: string; toolName?: string; input?: unknown }
    | undefined;
  const resolve = async (decision: 'allow' | 'allow_once' | 'deny') => {
    if (!sessionId || !payload?.requestId) return;
    await api(`/api/sessions/${sessionId}/permission`, {
      method: 'POST',
      body: JSON.stringify({ requestId: payload.requestId, decision }),
    });
  };
  return (
    <div className="rounded-card border border-[#e4b89a] bg-[#f9e8dc] px-4 py-3">
      <div className="font-sans text-[14px] font-medium text-near">{item.title}</div>
      {item.body && (
        <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-olive">{item.body}</pre>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => resolve('deny')}>
          拒否
        </Button>
        <Button size="sm" variant="sand" onClick={() => resolve('allow_once')}>
          1回のみ許可
        </Button>
        <Button size="sm" variant="primary" onClick={() => resolve('allow')}>
          常に許可
        </Button>
      </div>
    </div>
  );
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
      <div className="space-y-2">
        {events.map((ev) => {
          const p = ev.payload as { requestId?: string; toolName?: string };
          return (
            <div key={ev.seq} className="rounded-card border border-border-warm bg-white p-3">
              <div className="font-sans text-[13px] text-near">
                <b>{p.toolName ?? 'Tool'}</b> の実行許可
              </div>
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
                  onClick={() => {
                    if (!sessionId || !p.requestId) return;
                    void api(`/api/sessions/${sessionId}/permission`, {
                      method: 'POST',
                      body: JSON.stringify({ requestId: p.requestId, decision: 'allow' }),
                    });
                  }}
                >
                  許可
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SaasPanel({ events }: { events: SseEvent[] }) {
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const list = events
    .map((e) => e.payload as { provider?: string; url?: string; title?: string })
    .filter((p): p is { provider?: string; url: string; title?: string } =>
      Boolean(p.url && typeof p.url === 'string'),
    );

  return (
    <Card className="space-y-3">
      <CardHeader>
        <CardTitle>SaaS 参照</CardTitle>
      </CardHeader>
      <div className="space-y-1.5">
        {list.map((p, i) => (
          <button
            key={i}
            onClick={() => setActiveUrl(p.url)}
            className="w-full rounded-card border border-border-cream bg-white px-3 py-2 text-left font-sans text-[12px] hover:shadow-ring"
          >
            <div className="font-medium text-near">{p.provider ?? 'Link'}</div>
            <div className="truncate text-stone">{p.title ?? p.url}</div>
          </button>
        ))}
      </div>
      {activeUrl && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-stone">
            <span className="truncate">{activeUrl}</span>
            <button className="underline" onClick={() => setActiveUrl(null)}>
              閉じる
            </button>
          </div>
          <iframe
            src={activeUrl}
            className="h-[480px] w-full rounded-card border border-border-warm bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
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
function statusLabel(s: string): string {
  const m: Record<string, string> = {
    queued: '準備中',
    running: '実行中',
    succeeded: '完了',
    failed: '失敗',
    aborted: '中断',
  };
  return m[s] ?? s;
}

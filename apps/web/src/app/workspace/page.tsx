'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { subscribeSession } from '@/lib/sse';
import { buildTimeline } from '@/lib/render/friendly';
import { SessionTable, type SessionRowData } from '@/components/session-table';
import { useToast } from '@/components/toast';
import type { SseEvent } from '@cc-hub/shared';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

interface Task {
  id: string;
  prompt: string;
  label: string | null;
  projectId: string | null;
  status: string;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  taskCount: number;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Workspace() {
  const toast = useToast();
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  // dismissed: ユーザーが明示的に「外す」で閉じたセッション ID (再 auto-pin しない)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [aRes, tRes, pRes] = await Promise.all([
        api<{ sessions: ActiveSession[] }>('/api/sessions/active'),
        api<{ tasks: Task[] }>('/api/tasks'),
        api<{ projects: Project[] }>('/api/projects'),
      ]);
      setActiveSessions(aRes.sessions);
      setTasks(tRes.tasks);
      setProjects(pRes.projects);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  // pinned = 全アクティブセッション - dismissed
  const pinned = useMemo(
    () => activeSessions
      .filter((s) => !dismissed.has(s.sessionId))
      .map((s) => s.sessionId)
      .slice(0, 3),
    [activeSessions, dismissed],
  );

  // Merge active sessions with task metadata for unified rows.
  // Monitor focuses on ACTIVE sessions only — history lives in the sidebar.
  const rows = useMemo<SessionRowData[]>(() => {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));

    return activeSessions.map((s): SessionRowData => {
      const t = taskMap.get(s.taskId);
      return {
        taskId: s.taskId,
        sessionId: s.sessionId,
        taskName: t?.label ?? truncate(s.taskPrompt, 50),
        status: s.status,
        turnCount: s.turnCount,
        lastActivityAt: s.lastActivityAt,
        projectId: t?.projectId ?? null,
        projectName: t?.projectId ? (projectMap.get(t.projectId) ?? null) : null,
        isBusy: s.isBusy,
      };
    });
  }, [tasks, activeSessions, projects]);

  // 「外す」= セッション停止 + dismissed に追加
  const dismissSession = async (sid: string) => {
    setDismissed((prev) => new Set(prev).add(sid));
    try {
      await api(`/api/sessions/${sid}/abort`, { method: 'POST' });
    } catch { /* セッションが既に終了している場合は無視 */ }
    // 少し待ってからリストを更新
    setTimeout(() => void load(), 1000);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-10 space-y-6">
      {/* Header */}
      <header>
        <Link href="/" className="font-sans text-[12px] text-stone hover:text-olive">
          ← ダッシュボード
        </Link>
        <h1 className="mt-1 font-serif text-[28px] leading-[1.1] text-near">Workspace</h1>
      </header>

      {/* Active sessions — monitor focuses on live sessions only */}
      {rows.length > 0 ? (
        <>
          {/* Active session list */}
          <SessionTable
            rows={rows}
            projects={projects}
            pinnedIds={pinned}
            onTogglePin={() => {}}
            onRefresh={() => void load()}
          />

          {/* Live monitor panes for pinned sessions */}
          {pinned.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-sans text-[13px] font-medium uppercase tracking-[0.5px] text-stone">
                Live Monitor ({pinned.length}/3)
              </h2>
              <div
                className={
                  'grid gap-3 ' +
                  (pinned.length >= 3
                    ? 'grid-cols-3'
                    : pinned.length === 2
                      ? 'grid-cols-2'
                      : 'grid-cols-1')
                }
              >
                {pinned.map((sid) => {
                  const session = activeSessions.find((s) => s.sessionId === sid);
                  const taskName = session
                    ? (tasks.find((t) => t.id === session.taskId)?.label ?? truncate(session.taskPrompt, 40))
                    : sid.slice(0, 8);
                  return (
                    <SessionPane
                      key={sid}
                      sessionId={sid}
                      taskName={taskName}
                      taskId={session?.taskId}
                      onClose={() => void dismissSession(sid)}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </>
      ) : (
        /* Empty state — no active sessions */
        <Card>
          <div className="py-16 text-center space-y-2">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto text-stone/30">
              <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            <div className="font-sans text-[15px] font-medium text-near">
              アクティブなセッションなし
            </div>
            <div className="font-sans text-[13px] text-stone">
              セッションが実行されるとここに表示されます
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SessionPane — live monitor card                                    */
/* ------------------------------------------------------------------ */

function SessionPane({
  sessionId,
  taskName,
  taskId,
  onClose,
}: {
  sessionId: string;
  taskName: string;
  taskId?: string;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<SseEvent[]>([]);
  const timeline = useMemo(() => buildTimeline(events).slice(-10), [events]);

  useEffect(() => {
    const handle = subscribeSession(sessionId, (ev) => {
      setEvents((prev) => (prev.some((e) => e.seq === ev.seq) ? prev : [...prev, ev]));
    });
    return () => handle.close();
  }, [sessionId]);

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="truncate">{taskName}</CardTitle>
        <div className="flex items-center gap-1.5">
          {taskId && (
            <Link href={`/tasks/${taskId}`}>
              <Button variant="ghost" size="sm">詳細</Button>
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>停止</Button>
        </div>
      </CardHeader>
      <div className="max-h-[45vh] space-y-2 overflow-y-auto px-4 pb-4">
        {timeline.map((it) => (
          <div
            key={it.seq}
            className="rounded-card border border-border-cream bg-white px-3 py-2 font-sans text-[12px]"
          >
            <div className="font-medium text-near">{it.title}</div>
            {it.body && (
              <div className="mt-1 whitespace-pre-wrap text-charcoal line-clamp-4">{it.body}</div>
            )}
          </div>
        ))}
        {timeline.length === 0 && (
          <div className="py-6 text-center font-sans text-[12px] text-stone">待機中…</div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function truncate(s: string, max: number): string {
  const first = s.replace(/\n.*/s, '');
  return first.length > max ? first.slice(0, max) + '…' : first;
}

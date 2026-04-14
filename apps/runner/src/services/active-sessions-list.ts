import { sql } from '../db/client.js';
import { listActiveSessions } from './sessions.js';

export interface ActiveSessionInfo {
  sessionId: string;
  taskId: string;
  taskPrompt: string;
  status: string;
  turnCount: number;
  lastActivityAt: string;
  createdAt: string;
  containerId: string;
  isBusy: boolean;
}

export async function listActiveSessionsForUser(userId: string): Promise<ActiveSessionInfo[]> {
  const active = listActiveSessions().filter((s) => s.userId === userId);
  if (active.length === 0) return [];
  const ids = active.map((s) => s.sessionId);
  const rows = await sql<
    Array<{ id: string; task_id: string; turn_count: number; last_activity_at: string; created_at: string; prompt: string; status: string }>
  >`
    SELECT s.id::text, s.task_id::text, s.turn_count, s.last_activity_at::text,
           s.created_at::text, t.prompt, t.status
    FROM sessions s JOIN tasks t ON t.id = s.task_id
    WHERE s.id = ANY(${ids}::uuid[])
  `;
  return active.map((s) => {
    const row = rows.find((r) => r.id === s.sessionId);
    return {
      sessionId: s.sessionId,
      taskId: s.taskId,
      taskPrompt: row?.prompt ?? '',
      status: row?.status ?? 'unknown',
      turnCount: row?.turn_count ?? 0,
      lastActivityAt: row?.last_activity_at ?? new Date(s.lastActivityAt).toISOString(),
      createdAt: row?.created_at ?? new Date(s.createdAt).toISOString(),
      containerId: s.sandbox.containerId,
      isBusy: Boolean(s.claudeExec),
    };
  });
}

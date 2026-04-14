import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { sql } from '../db/client.js';
import { config } from '../config.js';
import { createSandbox, type SandboxHandle } from '../claude/docker-driver.js';
import type { ToolProfile } from '@cc-hub/shared';

export interface ActiveSession {
  sessionId: string;
  taskId: string;
  userId: string;
  profileId: string;
  sandbox: SandboxHandle;
  claudeExec?: Awaited<ReturnType<SandboxHandle['execClaude']>>;
  createdAt: number;
}

const active = new Map<string, ActiveSession>();

export function getActiveSession(sessionId: string): ActiveSession | undefined {
  return active.get(sessionId);
}

export function listActiveSessions(): ActiveSession[] {
  return [...active.values()];
}

export function resolveCredentialsPath(): string {
  const explicit = process.env.CC_HUB_CLAUDE_CREDENTIALS;
  if (explicit && existsSync(explicit)) return explicit;
  const candidate = join(homedir(), '.claude', '.credentials.json');
  if (!existsSync(candidate)) {
    throw new Error(
      `claude credentials not found at ${candidate}. Run "claude login" first.`,
    );
  }
  return candidate;
}

export interface CreateSessionInput {
  userId: string;
  taskId: string;
  profile: ToolProfile;
}

export async function createSession(input: CreateSessionInput): Promise<ActiveSession> {
  if (active.size >= config.MAX_PARALLEL_SESSIONS) {
    throw new Error(
      `max_parallel_sessions_reached (${config.MAX_PARALLEL_SESSIONS})`,
    );
  }
  const sessionId = randomUUID();

  const sandbox = await createSandbox({
    sessionId,
    profileId: input.profile.id,
    image: process.env.CC_HUB_SANDBOX_IMAGE ?? 'cc-hub-sandbox:0.1.0',
    credentialsHostPath: resolveCredentialsPath(),
    hookUrl: process.env.CC_HUB_HOOK_URL_FOR_CONTAINER ?? `http://host.docker.internal:${config.RUNNER_PORT}`,
    hookToken: config.RUNNER_API_TOKEN,
    memoryMb: 4096,
    cpuCount: 2,
    diskSizeMb: 10_240,
  });

  await sql`
    INSERT INTO sessions (id, task_id, user_id, workspace_path)
    VALUES (${sessionId}::uuid, ${input.taskId}::uuid, ${input.userId}::uuid, '/workspace')
  `;

  const session: ActiveSession = {
    sessionId,
    taskId: input.taskId,
    userId: input.userId,
    profileId: input.profile.id,
    sandbox,
    createdAt: Date.now(),
  };
  active.set(sessionId, session);
  return session;
}

export async function destroySession(sessionId: string): Promise<void> {
  const s = active.get(sessionId);
  if (!s) return;
  try {
    if (s.claudeExec) await s.claudeExec.abort('session_destroyed');
  } catch {
    // noop
  }
  try {
    await s.sandbox.stop();
  } finally {
    await s.sandbox.remove();
    active.delete(sessionId);
  }
}

/**
 * Runner プロセス終了時に全 container を回収する graceful shutdown。
 */
export async function shutdownAllSessions(): Promise<void> {
  await Promise.all([...active.keys()].map((id) => destroySession(id)));
}

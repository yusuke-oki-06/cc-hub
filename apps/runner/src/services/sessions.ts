import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { sql } from '../db/client.js';
import { config } from '../config.js';
import { createSandbox, type SandboxHandle } from '../claude/docker-driver.js';
import type { ToolProfile } from '@cc-hub/shared';
import { getMcpForProfile, buildMcpJson, collectMcpEnv } from './mcp.js';
import { listInstalledSkills } from './skills.js';
import { packEntriesToTar } from '../ingest/tar-packer.js';

export interface ActiveSession {
  sessionId: string;
  taskId: string;
  userId: string;
  profileId: string;
  sandbox: SandboxHandle;
  claudeExec?: Awaited<ReturnType<SandboxHandle['execClaude']>>;
  claudeSessionId?: string;       // Claude CLI's internal session id, captured from system.init
  createdAt: number;
  lastActivityAt: number;
}

export function touchSession(sessionId: string): void {
  const s = active.get(sessionId);
  if (s) s.lastActivityAt = Date.now();
}

export function setClaudeSessionId(sessionId: string, claudeSessionId: string): void {
  const s = active.get(sessionId);
  if (s && !s.claudeSessionId) s.claudeSessionId = claudeSessionId;
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
  // リミットに達したら最も古いセッションを自動破棄して枠を空ける
  while (active.size >= config.MAX_PARALLEL_SESSIONS) {
    const oldest = [...active.values()].sort(
      (a, b) => a.lastActivityAt - b.lastActivityAt,
    )[0];
    if (!oldest) break;
    console.log(
      `[sessions] evicting oldest session ${oldest.sessionId} to make room`,
    );
    await destroySession(oldest.sessionId).catch(() => undefined);
  }
  const sessionId = randomUUID();

  const mcp = await getMcpForProfile(input.profile.id);

  // If an Obsidian vault is configured on the host, expose it inside every
  // container at /workspace/wiki so Claude can read/write the Wiki using the
  // usual Read/Write/Edit tools. The mount is rw because the LLM Wiki pattern
  // requires the LLM to maintain the wiki pages.
  const vaultPath = process.env.CC_HUB_VAULT_PATH;
  const extraBinds: string[] = [];
  if (vaultPath && existsSync(vaultPath)) {
    extraBinds.push(`${vaultPath}:/workspace/wiki:rw`);
  }

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
    extraEnv: collectMcpEnv(mcp),
    extraBinds: extraBinds.length > 0 ? extraBinds : undefined,
  });

  // Inject .mcp.json + .claude/settings.local.json into workspace
  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: '.*',
          hooks: [
            {
              type: 'command',
              command: 'node /usr/local/lib/cc-hub-hook.mjs pre-tool-use',
              timeout: 10,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: '.*',
          hooks: [
            {
              type: 'command',
              command: 'node /usr/local/lib/cc-hub-hook.mjs post-tool-use',
              timeout: 10,
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node /usr/local/lib/cc-hub-hook.mjs user-prompt-submit',
              timeout: 10,
            },
          ],
        },
      ],
    },
  };
  const installedSkills = await listInstalledSkills(input.userId, input.profile.id);
  const entries: Array<{ name: string; content: Buffer }> = [
    { name: '.mcp.json', content: Buffer.from(buildMcpJson(mcp)) },
    { name: '.claude/settings.local.json', content: Buffer.from(JSON.stringify(settings, null, 2)) },
  ];
  for (const skill of installedSkills) {
    // skill content is treated as SKILL.md (skill_md kind). tar-gz support is
    // out of scope for Phase 1.5; future revision can unpack tar.gz contents.
    entries.push({ name: `.claude/skills/${skill.slug}/SKILL.md`, content: skill.content });
  }
  const tar = await packEntriesToTar(entries);
  await sandbox.cpToWorkspace(tar);

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
    lastActivityAt: Date.now(),
  };
  active.set(sessionId, session);
  ensureIdleSweeper();
  return session;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Idle sweeper: destroy sessions inactive for more than IDLE_TIMEOUT_MS.
 * Runs every 5 minutes, starts automatically on first createSession call.
 */
let sweeperStarted = false;
export function ensureIdleSweeper(): void {
  if (sweeperStarted) return;
  sweeperStarted = true;
  setInterval(async () => {
    const now = Date.now();
    for (const s of [...active.values()]) {
      if (now - s.lastActivityAt > IDLE_TIMEOUT_MS) {
        console.log(`[sessions] idle timeout, destroying ${s.sessionId}`);
        await destroySession(s.sessionId).catch(() => undefined);
      }
    }
  }, 5 * 60 * 1000).unref();
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

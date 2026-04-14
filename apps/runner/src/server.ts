import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { config } from './config.js';
import { requireToken } from './auth.js';
import { sql } from './db/client.js';
import { publishEvent } from './events/publish.js';
import { streamSession } from './sse.js';
import { hooksApp } from './hooks/endpoints.js';
import {
  createSession,
  destroySession,
  getActiveSession,
  shutdownAllSessions,
  touchSession,
  setClaudeSessionId,
  type ActiveSession,
} from './services/sessions.js';
import { getProfile, listProfiles, upsertProfile, CreateProfileSchema } from './services/profiles.js';
import { assertBudgetOk, getBudgetState, addUsage } from './services/budgets.js';
import {
  createTask,
  getTask,
  getLatestSessionForTask,
  listTasks,
  setTaskStatus,
  addTaskCost,
} from './services/tasks.js';
import { writeAudit, listAudit } from './services/audit.js';
import {
  listProjects,
  createProject,
  getProject,
  listProjectTasks,
  CreateProjectSchema,
} from './services/projects.js';
import {
  listMcpIntegrations,
  upsertMcpIntegration,
  setProfileMcp,
  McpIntegrationSchema,
} from './services/mcp.js';
import { startSessionTrace, langfuseDeepLink } from './observability/langfuse.js';
import * as tar from 'tar-stream';
import { PassThrough } from 'node:stream';
import Docker from 'dockerode';
import { zipToTar } from './ingest/zip.js';
import { GitCloneInputSchema, MAX_UPLOAD_BYTES } from './ingest/validation.js';
import { gitCloneIntoSandbox } from './ingest/git.js';

// Rough pricing for Claude subscription usage tracking. Subscription では
// 実際の課金は発生しないが、Claude Max の利用率を可視化するため API key
// 相当の per-token 推定額を記録する。環境で上書き可能。
const PRICE_INPUT_PER_MTOKEN = Number(process.env.PRICE_INPUT_PER_MTOKEN ?? 3);
const PRICE_OUTPUT_PER_MTOKEN = Number(process.env.PRICE_OUTPUT_PER_MTOKEN ?? 15);

type Vars = { Variables: { userId: string } };
const app = new Hono<Vars>();

app.use(
  '*',
  cors({
    origin: [config.WEB_ORIGIN],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Last-Event-ID'],
    credentials: true,
    maxAge: 600,
  }),
);

app.get('/healthz', (c) => c.json({ ok: true, ts: Date.now() }));

// Guardrail hooks: container -> host.docker.internal -> ここ
app.route('/internal/hooks', hooksApp);

app.use('/api/*', requireToken);

// ---------- Profiles ----------
app.get('/api/profiles', async (c) => c.json({ profiles: await listProfiles() }));
app.post('/api/profiles', async (c) => {
  const body = await c.req.json();
  const parsed = CreateProfileSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  await upsertProfile(parsed.data);
  return c.json({ ok: true });
});

// ---------- Budgets ----------
app.get('/api/me/budget', async (c) => {
  return c.json(await getBudgetState(c.get('userId')));
});

// ---------- Projects ----------
app.get('/api/projects', async (c) => c.json({ projects: await listProjects(c.get('userId')) }));
app.post('/api/projects', async (c) => {
  const parsed = CreateProjectSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const p = await createProject({
    userId: c.get('userId'),
    name: parsed.data.name,
    description: parsed.data.description,
  });
  return c.json(p);
});
app.get('/api/projects/:id', async (c) => {
  const p = await getProject(c.req.param('id'), c.get('userId'));
  if (!p) return c.json({ error: 'not found' }, 404);
  return c.json(p);
});
app.get('/api/projects/:id/tasks', async (c) => {
  const tasks = await listProjectTasks(c.req.param('id'), c.get('userId'));
  return c.json({ tasks });
});

// ---------- Tasks ----------
app.get('/api/tasks', async (c) => c.json({ tasks: await listTasks(c.get('userId')) }));
app.get('/api/tasks/:id', async (c) => {
  const userId = c.get('userId');
  const taskId = c.req.param('id');
  const t = await getTask(taskId, userId);
  if (!t) return c.json({ error: 'not found' }, 404);
  const sessionId = await getLatestSessionForTask(taskId, userId);
  return c.json({ ...t, sessionId });
});

// ---------- Session creation (core) ----------
const CreateSessionSchema = z.object({
  profileId: z.string().default('default'),
  prompt: z.string().min(1),
  projectId: z.string().uuid().optional(),
});
app.post('/api/sessions', async (c) => {
  const userId = c.get('userId');
  await assertBudgetOk(userId);

  const body = await c.req.json();
  const parsed = CreateSessionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const profile = await getProfile(parsed.data.profileId);
  const task = await createTask({
    userId,
    profileId: profile.id,
    projectId: parsed.data.projectId,
    prompt: parsed.data.prompt,
  });
  const session = await createSession({ userId, taskId: task.id, profile });
  await writeAudit({
    userId,
    sessionId: session.sessionId,
    taskId: task.id,
    kind: 'system',
    payload: { event: 'session.created', profileId: profile.id },
  });
  await publishEvent({
    sessionId: session.sessionId,
    eventType: 'system.init',
    payload: {
      sessionId: session.sessionId,
      taskId: task.id,
      profileId: profile.id,
      containerId: session.sandbox.containerId,
    },
  });
  return c.json({
    sessionId: session.sessionId,
    taskId: task.id,
    containerId: session.sandbox.containerId,
    workspacePath: '/workspace',
  });
});

// ---------- Ingest: upload zip to session workspace ----------
app.post('/api/sessions/:id/upload', async (c) => {
  const sessionId = c.req.param('id');
  const userId = c.get('userId');
  const session = getActiveSession(sessionId);
  if (!session) return c.json({ error: 'session not active' }, 404);
  if (session.userId !== userId) return c.json({ error: 'forbidden' }, 403);

  const contentLength = Number(c.req.header('content-length') ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'payload_too_large' }, 413);
  }

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: 'file field missing' }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: 'payload_too_large' }, 413);

  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith('.zip')) {
    const tar = await zipToTar(buf);
    await session.sandbox.cpToWorkspace(tar);
  } else {
    // 単一ファイルは 1 entry の tar に包む
    const { packEntriesToTar } = await import('./ingest/tar-packer.js');
    const tar = await packEntriesToTar([{ name: file.name, content: buf }]);
    await session.sandbox.cpToWorkspace(tar);
  }

  await writeAudit({
    userId,
    sessionId,
    taskId: session.taskId,
    kind: 'system',
    payload: { event: 'upload.completed', filename: file.name, bytes: file.size },
  });

  return c.json({ ok: true, filename: file.name, bytes: file.size });
});

// ---------- Ingest: git clone ----------
app.post('/api/sessions/:id/git-clone', async (c) => {
  const sessionId = c.req.param('id');
  const session = getActiveSession(sessionId);
  if (!session) return c.json({ error: 'session not active' }, 404);
  if (session.userId !== c.get('userId')) return c.json({ error: 'forbidden' }, 403);

  const parsed = GitCloneInputSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const res = await gitCloneIntoSandbox(session.sandbox, parsed.data);
  await writeAudit({
    userId: session.userId,
    sessionId,
    taskId: session.taskId,
    kind: 'system',
    payload: {
      event: 'git.clone',
      url: parsed.data.url,
      branch: parsed.data.branch,
      exitCode: res.exitCode,
      stderr: res.stderr.slice(0, 2048),
    },
  });
  if (res.exitCode !== 0) return c.json({ error: 'git_clone_failed', stderr: res.stderr }, 500);
  return c.json({ ok: true });
});

// ---------- Start / continue claude turns ----------
// 1 ターン = 1 `claude -p <prompt>` exec。初回以降は --resume で context 維持。
// container は session 生存中は維持 (onExit で destroy しない)。
const StartClaudeSchema = z.object({
  prompt: z.string().min(1).optional(),
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
});
const PromptSchema = z.object({ text: z.string().min(1) });

async function runTurn(
  session: ActiveSession,
  opts: { prompt: string; isFirstTurn: boolean },
): Promise<void> {
  const profile = await getProfile(session.profileId);

  await publishEvent({
    sessionId: session.sessionId,
    eventType: 'turn.started',
    payload: {
      role: 'user',
      text: opts.prompt,
      claudeSessionId: session.claudeSessionId ?? null,
    },
  });

  touchSession(session.sessionId);
  const exec = await session.sandbox.execClaude({
    prompt: opts.prompt,
    allowedTools: profile.allowedTools,
    disallowedTools: profile.disallowedTools,
    resumeSessionId: opts.isFirstTurn ? undefined : session.claudeSessionId,
    maxTurns: profile.maxTurns,
    timeLimitSeconds: profile.timeLimitSeconds,
  });
  session.claudeExec = exec;
  await setTaskStatus(session.taskId, 'running');
  await sql`
    UPDATE sessions SET
      last_activity_at = now(),
      turn_count = turn_count + 1,
      status = 'active'
    WHERE id = ${session.sessionId}::uuid
  `;

  const traceCtx = startSessionTrace({
    sessionId: session.sessionId,
    taskId: session.taskId,
    userId: session.userId,
    profileId: profile.id,
    prompt: opts.prompt,
  });

  exec.onEvent(async (event) => {
    try {
      traceCtx.observeEvent(event);
      if (
        (event.type === 'system' || event.type === 'system.init') &&
        typeof (event as { session_id?: string }).session_id === 'string'
      ) {
        const cid = (event as { session_id?: string }).session_id!;
        if (!session.claudeSessionId) {
          setClaudeSessionId(session.sessionId, cid);
          await sql`
            UPDATE sessions SET claude_session_id = ${cid}
            WHERE id = ${session.sessionId}::uuid AND claude_session_id IS NULL
          `;
        }
      }
      await publishEvent({
        sessionId: session.sessionId,
        eventType: mapClaudeEventType(event.type),
        payload: event,
        parentToolUseId: event.parent_tool_use_id,
      });
      if (event.type === 'result' || event.type === 'message') {
        const usage = extractUsage(event);
        if (usage) {
          const cost =
            (usage.input_tokens * PRICE_INPUT_PER_MTOKEN +
              usage.output_tokens * PRICE_OUTPUT_PER_MTOKEN) /
            1_000_000;
          await addTaskCost(session.taskId, cost, usage.input_tokens, usage.output_tokens);
          const newState = await addUsage(session.userId, cost);
          if (newState.dailyUsedUsd > newState.dailyCapUsd) {
            await publishEvent({
              sessionId: session.sessionId,
              eventType: 'budget.exceeded',
              payload: { kind: 'daily', ...newState },
            });
            await session.claudeExec?.abort('budget_exceeded');
            await destroySession(session.sessionId);
          }
        }
      }
      touchSession(session.sessionId);
    } catch (err) {
      console.error('[runner] onEvent error', err);
    }
  });

  exec.onExit(async (code) => {
    await publishEvent({
      sessionId: session.sessionId,
      eventType: 'turn.ended',
      payload: { exitCode: code },
    });
    await setTaskStatus(
      session.taskId,
      code === 0 ? 'succeeded' : 'failed',
    );
    await sql`
      UPDATE sessions SET last_activity_at = now() WHERE id = ${session.sessionId}::uuid
    `;
    await traceCtx.end({ exitCode: code });
    // container は follow-up 用に維持。idle sweeper (30 min) or DELETE で破棄
    session.claudeExec = undefined;
  });

  exec.onError(async (err) => {
    await publishEvent({
      sessionId: session.sessionId,
      eventType: 'error',
      payload: { message: err.message },
    });
    await traceCtx.end({ error: err.message });
    session.claudeExec = undefined;
  });
}

app.post('/api/sessions/:id/claude/start', async (c) => {
  const sessionId = c.req.param('id');
  const session = getActiveSession(sessionId);
  if (!session) return c.json({ error: 'session not active' }, 404);
  if (session.userId !== c.get('userId')) return c.json({ error: 'forbidden' }, 403);

  const parsed = StartClaudeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const task = await getTask(session.taskId, session.userId);
  const prompt =
    parsed.data.prompt ??
    task?.prompt ??
    'Inspect the /workspace directory and describe what you find.';

  await runTurn(session, { prompt, isFirstTurn: true });
  return c.json({ ok: true });
});

app.post('/api/sessions/:id/claude/prompt', async (c) => {
  const sessionId = c.req.param('id');
  const session = getActiveSession(sessionId);
  if (!session) return c.json({ error: 'session not active' }, 404);
  if (session.userId !== c.get('userId')) return c.json({ error: 'forbidden' }, 403);
  if (session.claudeExec) {
    return c.json({ error: 'previous turn still running' }, 409);
  }

  const parsed = PromptSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  await writeAudit({
    userId: session.userId,
    sessionId,
    taskId: session.taskId,
    kind: 'prompt',
    payload: { role: 'user', text: parsed.data.text, followUp: true },
  });

  await runTurn(session, { prompt: parsed.data.text, isFirstTurn: false });
  return c.json({ ok: true });
});

// ---------- Permission resolution (HITL approval) ----------
const ResolvePermissionSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(['allow', 'allow_once', 'deny']),
  editedInput: z.unknown().optional(),
});
app.post('/api/sessions/:id/permission', async (c) => {
  const sessionId = c.req.param('id');
  const session = getActiveSession(sessionId);
  if (!session) return c.json({ error: 'session not active' }, 404);
  if (session.userId !== c.get('userId')) return c.json({ error: 'forbidden' }, 403);
  const parsed = ResolvePermissionSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  await sql`
    UPDATE permission_requests
    SET status = ${parsed.data.decision === 'deny' ? 'denied' : parsed.data.decision === 'allow' ? 'allowed' : 'allowed_once'},
        decided_by = ${session.userId}::uuid,
        decided_at = now(),
        edited_input = ${parsed.data.editedInput ? sql.json(parsed.data.editedInput as never) : null}
    WHERE id = ${parsed.data.requestId}::uuid AND session_id = ${sessionId}::uuid
  `;
  await publishEvent({
    sessionId,
    eventType: 'permission_resolved',
    payload: { requestId: parsed.data.requestId, decision: parsed.data.decision },
  });
  await writeAudit({
    userId: session.userId,
    sessionId,
    taskId: session.taskId,
    kind: 'permission',
    payload: { requestId: parsed.data.requestId, decision: parsed.data.decision },
  });
  return c.json({ ok: true });
});

app.post('/api/sessions/:id/abort', async (c) => {
  const sessionId = c.req.param('id');
  const session = getActiveSession(sessionId);
  if (!session) return c.json({ error: 'session not active' }, 404);
  if (session.userId !== c.get('userId')) return c.json({ error: 'forbidden' }, 403);
  await session.claudeExec?.abort('user_abort');
  await setTaskStatus(session.taskId, 'aborted');
  return c.json({ ok: true });
});

app.delete('/api/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const session = getActiveSession(sessionId);
  if (!session) return c.json({ ok: true });
  if (session.userId !== c.get('userId')) return c.json({ error: 'forbidden' }, 403);
  await destroySession(sessionId);
  return c.json({ ok: true });
});

// ---------- SSE event stream ----------
app.get('/api/sessions/:id/events', async (c) => {
  const sessionId = c.req.param('id');
  const userId = c.get('userId');
  const owner = await sql<{ user_id: string }[]>`
    SELECT user_id::text FROM sessions WHERE id = ${sessionId}::uuid LIMIT 1
  `;
  if (!owner[0]) return c.json({ error: 'session not found' }, 404);
  if (owner[0].user_id !== userId) return c.json({ error: 'forbidden' }, 403);

  return streamSession(c, sessionId);
});

// ---------- Audit ----------
app.get('/api/audit', async (c) => {
  const sessionId = c.req.query('sessionId') ?? undefined;
  const limit = Number(c.req.query('limit') ?? 200);
  const entries = await listAudit({
    userId: c.get('userId'),
    sessionId,
    limit,
  });
  return c.json({ entries });
});

// ---------- MCP integrations (admin) ----------
app.get('/api/integrations', async (c) => c.json({ integrations: await listMcpIntegrations() }));
app.post('/api/integrations', async (c) => {
  const parsed = McpIntegrationSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  await upsertMcpIntegration(parsed.data);
  return c.json({ ok: true });
});
const SetProfileMcpSchema = z.object({ profileId: z.string(), mcpIds: z.array(z.string().uuid()) });
app.post('/api/integrations/profile-bind', async (c) => {
  const parsed = SetProfileMcpSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  await setProfileMcp(parsed.data.profileId, parsed.data.mcpIds);
  return c.json({ ok: true });
});

// ---------- File browser / viewer (session workspace output) ----------
app.get('/api/sessions/:id/files', async (c) => {
  const sessionId = c.req.param('id');
  const session = getActiveSession(sessionId);
  if (!session) return c.json({ error: 'session not active' }, 404);
  if (session.userId !== c.get('userId')) return c.json({ error: 'forbidden' }, 403);

  const docker = new Docker();
  const container = docker.getContainer(session.sandbox.containerId);
  const exec = await container.exec({
    Cmd: ['sh', '-c', 'cd /workspace && find . -maxdepth 4 -type f -printf "%P\\t%s\\n" | head -500'],
    AttachStdout: true,
    AttachStderr: true,
    User: 'app',
  });
  const stream = (await exec.start({ hijack: true, stdin: false })) as NodeJS.ReadableStream;
  const out = new PassThrough();
  const err = new PassThrough();
  container.modem.demuxStream(stream, out, err);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    out.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve());
  });
  const text = Buffer.concat(chunks).toString('utf8');
  const files = text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, bytes] = line.split('\t');
      return { name: name ?? '', bytes: Number(bytes ?? 0) };
    })
    .filter((f) => f.name);
  return c.json({ files });
});

app.get('/api/sessions/:id/files/*', async (c) => {
  const sessionId = c.req.param('id');
  const session = getActiveSession(sessionId);
  if (!session) return c.json({ error: 'session not active' }, 404);
  if (session.userId !== c.get('userId')) return c.json({ error: 'forbidden' }, 403);

  const url = new URL(c.req.url);
  const prefix = `/api/sessions/${sessionId}/files/`;
  const rawPath = decodeURIComponent(url.pathname.slice(prefix.length));
  if (rawPath.includes('..') || rawPath.startsWith('/')) {
    return c.json({ error: 'invalid path' }, 400);
  }

  const docker = new Docker();
  const container = docker.getContainer(session.sandbox.containerId);
  try {
    const archive = (await container.getArchive({
      path: `/workspace/${rawPath}`,
    })) as unknown as NodeJS.ReadableStream;

    const extract = tar.extract();
    const chunks: Buffer[] = [];
    const done = new Promise<void>((resolve, reject) => {
      extract.on('entry', (header, stream, next) => {
        if (header.type !== 'file') {
          stream.resume();
          return next();
        }
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => next());
      });
      extract.on('finish', resolve);
      extract.on('error', reject);
    });
    archive.pipe(extract);
    await done;
    const body = Buffer.concat(chunks);
    const lower = rawPath.toLowerCase();
    const ctype = lower.endsWith('.pdf')
      ? 'application/pdf'
      : lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
          ? 'image/jpeg'
          : lower.endsWith('.html')
            ? 'text/html; charset=utf-8'
            : lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.log')
              ? 'text/plain; charset=utf-8'
              : lower.endsWith('.json')
                ? 'application/json'
                : lower.endsWith('.csv')
                  ? 'text/csv; charset=utf-8'
                  : 'application/octet-stream';
    c.header('Content-Type', ctype);
    c.header('Content-Disposition', `inline; filename="${rawPath.split('/').pop() ?? 'file'}"`);
    return c.body(body);
  } catch (err) {
    return c.json({ error: 'file not found', detail: (err as Error).message }, 404);
  }
});

// ---------- Active sessions (multi-session dashboard) ----------
app.get('/api/sessions/active', async (c) => {
  const { listActiveSessionsForUser } = await import('./services/active-sessions-list.js');
  return c.json({ sessions: await listActiveSessionsForUser(c.get('userId')) });
});

// ---------- Admin: usage summary ----------
app.get('/api/admin/usage-summary', async (c) => {
  const { getUsageSummary } = await import('./services/usage-summary.js');
  return c.json(await getUsageSummary());
});

// ---------- Skills (marketplace) ----------
app.get('/api/skills', async (c) => {
  const { listSkills } = await import('./services/skills.js');
  const status = c.req.query('status') as 'published' | 'scan_passed' | undefined;
  return c.json({ skills: await listSkills(status ? { status } : undefined) });
});
app.get('/api/skills/:id', async (c) => {
  const { getSkill } = await import('./services/skills.js');
  const skill = await getSkill(c.req.param('id'));
  if (!skill) return c.json({ error: 'not found' }, 404);
  return c.json(skill);
});
app.post('/api/skills', async (c) => {
  const { publishSkill, PublishSkillSchema } = await import('./services/skills.js');
  const parsed = PublishSkillSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const row = await publishSkill(c.get('userId'), parsed.data);
  return c.json(row);
});
app.post('/api/admin/skills/:id/approve', async (c) => {
  const { approveSkill } = await import('./services/skills.js');
  await approveSkill(c.req.param('id'), c.get('userId'));
  return c.json({ ok: true });
});
app.post('/api/admin/skills/:id/reject', async (c) => {
  const { rejectSkill } = await import('./services/skills.js');
  await rejectSkill(c.req.param('id'), c.get('userId'));
  return c.json({ ok: true });
});
app.post('/api/skills/:id/install', async (c) => {
  const { installSkill } = await import('./services/skills.js');
  const { profileId } = await c.req.json<{ profileId?: string }>();
  await installSkill({
    userId: c.get('userId'),
    profileId: profileId ?? 'default',
    skillId: c.req.param('id'),
  });
  return c.json({ ok: true });
});

// ---------- Dev helpers ----------
app.post('/api/dev/publish', async (c) => {
  const body = await c.req.json<{ sessionId: string; eventType: string; payload: unknown }>();
  await publishEvent({
    sessionId: body.sessionId,
    eventType: body.eventType as never,
    payload: body.payload,
  });
  return c.json({ ok: true });
});

function mapClaudeEventType(t: string): never {
  const known = new Map<string, string>([
    ['assistant', 'assistant.message'],
    ['message', 'assistant.message'],
    ['tool_use', 'tool_use'],
    ['tool_result', 'tool_result'],
    ['result', 'result'],
    ['system', 'system.init'],
    ['runner.stderr', 'error'],
    ['runner.error', 'error'],
    ['runner.aborted', 'error'],
    ['runner.parse_error', 'error'],
  ]);
  return (known.get(t) ?? 'assistant.message') as never;
}

function extractUsage(event: unknown): { input_tokens: number; output_tokens: number } | null {
  if (!event || typeof event !== 'object') return null;
  const e = event as { usage?: { input_tokens?: number; output_tokens?: number }; message?: { usage?: { input_tokens?: number; output_tokens?: number } } };
  const u = e.usage ?? e.message?.usage;
  if (!u || typeof u.input_tokens !== 'number' || typeof u.output_tokens !== 'number') return null;
  return { input_tokens: u.input_tokens, output_tokens: u.output_tokens };
}

// ---------- Lifecycle ----------
const port = config.RUNNER_PORT;
const server = serve({ fetch: app.fetch, port });
console.log(`[runner] listening on http://localhost:${port}`);

async function gracefulShutdown(sig: string) {
  console.log(`[runner] ${sig} received, cleaning up sessions...`);
  try {
    await shutdownAllSessions();
  } finally {
    server.close(() => process.exit(0));
  }
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

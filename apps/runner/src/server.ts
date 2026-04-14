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
} from './services/sessions.js';
import { getProfile, listProfiles, upsertProfile, CreateProfileSchema } from './services/profiles.js';
import { assertBudgetOk, getBudgetState, addUsage } from './services/budgets.js';
import { createTask, getTask, listTasks, setTaskStatus, addTaskCost } from './services/tasks.js';
import { writeAudit, listAudit } from './services/audit.js';
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

// ---------- Tasks ----------
app.get('/api/tasks', async (c) => c.json({ tasks: await listTasks(c.get('userId')) }));
app.get('/api/tasks/:id', async (c) => {
  const t = await getTask(c.req.param('id'), c.get('userId'));
  if (!t) return c.json({ error: 'not found' }, 404);
  return c.json(t);
});

// ---------- Session creation (core) ----------
const CreateSessionSchema = z.object({
  profileId: z.string().default('default'),
  prompt: z.string().min(1),
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

// ---------- Start / resume claude exec ----------
const StartClaudeSchema = z.object({
  prompt: z.string().min(1).optional(),
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  resumeSessionId: z.string().optional(),
});
app.post('/api/sessions/:id/claude/start', async (c) => {
  const sessionId = c.req.param('id');
  const session = getActiveSession(sessionId);
  if (!session) return c.json({ error: 'session not active' }, 404);
  if (session.userId !== c.get('userId')) return c.json({ error: 'forbidden' }, 403);

  const parsed = StartClaudeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const profile = await getProfile(session.profileId);
  const task = await getTask(session.taskId, session.userId);

  const exec = await session.sandbox.execClaude({
    prompt: parsed.data.prompt ?? task?.prompt ?? 'Inspect the /workspace directory and describe what you find.',
    allowedTools: parsed.data.allowedTools ?? profile.allowedTools,
    disallowedTools: parsed.data.disallowedTools ?? profile.disallowedTools,
    resumeSessionId: parsed.data.resumeSessionId,
    maxTurns: profile.maxTurns,
    timeLimitSeconds: profile.timeLimitSeconds,
  });

  session.claudeExec = exec;
  await setTaskStatus(session.taskId, 'running');

  exec.onEvent(async (event) => {
    try {
      await publishEvent({
        sessionId,
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
          await addUsage(session.userId, cost);
        }
      }
    } catch (err) {
      console.error('[runner] onEvent error', err);
    }
  });
  exec.onExit(async (code) => {
    await setTaskStatus(session.taskId, code === 0 ? 'succeeded' : 'failed');
    await publishEvent({
      sessionId,
      eventType: 'result',
      payload: { exitCode: code },
    });
  });
  exec.onError(async (err) => {
    await publishEvent({
      sessionId,
      eventType: 'error',
      payload: { message: err.message },
    });
    await setTaskStatus(session.taskId, 'failed');
  });

  return c.json({ ok: true });
});

app.post('/api/sessions/:id/claude/prompt', async (c) => {
  const sessionId = c.req.param('id');
  const session = getActiveSession(sessionId);
  if (!session?.claudeExec) return c.json({ error: 'claude not started' }, 409);
  if (session.userId !== c.get('userId')) return c.json({ error: 'forbidden' }, 403);

  const { text } = await c.req.json<{ text: string }>();
  session.claudeExec.send({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] },
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

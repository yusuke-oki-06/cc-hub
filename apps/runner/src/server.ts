import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config.js';
import { requireToken } from './auth.js';
import { sql } from './db/client.js';
import { publishEvent } from './events/publish.js';
import { streamSession } from './sse.js';

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

app.use('/api/*', requireToken);

app.post('/api/dev/publish', async (c) => {
  const body = await c.req.json<{ sessionId: string; eventType: string; payload: unknown }>();
  await publishEvent({
    sessionId: body.sessionId,
    eventType: body.eventType as never,
    payload: body.payload,
  });
  return c.json({ ok: true });
});

app.post('/api/dev/seed-session', async (c) => {
  const body = await c.req.json<{ sessionId: string; taskId?: string }>();
  const userId = c.get('userId');
  const taskId = body.taskId ?? body.sessionId;
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO tasks (id, user_id, profile_id, repo_path, prompt, status)
      VALUES (${taskId}::uuid, ${userId}::uuid, 'default', './', '(dev seed)', 'running')
      ON CONFLICT (id) DO NOTHING
    `;
    await tx`
      INSERT INTO sessions (id, task_id, user_id, workspace_path)
      VALUES (${body.sessionId}::uuid, ${taskId}::uuid, ${userId}::uuid, './')
      ON CONFLICT (id) DO NOTHING
    `;
  });
  return c.json({ ok: true });
});

app.get('/api/sessions/:sessionId/events', async (c) => {
  const sessionId = c.req.param('sessionId');
  const userId = c.get('userId');
  const owner = await sql<{ user_id: string }[]>`
    SELECT user_id FROM sessions WHERE id = ${sessionId}::uuid LIMIT 1
  `;
  if (!owner[0]) return c.json({ error: 'session not found' }, 404);
  if (owner[0].user_id !== userId) return c.json({ error: 'forbidden' }, 403);

  return streamSession(c, sessionId);
});

const port = config.RUNNER_PORT;
serve({ fetch: app.fetch, port });
console.log(`[runner] listening on http://localhost:${port}`);

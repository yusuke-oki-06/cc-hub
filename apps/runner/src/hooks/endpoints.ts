import { Hono } from 'hono';
import { z } from 'zod';
import {
  checkBashCommand,
  checkGitCommand,
  checkPath,
  redactSecrets,
} from '@cc-hub/guardrails';
import { getActiveSession } from '../services/sessions.js';
import { getProfile } from '../services/profiles.js';
import { writeAudit } from '../services/audit.js';
import { publishEvent } from '../events/publish.js';
import { config } from '../config.js';

const HookContextSchema = z
  .object({
    tool_name: z.string().optional(),
    tool_input: z.record(z.string(), z.unknown()).optional(),
    session_id: z.string().optional(),
    hook_event_name: z.string().optional(),
  })
  .passthrough();

async function authorizeHook(c: {
  req: { header: (name: string) => string | undefined };
}): Promise<{ sessionId: string; profileId: string } | null> {
  const auth = c.req.header('Authorization');
  const expected = `Bearer ${config.RUNNER_API_TOKEN}`;
  if (!auth) return null;
  let diff = auth.length ^ expected.length;
  for (let i = 0; i < Math.min(auth.length, expected.length); i++) {
    diff |= auth.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;
  const sessionId = c.req.header('X-CCHUB-Session');
  const profileId = c.req.header('X-CCHUB-Profile') ?? 'default';
  if (!sessionId) return null;
  return { sessionId, profileId };
}

export const hooksApp = new Hono();

hooksApp.post('/pre-tool-use', async (c) => {
  const auth = await authorizeHook(c);
  if (!auth) return c.json({ error: 'unauthorized' }, 401);

  const bodyText = await c.req.text();
  let ctx: z.infer<typeof HookContextSchema>;
  try {
    ctx = HookContextSchema.parse(JSON.parse(bodyText));
  } catch {
    return c.json({ error: 'invalid body' }, 400);
  }

  const session = getActiveSession(auth.sessionId);
  if (!session) return c.json({ error: 'session not active' }, 404);
  const profile = await getProfile(auth.profileId).catch(() => null);
  if (!profile) return c.json({ error: 'profile not found' }, 400);

  const toolName = ctx.tool_name ?? 'Unknown';
  const input = ctx.tool_input ?? {};
  let blockReason: string | null = null;

  if (toolName === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : '';
    if (/\bgit\b/.test(command)) {
      const r = checkGitCommand(command);
      if (!r.ok) blockReason = r.reason ?? 'git blocked';
    }
    if (!blockReason) {
      const r = checkBashCommand(command, {
        allowlist: profile.bashAllowlist,
        denyPipes: profile.denyPipes,
        denyRedirects: profile.denyRedirects,
      });
      if (!r.ok) blockReason = r.reason ?? 'bash blocked';
    }
  } else if (toolName === 'Read' || toolName === 'Edit' || toolName === 'Write') {
    const target =
      typeof input.file_path === 'string'
        ? input.file_path
        : typeof input.path === 'string'
          ? input.path
          : '';
    if (target) {
      const r = checkPath(target, { workspaceRoot: '/workspace', allowEscape: false });
      if (!r.ok) blockReason = r.reason ?? 'path blocked';
    }
  } else if (toolName === 'WebFetch' && !profile.allowWebFetch) {
    blockReason = 'WebFetch is disabled by profile';
  } else if (toolName === 'WebSearch' && !profile.allowWebSearch) {
    blockReason = 'WebSearch is disabled by profile';
  }

  if (!profile.allowedTools.includes(toolName) && toolName !== 'Unknown') {
    if (profile.disallowedTools.includes(toolName)) {
      blockReason = `tool "${toolName}" is in disallow list`;
    } else if (!['Bash'].includes(toolName)) {
      // allowedTools が非空で、この tool が入っていない場合は deny
      if (profile.allowedTools.length > 0 && !profile.allowedTools.includes(toolName)) {
        blockReason = `tool "${toolName}" is not in allowed list`;
      }
    }
  }

  await writeAudit({
    userId: session.userId,
    sessionId: session.sessionId,
    taskId: session.taskId,
    kind: 'guardrail',
    payload: { toolName, blocked: blockReason !== null, reason: blockReason, input },
  });

  if (blockReason) {
    await publishEvent({
      sessionId: session.sessionId,
      eventType: 'guardrail.blocked',
      payload: { toolName, reason: blockReason },
    });
    return c.json({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `CC Hub guardrail: ${blockReason}`,
      },
    });
  }

  return c.json({});
});

hooksApp.post('/post-tool-use', async (c) => {
  const auth = await authorizeHook(c);
  if (!auth) return c.json({ error: 'unauthorized' }, 401);

  const bodyText = await c.req.text();
  let ctx: z.infer<typeof HookContextSchema>;
  try {
    ctx = HookContextSchema.parse(JSON.parse(bodyText));
  } catch {
    return c.json({ error: 'invalid body' }, 400);
  }

  const session = getActiveSession(auth.sessionId);
  if (!session) return c.json({ error: 'session not active' }, 404);

  const safe = redactSecrets(JSON.stringify(ctx), { entropy: false });
  await writeAudit({
    userId: session.userId,
    sessionId: session.sessionId,
    taskId: session.taskId,
    kind: 'tool_use',
    payload: JSON.parse(safe.redacted),
  });

  return c.json({});
});

hooksApp.post('/user-prompt-submit', async (c) => {
  const auth = await authorizeHook(c);
  if (!auth) return c.json({ error: 'unauthorized' }, 401);

  const bodyText = await c.req.text();
  const session = getActiveSession(auth.sessionId);
  if (!session) return c.json({ error: 'session not active' }, 404);

  const safe = redactSecrets(bodyText, { entropy: false });
  await writeAudit({
    userId: session.userId,
    sessionId: session.sessionId,
    taskId: session.taskId,
    kind: 'prompt',
    payload: { raw: safe.redacted.slice(0, 8192) },
  });

  return c.json({});
});

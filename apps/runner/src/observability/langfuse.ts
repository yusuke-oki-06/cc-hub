import { Langfuse } from 'langfuse';
import type { ClaudeStreamEvent } from '@cc-hub/shared';

let client: Langfuse | null = null;

function getClient(): Langfuse | null {
  if (client) return client;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_HOST ?? 'http://localhost:3100';
  if (!publicKey || !secretKey) return null;
  client = new Langfuse({ publicKey, secretKey, baseUrl, flushAt: 1, flushInterval: 2000 });
  return client;
}

let cachedProjectId: string | null = null;

/**
 * Resolve the Langfuse project ID owning the configured API keys.
 * Order:
 *   1. LANGFUSE_PROJECT_ID env (operator override)
 *   2. GET {host}/api/public/projects authed with PK/SK — first project
 *   3. null  → caller renders no link (existing fallback behaviour)
 * Cached after first success.
 */
async function resolveProjectId(): Promise<string | null> {
  if (cachedProjectId) return cachedProjectId;
  const explicit = process.env.LANGFUSE_PROJECT_ID;
  if (explicit) {
    cachedProjectId = explicit;
    return cachedProjectId;
  }
  const host = process.env.LANGFUSE_HOST;
  const pk = process.env.LANGFUSE_PUBLIC_KEY;
  const sk = process.env.LANGFUSE_SECRET_KEY;
  if (!host || !pk || !sk) return null;
  try {
    const r = await fetch(`${host.replace(/\/$/, '')}/api/public/projects`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${pk}:${sk}`).toString('base64') },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) {
      console.warn(`[langfuse] /api/public/projects returned ${r.status}`);
      return null;
    }
    const body = (await r.json()) as { data?: Array<{ id: string; name?: string }> };
    const id = body.data?.[0]?.id ?? null;
    if (id) {
      cachedProjectId = id;
      console.log(`[langfuse] resolved project id = ${id} (${body.data?.[0]?.name ?? '?'})`);
    }
    return id;
  } catch (err) {
    console.warn('[langfuse] resolveProjectId failed', err);
    return null;
  }
}

/** Aggregated model usage since the start of the current month. Fetches
 *  GENERATION observations from Langfuse's public API (paginated) and groups
 *  by model name. Returns null when Langfuse is not configured. */
export async function getModelBreakdownSinceMonth(): Promise<
  Array<{ model: string; count: number; inputTokens: number; outputTokens: number }> | null
> {
  const host = process.env.LANGFUSE_HOST;
  const pk = process.env.LANGFUSE_PUBLIC_KEY;
  const sk = process.env.LANGFUSE_SECRET_KEY;
  if (!host || !pk || !sk) return null;
  const auth = 'Basic ' + Buffer.from(`${pk}:${sk}`).toString('base64');
  // Start of this month in ISO (UTC).
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const agg = new Map<
    string,
    { count: number; inputTokens: number; outputTokens: number }
  >();
  const limit = 100;
  const maxPages = 20; // cap to keep dashboard snappy; ~2000 generations
  for (let page = 1; page <= maxPages; page++) {
    const url = `${host.replace(/\/$/, '')}/api/public/observations?type=GENERATION&fromStartTime=${encodeURIComponent(since)}&limit=${limit}&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.warn('[langfuse] observations fetch failed', err);
      return null;
    }
    if (!res.ok) {
      console.warn(`[langfuse] observations returned ${res.status}`);
      return null;
    }
    const body = (await res.json()) as {
      data?: Array<{
        model?: string | null;
        usage?: {
          input?: number;
          output?: number;
          total?: number;
          promptTokens?: number;
          completionTokens?: number;
          inputTokens?: number;
          outputTokens?: number;
        } | null;
        promptTokens?: number;
        completionTokens?: number;
      }>;
      meta?: { totalPages?: number; totalItems?: number };
    };
    const rows = body.data ?? [];
    for (const r of rows) {
      const model = r.model ?? 'unknown';
      const a = agg.get(model) ?? { count: 0, inputTokens: 0, outputTokens: 0 };
      a.count += 1;
      // Langfuse observation schema varies across versions/SDKs — try all
      // known field names to capture input/output token counts.
      a.inputTokens +=
        r.usage?.input ??
        r.usage?.inputTokens ??
        r.usage?.promptTokens ??
        r.promptTokens ??
        0;
      a.outputTokens +=
        r.usage?.output ??
        r.usage?.outputTokens ??
        r.usage?.completionTokens ??
        r.completionTokens ??
        0;
      agg.set(model, a);
    }
    if (rows.length < limit) break;
    const totalPages = body.meta?.totalPages;
    if (typeof totalPages === 'number' && page >= totalPages) break;
  }
  return Array.from(agg.entries())
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.count - a.count);
}

export async function langfuseDeepLink(traceId: string): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_LANGFUSE_URL ?? process.env.LANGFUSE_HOST ?? null;
  if (!base) return null;
  const projectId = await resolveProjectId();
  if (!projectId) return null;
  return `${base.replace(/\/$/, '')}/project/${projectId}/traces/${traceId}`;
}

export interface SessionTraceContext {
  traceId: string;
  end(summary?: Record<string, unknown>): Promise<void>;
  observeEvent(event: ClaudeStreamEvent): void;
}

export function startSessionTrace(input: {
  sessionId: string;
  taskId: string;
  userId: string;
  profileId: string;
  prompt: string;
  projectId?: string | null;
}): SessionTraceContext {
  const lf = getClient();
  if (!lf) {
    return {
      traceId: 'noop',
      end: async () => undefined,
      observeEvent: () => undefined,
    };
  }

  const trace = lf.trace({
    id: input.sessionId,
    name: 'cc-hub-session',
    userId: input.userId,
    sessionId: input.sessionId,
    input: { prompt: input.prompt, profileId: input.profileId, taskId: input.taskId },
    metadata: {
      profileId: input.profileId,
      taskId: input.taskId,
      projectId: input.projectId ?? null,
    },
  });

  const activeSpans = new Map<string, ReturnType<(typeof trace)['span']>>();

  return {
    traceId: trace.id,
    end: async (summary) => {
      trace.update({ output: summary ?? {} });
      await lf.flushAsync();
    },
    observeEvent: (event) => {
      try {
        if (event.type === 'assistant' || event.type === 'message') {
          // Anthropic splits input tokens into base / cache-read / cache-creation.
          // Include all three in the Langfuse "input" count so model-usage
          // volume reflects total context consumed (exec dashboard).
          const u = (event as {
            usage?: {
              input_tokens?: number;
              output_tokens?: number;
              cache_read_input_tokens?: number;
              cache_creation_input_tokens?: number;
            };
          }).usage;
          const model = (event as { message?: { model?: string } }).message?.model;
          const inputTotal =
            (u?.input_tokens ?? 0) +
            (u?.cache_read_input_tokens ?? 0) +
            (u?.cache_creation_input_tokens ?? 0);
          trace.generation({
            name: 'assistant.message',
            model,
            usage: u
              ? { input: inputTotal, output: u.output_tokens ?? 0, unit: 'TOKENS' }
              : undefined,
            output: event,
          });
        } else if (event.type === 'tool_use') {
          const id = (event as { id?: string }).id ?? `${Date.now()}`;
          const span = trace.span({
            name: `tool:${(event as { name?: string }).name ?? 'unknown'}`,
            input: (event as { input?: unknown }).input,
          });
          activeSpans.set(id, span);
        } else if (event.type === 'tool_result') {
          const id = (event as { tool_use_id?: string }).tool_use_id;
          if (id) {
            const span = activeSpans.get(id);
            if (span) {
              span.end({ output: (event as { content?: unknown }).content });
              activeSpans.delete(id);
            }
          }
        } else if (event.type === 'result') {
          trace.update({
            output: event,
          });
        }
      } catch (err) {
        console.warn('[langfuse] observeEvent failed', err);
      }
    },
  };
}

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

export function langfuseDeepLink(traceId: string): string | null {
  const base = process.env.NEXT_PUBLIC_LANGFUSE_URL ?? process.env.LANGFUSE_HOST ?? null;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/project/cc-hub-phase1/traces/${traceId}`;
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
    metadata: { profileId: input.profileId, taskId: input.taskId },
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
          const usage = (event as { usage?: { input_tokens?: number; output_tokens?: number } })
            .usage;
          const model = (event as { message?: { model?: string } }).message?.model;
          trace.generation({
            name: 'assistant.message',
            model,
            usage: usage
              ? { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0, unit: 'TOKENS' }
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

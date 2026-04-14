import { z } from 'zod';

export const SseEventTypeSchema = z.enum([
  'system.init',
  'assistant.delta',
  'assistant.message',
  'tool_use',
  'tool_result',
  'permission_request',
  'permission_resolved',
  'ask_user_question',
  'ask_user_answered',
  'result',
  'error',
  'guardrail.blocked',
  'budget.exceeded',
]);
export type SseEventType = z.infer<typeof SseEventTypeSchema>;

export const SseEventSchema = z.object({
  sessionId: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  type: SseEventTypeSchema,
  payload: z.unknown(),
  createdAt: z.string().datetime(),
  parentToolUseId: z.string().optional(),
});
export type SseEvent = z.infer<typeof SseEventSchema>;

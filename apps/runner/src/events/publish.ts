import { redactSecrets } from '@cc-hub/guardrails';
import type { SseEventType } from '@cc-hub/shared';
import { config } from '../config.js';
import { eventBus } from './bus.js';
import { appendEvent } from './store.js';

export async function publishEvent(input: {
  sessionId: string;
  eventType: SseEventType;
  payload: unknown;
  parentToolUseId?: string;
  redact?: boolean;
}): Promise<void> {
  let payload = input.payload;
  if (input.redact !== false) {
    const json = JSON.stringify(payload);
    if (json && json.length > 0) {
      const redacted = redactSecrets(json, { entropy: false });
      if (redacted.hits.length > 0) {
        payload = JSON.parse(redacted.redacted);
      }
    }
  }
  const sizeBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (sizeBytes > config.SSE_EVENT_MAX_BYTES) {
    payload = {
      truncated: true,
      originalBytes: sizeBytes,
      message: 'event payload exceeded SSE_EVENT_MAX_BYTES and was truncated by Runner',
    };
  }

  const stored = await appendEvent({
    sessionId: input.sessionId,
    eventType: input.eventType,
    payload,
    parentToolUseId: input.parentToolUseId,
  });
  eventBus.emitForSession(input.sessionId, stored);
}

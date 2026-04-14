import { redactSecrets } from '@cc-hub/guardrails';
import type { SseEventType } from '@cc-hub/shared';
import { config } from '../config.js';
import { eventBus } from './bus.js';
import { appendEvent } from './store.js';
import { extractSaasLinks } from './saas-extractor.js';

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

  // Scan tool_result (and message payloads that reference SaaS links) for
  // well-known URLs so the WebUI can offer an iframe / link card.
  if (input.eventType === 'tool_result' || input.eventType === 'assistant.message') {
    try {
      const links = extractSaasLinks(payload);
      for (const link of links) {
        const linked = await appendEvent({
          sessionId: input.sessionId,
          eventType: 'saas_link',
          payload: link,
        });
        eventBus.emitForSession(input.sessionId, linked);
      }
    } catch (err) {
      console.warn('[publish] saas link extraction failed', err);
    }
  }
}

import { stream } from 'hono/streaming';
import type { Context } from 'hono';
import { eventBus } from './events/bus.js';
import { readEventsAfter, toSseEvent, type StoredEvent } from './events/store.js';

const HEARTBEAT_INTERVAL_MS = 15_000;

function formatSse(event: StoredEvent): string {
  const sse = toSseEvent(event);
  const lines = [
    `id: ${sse.seq}`,
    `event: ${sse.type}`,
    `data: ${JSON.stringify(sse)}`,
    '',
    '',
  ];
  return lines.join('\n');
}

export function streamSession(c: Context, sessionId: string): Response {
  const lastEventIdHeader = c.req.header('Last-Event-ID');
  const lastSeq = lastEventIdHeader ? Number.parseInt(lastEventIdHeader, 10) : -1;
  const startSeq = Number.isFinite(lastSeq) ? lastSeq : -1;

  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  return stream(c, async (writer) => {
    const buffer: StoredEvent[] = [];
    let isReplaying = true;

    const unsubscribe = eventBus.onSession(sessionId, (event) => {
      if (isReplaying) {
        buffer.push(event);
      } else {
        void writer.write(formatSse(event));
      }
    });

    let heartbeat: NodeJS.Timeout | undefined;
    try {
      const replay = await readEventsAfter(sessionId, startSeq);
      for (const ev of replay) {
        await writer.write(formatSse(ev));
      }
      const lastReplaySeq = replay[replay.length - 1]?.seq ?? startSeq;

      isReplaying = false;
      for (const ev of buffer) {
        if (ev.seq > lastReplaySeq) {
          await writer.write(formatSse(ev));
        }
      }
      buffer.length = 0;

      heartbeat = setInterval(() => {
        void writer.write(`: heartbeat ${Date.now()}\n\n`);
      }, HEARTBEAT_INTERVAL_MS);

      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    }
  });
}

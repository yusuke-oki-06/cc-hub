import type { SseEvent } from '@cc-hub/shared';
import { getAuthHeader, runnerBase } from './api';

export interface SseHandle {
  close: () => void;
}

/**
 * SSE client with Last-Event-ID replay + auto reconnect + manual fetch reader
 * (EventSource doesn't support Authorization header, so use fetch streaming).
 */
export function subscribeSession(
  sessionId: string,
  onEvent: (ev: SseEvent) => void,
  onError?: (err: Error) => void,
): SseHandle {
  let abort = new AbortController();
  let closed = false;
  let lastEventId = -1;

  const loop = async () => {
    while (!closed) {
      try {
        const headers: Record<string, string> = {
          Authorization: getAuthHeader(),
          Accept: 'text/event-stream',
        };
        if (lastEventId >= 0) headers['Last-Event-ID'] = String(lastEventId);
        const res = await fetch(`${runnerBase}/api/sessions/${sessionId}/events`, {
          signal: abort.signal,
          headers,
        });
        if (!res.ok || !res.body) {
          await delay(2000);
          continue;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (!closed) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          while (true) {
            const sep = buf.indexOf('\n\n');
            if (sep < 0) break;
            const chunk = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            const parsed = parseSseChunk(chunk);
            if (parsed) {
              lastEventId = Math.max(lastEventId, parsed.seq);
              onEvent(parsed.event);
            }
          }
        }
      } catch (err) {
        if (closed) return;
        if (onError && err instanceof Error) onError(err);
        await delay(1500);
      }
    }
  };
  void loop();

  return {
    close: () => {
      closed = true;
      abort.abort();
    },
  };
}

function parseSseChunk(chunk: string): { seq: number; event: SseEvent } | null {
  let id = -1;
  let dataLines: string[] = [];
  for (const line of chunk.split('\n')) {
    if (line.startsWith('id:')) id = Number(line.slice(3).trim());
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    else if (line.startsWith(':')) {
      // comment / heartbeat
    }
  }
  if (dataLines.length === 0) return null;
  try {
    const ev = JSON.parse(dataLines.join('\n')) as SseEvent;
    return { seq: id >= 0 ? id : ev.seq, event: ev };
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

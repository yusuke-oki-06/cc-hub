import { ClaudeStreamEventSchema, type ClaudeStreamEvent } from '@cc-hub/shared';

/**
 * stdout バイト列を改行区切り JSON として段階的にパース。
 * 巨大行の DoS 回避に行長上限を設ける。
 */
export class StreamJsonParser {
  private buffer = '';
  constructor(private readonly maxLineBytes = 4 * 1024 * 1024) {}

  push(chunk: Buffer | string): ClaudeStreamEvent[] {
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const out: ClaudeStreamEvent[] = [];

    while (true) {
      const nl = this.buffer.indexOf('\n');
      if (nl < 0) break;
      const raw = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!raw) continue;
      if (Buffer.byteLength(raw, 'utf8') > this.maxLineBytes) {
        out.push({
          type: 'runner.error',
          error: 'stream_line_too_large',
          bytes: Buffer.byteLength(raw, 'utf8'),
        });
        continue;
      }
      try {
        const json = JSON.parse(raw) as unknown;
        const parsed = ClaudeStreamEventSchema.safeParse(json);
        if (parsed.success) {
          out.push(parsed.data);
        } else {
          out.push({ type: 'runner.parse_error', raw: raw.slice(0, 200), issues: parsed.error.issues });
        }
      } catch (err) {
        out.push({
          type: 'runner.parse_error',
          raw: raw.slice(0, 200),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return out;
  }

  flush(): ClaudeStreamEvent[] {
    const remaining = this.buffer.trim();
    this.buffer = '';
    if (!remaining) return [];
    try {
      const json = JSON.parse(remaining) as unknown;
      const parsed = ClaudeStreamEventSchema.safeParse(json);
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  }
}

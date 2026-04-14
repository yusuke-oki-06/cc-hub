import { sql } from '../db/client.js';
import { redactSecrets } from '@cc-hub/guardrails';

export interface AuditEntry {
  userId?: string;
  sessionId?: string;
  taskId?: string;
  kind: 'prompt' | 'tool_use' | 'permission' | 'guardrail' | 'budget' | 'system';
  payload: unknown;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  const json = JSON.stringify(entry.payload);
  const redacted = redactSecrets(json, { entropy: false });
  const finalPayload: unknown =
    redacted.hits.length > 0 ? JSON.parse(redacted.redacted) : entry.payload;

  await sql`
    INSERT INTO audit_log (user_id, session_id, task_id, kind, payload, redacted)
    VALUES (
      ${entry.userId ?? null},
      ${entry.sessionId ?? null},
      ${entry.taskId ?? null},
      ${entry.kind},
      ${sql.json(finalPayload as never)},
      ${redacted.hits.length > 0}
    )
  `;
}

export async function listAudit(
  opts: { userId?: string; sessionId?: string; limit?: number } = {},
): Promise<
  Array<{ id: string; ts: string; kind: string; payload: unknown; redacted: boolean }>
> {
  const limit = Math.min(opts.limit ?? 200, 1000);
  if (opts.sessionId) {
    return sql`
      SELECT id::text, ts::text, kind, payload, redacted FROM audit_log
      WHERE session_id = ${opts.sessionId}::uuid ORDER BY ts DESC LIMIT ${limit}
    ` as never;
  }
  if (opts.userId) {
    return sql`
      SELECT id::text, ts::text, kind, payload, redacted FROM audit_log
      WHERE user_id = ${opts.userId}::uuid ORDER BY ts DESC LIMIT ${limit}
    ` as never;
  }
  return sql`
    SELECT id::text, ts::text, kind, payload, redacted FROM audit_log
    ORDER BY ts DESC LIMIT ${limit}
  ` as never;
}

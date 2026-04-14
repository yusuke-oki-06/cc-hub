import { sql } from '../db/client.js';
import type { SseEvent, SseEventType } from '@cc-hub/shared';

export interface AppendEventInput {
  sessionId: string;
  eventType: SseEventType;
  payload: unknown;
  parentToolUseId?: string;
}

export interface StoredEvent {
  sessionId: string;
  seq: number;
  eventType: SseEventType;
  payload: unknown;
  parentToolUseId?: string;
  createdAt: string;
}

export async function appendEvent(input: AppendEventInput): Promise<StoredEvent> {
  // セッション単位で advisory-xact-lock を取り、並行 publish でも seq が衝突しないことを保証する。
  // `hashtextextended(session_id::text, 0)` で bigint key を生成、txn 終了で自動解放。
  return await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${input.sessionId}::text, 0))`;
    const rows = await tx<StoredEvent[]>`
      WITH next AS (
        SELECT COALESCE(MAX(seq), -1) + 1 AS seq
        FROM events
        WHERE session_id = ${input.sessionId}::uuid
      )
      INSERT INTO events (session_id, seq, event_type, payload, parent_tool_use_id)
      SELECT ${input.sessionId}::uuid, next.seq, ${input.eventType}, ${tx.json(input.payload as never)}, ${input.parentToolUseId ?? null}
      FROM next
      RETURNING
        session_id  AS "sessionId",
        seq,
        event_type  AS "eventType",
        payload,
        parent_tool_use_id AS "parentToolUseId",
        created_at  AS "createdAt"
    `;
    if (!rows[0]) throw new Error('failed to append event');
    return rows[0];
  });
}

export async function readEventsAfter(
  sessionId: string,
  afterSeq: number,
): Promise<StoredEvent[]> {
  return sql<StoredEvent[]>`
    SELECT
      session_id  AS "sessionId",
      seq,
      event_type  AS "eventType",
      payload,
      parent_tool_use_id AS "parentToolUseId",
      created_at  AS "createdAt"
    FROM events
    WHERE session_id = ${sessionId}::uuid
      AND seq > ${afterSeq}
    ORDER BY seq ASC
  `;
}

export function toSseEvent(stored: StoredEvent): SseEvent {
  return {
    sessionId: stored.sessionId,
    seq: stored.seq,
    type: stored.eventType,
    payload: stored.payload,
    parentToolUseId: stored.parentToolUseId,
    createdAt:
      typeof stored.createdAt === 'string'
        ? stored.createdAt
        : new Date(stored.createdAt as unknown as string | number | Date).toISOString(),
  };
}

import { z } from 'zod';

/**
 * Claude Code CLI `--output-format=stream-json` の 1 行 1 JSON 形式。
 * 公式仕様は非公開に近いので観測ベースで構造を検証する。
 * 不明なイベントは passthrough で保存し、zod は最小限の必須フィールドのみ要求する。
 */
export const ClaudeStreamEventSchema = z
  .object({
    type: z.string(),
    session_id: z.string().nullish(),
    // Claude CLI emits null (not just undefined) for partial/stream events,
    // so accept both shapes instead of flagging as parse_error.
    parent_tool_use_id: z.string().nullish(),
  })
  .passthrough();
export type ClaudeStreamEvent = z.infer<typeof ClaudeStreamEventSchema>;

/**
 * Runner が stdin に書き込んで Claude CLI に投入するメッセージ。
 * `{"type":"user","message":{"role":"user","content":"..."}}` 形式。
 */
export interface ClaudeStdinMessage {
  type: string;
  [k: string]: unknown;
}

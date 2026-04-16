import { z } from 'zod';

/**
 * Models exposed to the GUI. Claude Code CLI's `--model` flag accepts either
 * the canonical Anthropic ID (e.g. "claude-opus-4-6-20251015") or a short
 * alias (e.g. "opus", "sonnet", "haiku"). We pass the alias through since it's
 * forward-compatible with minor version bumps.
 */
export const CLAUDE_MODELS = [
  { id: 'opus', label: 'Opus 4.6', blurb: '複雑な解析・長文理解・ビジネス文脈' },
  { id: 'sonnet', label: 'Sonnet 4.6', blurb: '日常のファイル解析と軽めのコード作業' },
  { id: 'haiku', label: 'Haiku 4.5', blurb: '要約・短い応答・繰り返しタスク' },
] as const;

export type ClaudeModelId = (typeof CLAUDE_MODELS)[number]['id'];

export const ClaudeModelIdSchema = z.enum(['opus', 'sonnet', 'haiku']);

/**
 * Permission modes supported by Claude Code CLI. `bypassPermissions` is
 * intentionally excluded from the GUI: it turns off guardrails.
 */
export const GUI_PERMISSION_MODES = [
  { id: 'default', label: '通常', blurb: 'プロファイル設定通り' },
  { id: 'plan', label: 'プランモード', blurb: '実装はせず調査と計画を返す' },
  { id: 'acceptEdits', label: '編集を承認', blurb: 'Edit/Write を自動許可 (tool は profile に従う)' },
] as const;

export type GuiPermissionMode = (typeof GUI_PERMISSION_MODES)[number]['id'];

export const GuiPermissionModeSchema = z.enum(['default', 'plan', 'acceptEdits']);

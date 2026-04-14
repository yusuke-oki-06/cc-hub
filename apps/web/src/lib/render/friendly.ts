import type { SseEvent } from '@cc-hub/shared';

export type FriendlyKind =
  | 'user'
  | 'assistant'
  | 'tool.running'
  | 'tool.finished'
  | 'permission'
  | 'result.success'
  | 'result.failure'
  | 'guardrail'
  | 'budget'
  | 'saas_link'
  | 'hidden';

export interface FriendlyItem {
  seq: number;
  kind: FriendlyKind;
  title: string;               // short 1-line summary
  body?: string;               // optional longer markdown body
  meta?: string;               // right-aligned metadata (time, bytes)
  data?: unknown;              // raw payload for debug
  toolUseId?: string;          // for pairing tool.running ↔ tool.finished
}

/**
 * Claude Code stream-json → 非エンジニア向けの日本語会話表現に変換。
 * 既定では system.init / rate_limit_event / runner.* / parse_error は hidden
 * として返し、render 側でフィルタする。developer モードでは raw JSON を別途表示。
 */
export function toFriendly(ev: SseEvent): FriendlyItem {
  const payload = (ev.payload ?? {}) as Record<string, unknown>;
  const time = ev.createdAt?.slice(11, 19);

  switch (ev.type) {
    case 'assistant.message': {
      const inner = (payload as { type?: string; message?: Record<string, unknown> }).type;
      if (inner === 'rate_limit_event') {
        return { seq: ev.seq, kind: 'hidden', title: 'rate_limit_event' };
      }
      const msg = (payload as { message?: { content?: Array<{ type: string; text?: string; name?: string; input?: unknown }> } })
        .message;
      const content = msg?.content ?? [];
      const text = content
        .filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text!)
        .join('\n')
        .trim();
      const tools = content.filter((c) => c.type === 'tool_use');
      if (text) {
        return { seq: ev.seq, kind: 'assistant', title: 'Claude', body: text, meta: time };
      }
      if (tools.length > 0) {
        const first = tools[0] as { name?: string; input?: Record<string, unknown>; id?: string } | undefined;
        return {
          seq: ev.seq,
          kind: 'tool.running',
          title: summarizeToolCall(first?.name ?? 'Tool', first?.input ?? {}),
          meta: time,
          toolUseId: first?.id,
        };
      }
      return { seq: ev.seq, kind: 'hidden', title: 'assistant.empty' };
    }

    case 'tool_use': {
      return {
        seq: ev.seq,
        kind: 'tool.running',
        title: summarizeToolCall(
          (payload.name as string) ?? 'Tool',
          (payload.input as Record<string, unknown>) ?? {},
        ),
        toolUseId: (payload.id as string) ?? undefined,
        meta: time,
      };
    }

    case 'tool_result': {
      const id = (payload.tool_use_id as string) ?? undefined;
      const isError = payload.is_error === true;
      const contentArr = Array.isArray(payload.content) ? (payload.content as Array<{ type: string; text?: string }>) : [];
      const outputText = contentArr
        .filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text!)
        .join('\n')
        .trim();
      const summary = isError
        ? '失敗'
        : outputText
          ? `${outputText.length > 120 ? outputText.slice(0, 120) + '…' : outputText}`
          : '完了';
      return {
        seq: ev.seq,
        kind: 'tool.finished',
        title: isError ? '⚠ ツール実行エラー' : '✓ ツール実行完了',
        body: outputText || undefined,
        meta: summary,
        toolUseId: id,
        data: payload,
      };
    }

    case 'permission_request': {
      const toolName = (payload.toolName as string) ?? (payload.tool_name as string) ?? 'ツール';
      return {
        seq: ev.seq,
        kind: 'permission',
        title: `承認が必要: ${toolName}`,
        body: JSON.stringify((payload as { input?: unknown }).input ?? {}, null, 2),
        meta: time,
        data: payload,
      };
    }

    case 'permission_resolved': {
      const decision = payload.decision as string | undefined;
      return {
        seq: ev.seq,
        kind: 'hidden',
        title: `permission ${decision}`,
      };
    }

    case 'result': {
      const code = payload.exitCode as number | undefined;
      if (code !== undefined) {
        return {
          seq: ev.seq,
          kind: code === 0 ? 'result.success' : 'result.failure',
          title: code === 0 ? '✅ 完了しました' : `❌ 失敗しました (exit ${code})`,
          meta: time,
        };
      }
      const text = (payload as { result?: string }).result;
      if (typeof text === 'string') {
        return { seq: ev.seq, kind: 'result.success', title: '✅ 最終回答', body: text, meta: time };
      }
      return { seq: ev.seq, kind: 'hidden', title: 'result.meta' };
    }

    case 'guardrail.blocked': {
      const reason = (payload.reason as string) ?? '';
      const toolName = (payload.toolName as string) ?? 'ツール';
      return {
        seq: ev.seq,
        kind: 'guardrail',
        title: `🛡 ${toolName} をブロックしました`,
        body: reason,
        meta: time,
      };
    }

    case 'budget.exceeded': {
      return {
        seq: ev.seq,
        kind: 'budget',
        title: '💰 予算上限に達したためセッションを停止しました',
        body: JSON.stringify(payload, null, 2),
        meta: time,
      };
    }

    case 'saas_link': {
      const url = (payload.url as string) ?? '';
      const kind = (payload.provider as string) ?? 'SaaS';
      return {
        seq: ev.seq,
        kind: 'saas_link',
        title: `🔗 ${kind}: ${shortUrl(url)}`,
        body: url,
        meta: time,
      };
    }

    case 'system.init':
    case 'ask_user_question':
    case 'ask_user_answered':
    case 'error': {
      // エラーは出すが、raw の内部パースエラーは飲む
      const rawType = (payload as { type?: string }).type;
      if (rawType === 'rate_limit_event') return { seq: ev.seq, kind: 'hidden', title: 'rate_limit' };
      if (ev.type === 'system.init' && payload.taskId) {
        return {
          seq: ev.seq,
          kind: 'hidden',
          title: 'system.init (hub)',
        };
      }
      if (ev.type === 'system.init' && (payload as { model?: string }).model) {
        // Claude CLI init — non-engineer 向けに model 名だけ一言
        const model = (payload as { model?: string }).model ?? '';
        return {
          seq: ev.seq,
          kind: 'assistant',
          title: `モデル ${model} を起動`,
          meta: time,
        };
      }
      if (ev.type === 'error') {
        const message = typeof payload.message === 'string' ? (payload.message as string) : undefined;
        const raw = typeof payload.raw === 'string' ? (payload.raw as string) : undefined;
        if (raw) {
          return { seq: ev.seq, kind: 'hidden', title: 'parse_error' };
        }
        return {
          seq: ev.seq,
          kind: 'result.failure',
          title: '⚠ エラー',
          body: message ?? JSON.stringify(payload),
          meta: time,
        };
      }
      return { seq: ev.seq, kind: 'hidden', title: ev.type };
    }

    default:
      return { seq: ev.seq, kind: 'hidden', title: ev.type };
  }
}

/**
 * 会話体以外のイベントを落として、tool.running/tool.finished をペアで統合した
 * 表示しやすい配列を返す。developer モード時はそのまま生のイベントを使うこと。
 */
export function buildTimeline(events: SseEvent[]): FriendlyItem[] {
  const items = events.map(toFriendly).filter((i) => i.kind !== 'hidden');

  // tool.running と tool.finished を id で結合し、finished のみを残す
  const byToolId = new Map<string, FriendlyItem>();
  const merged: FriendlyItem[] = [];
  for (const it of items) {
    if (it.kind === 'tool.finished' && it.toolUseId) {
      const running = byToolId.get(it.toolUseId);
      if (running) {
        // running を取り除くためのマーク
        running.kind = 'hidden';
      }
      byToolId.set(it.toolUseId, it);
      merged.push(it);
    } else if (it.kind === 'tool.running' && it.toolUseId) {
      byToolId.set(it.toolUseId, it);
      merged.push(it);
    } else {
      merged.push(it);
    }
  }
  return merged.filter((i) => i.kind !== 'hidden');
}

function summarizeToolCall(name: string, input: Record<string, unknown>): string {
  const n = name.toLowerCase();
  if (n === 'read') {
    const p = (input.file_path as string) ?? (input.path as string) ?? '';
    return `📖 ${shortPath(p)} を読みます`;
  }
  if (n === 'write') {
    const p = (input.file_path as string) ?? '';
    return `📝 ${shortPath(p)} を書き出します`;
  }
  if (n === 'edit') {
    const p = (input.file_path as string) ?? '';
    return `✏ ${shortPath(p)} を編集します`;
  }
  if (n === 'bash') {
    const c = ((input.command as string) ?? '').trim().split('\n')[0] ?? '';
    return `⚙ 実行: ${c.length > 80 ? c.slice(0, 80) + '…' : c}`;
  }
  if (n === 'glob') {
    return `🔍 ファイル検索: ${(input.pattern as string) ?? ''}`;
  }
  if (n === 'grep') {
    return `🔍 内容検索: ${(input.pattern as string) ?? ''}`;
  }
  if (n === 'webfetch') {
    return `🌐 Web 取得: ${(input.url as string) ?? ''}`;
  }
  if (n === 'websearch') {
    return `🔎 Web 検索: ${(input.query as string) ?? ''}`;
  }
  if (n === 'task') {
    return `🤖 サブエージェント: ${(input.description as string) ?? ''}`;
  }
  if (n === 'askuserquestion') {
    return `❓ 質問: ${(input.question as string) ?? ''}`;
  }
  if (n.startsWith('mcp__')) {
    // e.g. mcp__claude_ai_Atlassian__getJiraIssue
    const parts = n.split('__');
    const service = parts[1] ?? 'SaaS';
    const action = parts.slice(2).join(' ');
    return `🔌 ${service}: ${action}`;
  }
  return `🛠 ${name}`;
}

function shortPath(p: string): string {
  if (!p) return '(不明)';
  const parts = p.split(/[\\/]/);
  if (parts.length <= 2) return p;
  return `…/${parts.slice(-2).join('/')}`;
}

function shortUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.pathname.length > 40 ? url.host + url.pathname.slice(0, 40) + '…' : url.host + url.pathname;
  } catch {
    return u.slice(0, 60);
  }
}

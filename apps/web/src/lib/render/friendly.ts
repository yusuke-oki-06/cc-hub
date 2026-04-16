import type { SseEvent } from '@cc-hub/shared';

export type FriendlyKind =
  | 'user'
  | 'assistant'
  | 'tool.running'
  | 'tool.finished'
  | 'permission'
  | 'user_question'  // AskUserQuestion: 質問 + 選択肢を対話的に描画
  | 'result.success'
  | 'result.failure'
  | 'guardrail'
  | 'budget'
  | 'saas_link'
  | 'progress'
  | 'system'     // subdued CLI-style line (rate_limit, stream_event, stderr, runner diag)
  | 'hidden';

export interface FriendlyItem {
  seq: number;
  kind: FriendlyKind;
  title: string;
  body?: string;
  meta?: string;
  data?: unknown;
  toolUseId?: string;
}

export function toFriendly(ev: SseEvent): FriendlyItem {
  const payload = (ev.payload ?? {}) as Record<string, unknown>;
  const time = ev.createdAt?.slice(11, 19);

  switch (ev.type) {
    case 'assistant.message': {
      const inner = (payload as { type?: string; message?: Record<string, unknown> }).type;
      if (inner === 'rate_limit_event') {
        // Anthropic 内部の rate-limit ステータスはユーザーに意味が薄いので
        // allowed / それ以外問わず UI には出さない。
        return { seq: ev.seq, kind: 'hidden', title: 'rate_limit' };
      }
      if (inner === 'stream_event') {
        return { seq: ev.seq, kind: 'hidden', title: 'stream_event' };
      }
      const msg = (payload as { message?: { content?: Array<{ type: string; text?: string; name?: string; input?: unknown }> } })
        .message;
      // message.content is normally an Array<{type,text,...}> but some
      // payloads (e.g. legacy string-format responses, or compacted entries)
      // arrive as a bare string or missing. Guard against non-array values
      // so `.filter` below never blows up the whole timeline.
      const content = Array.isArray(msg?.content) ? msg.content : [];
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
        // AskUserQuestion は対話的選択肢 UI として描画する。
        if (first?.name === 'AskUserQuestion') {
          return {
            seq: ev.seq,
            kind: 'user_question',
            title: 'Claude からの質問',
            data: first.input,
            toolUseId: first.id,
            meta: time,
          };
        }
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
      if (payload.name === 'AskUserQuestion') {
        return {
          seq: ev.seq,
          kind: 'user_question',
          title: 'Claude からの質問',
          data: payload.input,
          toolUseId: (payload.id as string) ?? undefined,
          meta: time,
        };
      }
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
        title: isError ? 'ツール実行エラー' : 'ツール実行完了',
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
      return { seq: ev.seq, kind: 'hidden', title: `permission ${decision}` };
    }

    case 'result': {
      const code = payload.exitCode as number | undefined;
      const subtype = (payload as { subtype?: string }).subtype;
      const isError = (payload as { is_error?: boolean }).is_error === true;
      const text = (payload as { result?: string }).result;
      const ok = code === 0 || subtype === 'success' || (code === undefined && !isError && subtype !== 'error');
      const failExit = code !== undefined && code !== 0;
      if (failExit || isError || subtype === 'error') {
        return {
          seq: ev.seq,
          kind: 'result.failure',
          title: code !== undefined ? `失敗しました (exit ${code})` : '失敗しました',
          body: typeof text === 'string' ? text : undefined,
          meta: time,
        };
      }
      // Claude Code CLI 側は turn 終了を静かに結ぶので、UI で
      // "●完了しました" を合成するのは不自然。完全に非表示にする。
      // failure 時のエラー表示は下で別途行う。
      return {
        seq: ev.seq,
        kind: 'hidden',
        title: ok ? 'result.success' : 'result.unknown',
        meta: time,
      };
    }

    case 'guardrail.blocked': {
      const reason = (payload.reason as string) ?? '';
      const toolName = (payload.toolName as string) ?? 'ツール';
      return {
        seq: ev.seq,
        kind: 'guardrail',
        title: `ブロック: ${toolName}`,
        body: reason,
        meta: time,
      };
    }

    case 'budget.exceeded': {
      return {
        seq: ev.seq,
        kind: 'budget',
        title: '予算上限に達したためセッションを停止しました',
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
        title: `${kind}: ${shortUrl(url)}`,
        body: url,
        meta: time,
      };
    }

    case 'turn.started': {
      const text = typeof payload.text === 'string' ? (payload.text as string) : '';
      const model = (payload as { model?: string | null }).model;
      const mode = (payload as { permissionMode?: string }).permissionMode;
      const metaBits: string[] = [time ?? ''];
      if (model) metaBits.push(`model: ${model}`);
      if (mode && mode !== 'default') metaBits.push(`mode: ${mode}`);
      return {
        seq: ev.seq,
        kind: 'user',
        title: 'あなた',
        body: text,
        meta: metaBits.filter(Boolean).join(' · '),
      };
    }

    case 'turn.ended': {
      return { seq: ev.seq, kind: 'hidden', title: 'turn.ended' };
    }

    case 'runner.stderr': {
      const text = typeof payload.text === 'string' ? (payload.text as string).trim() : '';
      if (!text) return { seq: ev.seq, kind: 'hidden', title: 'stderr.empty' };
      return { seq: ev.seq, kind: 'system', title: `stderr: ${text.slice(0, 120)}`, meta: time };
    }

    case 'system.init':
    case 'ask_user_question':
    case 'ask_user_answered':
    case 'error': {
      const rawType = (payload as { type?: string }).type;
      if (rawType === 'rate_limit_event') {
        const info = (payload as { rate_limit_info?: { status?: string } }).rate_limit_info;
        const status = info?.status ?? 'unknown';
        if (status === 'allowed') {
          return { seq: ev.seq, kind: 'hidden', title: 'rate_limit.ok' };
        }
        return { seq: ev.seq, kind: 'system', title: `rate_limit: ${status}`, meta: time };
      }
      if (rawType === 'stream_event') {
        return { seq: ev.seq, kind: 'hidden', title: 'stream_event' };
      }
      if (ev.type === 'system.init' && payload.taskId && !payload.langfuseTraceUrl) {
        return { seq: ev.seq, kind: 'progress', title: 'セッションを準備中…', meta: time };
      }
      if (ev.type === 'system.init' && payload.langfuseTraceUrl) {
        // Langfuse リンクは右レールで別途表示するので、チャット本文に「記録
        // を開始」という system 行を流さない。
        return { seq: ev.seq, kind: 'hidden', title: 'langfuse.init' };
      }
      if (ev.type === 'system.init' && (payload as { model?: string }).model) {
        const model = (payload as { model?: string }).model ?? '';
        const mcp = (payload as { mcp_servers?: Array<{ name: string; status: string }> })
          .mcp_servers;
        const mcpConnected = mcp
          ? mcp.filter((m) => m.status === 'connected').length
          : 0;
        const mcpNote = mcpConnected > 0 ? ` / MCP ${mcpConnected} 件接続` : '';
        return {
          seq: ev.seq,
          kind: 'progress',
          title: `Claude ${model} を起動${mcpNote}`,
          meta: time,
        };
      }
      if (ev.type === 'error') {
        const message = typeof payload.message === 'string' ? (payload.message as string) : undefined;
        const raw = typeof payload.raw === 'string' ? (payload.raw as string) : undefined;
        if (raw) {
          // CLI stream のパースエラーは「system」扱いで目立たせない
          return { seq: ev.seq, kind: 'system', title: 'parse_error (skip)', meta: time };
        }
        return {
          seq: ev.seq,
          kind: 'result.failure',
          title: 'エラー',
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

export function buildTimeline(events: SseEvent[]): FriendlyItem[] {
  const items = events.map(toFriendly).filter((i) => i.kind !== 'hidden');

  const byToolId = new Map<string, FriendlyItem>();
  const merged: FriendlyItem[] = [];
  for (const it of items) {
    if (it.kind === 'tool.finished' && it.toolUseId) {
      const running = byToolId.get(it.toolUseId);
      if (running) running.kind = 'hidden';
      byToolId.set(it.toolUseId, it);
      merged.push(it);
    } else if (it.kind === 'tool.running' && it.toolUseId) {
      byToolId.set(it.toolUseId, it);
      merged.push(it);
    } else {
      merged.push(it);
    }
  }
  const filtered = merged.filter((i) => i.kind !== 'hidden');

  // result.success の body が直前の assistant と同じテキストなら隠す
  // (UI 上で同じ文字列が続けて 2 回表示されるのを防ぐ)。
  for (let i = 0; i < filtered.length; i++) {
    const cur = filtered[i];
    if (cur?.kind !== 'result.success' || !cur.body) continue;
    const prev = filtered[i - 1];
    if (prev?.kind === 'assistant' && typeof prev.body === 'string' && prev.body.trim() === cur.body.trim()) {
      cur.body = undefined;
    }
  }

  return filtered;
}

function summarizeToolCall(name: string, input: Record<string, unknown>): string {
  const n = name.toLowerCase();
  if (n === 'read') {
    const p = (input.file_path as string) ?? (input.path as string) ?? '';
    return `読み取り: ${shortPath(p)}`;
  }
  if (n === 'write') {
    const p = (input.file_path as string) ?? '';
    return `書き込み: ${shortPath(p)}`;
  }
  if (n === 'edit') {
    const p = (input.file_path as string) ?? '';
    return `編集: ${shortPath(p)}`;
  }
  if (n === 'bash') {
    const c = ((input.command as string) ?? '').trim().split('\n')[0] ?? '';
    return `実行: ${c.length > 80 ? c.slice(0, 80) + '…' : c}`;
  }
  if (n === 'glob') return `ファイル検索: ${(input.pattern as string) ?? ''}`;
  if (n === 'grep') return `内容検索: ${(input.pattern as string) ?? ''}`;
  if (n === 'webfetch') return `Web 取得: ${(input.url as string) ?? ''}`;
  if (n === 'websearch') return `Web 検索: ${(input.query as string) ?? ''}`;
  if (n === 'task') return `サブエージェント: ${(input.description as string) ?? ''}`;
  if (n === 'askuserquestion') return `質問: ${(input.question as string) ?? ''}`;
  if (n.startsWith('mcp__')) {
    const parts = n.split('__');
    const service = parts[1] ?? 'SaaS';
    const action = parts.slice(2).join(' ');
    return `${service}: ${action}`;
  }
  return name;
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

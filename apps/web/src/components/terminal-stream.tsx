'use client';
import { useEffect, useRef } from 'react';
import type { SseEvent } from '@cc-hub/shared';

interface Props {
  events: SseEvent[];
}

/**
 * CLI-equivalent log view: one line per SSE event, color-coded, monospace,
 * auto-scroll. Bypasses friendly.ts so nothing is hidden — users and devs
 * see exactly what the Claude Code CLI would print to its terminal.
 */
export function TerminalStream({ events }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // auto-scroll only if user is near the bottom already
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight });
  }, [events.length]);

  return (
    <div
      ref={ref}
      className="max-h-[64vh] overflow-auto rounded-card border border-border-warm bg-[#1a1a1a] px-3 py-2 font-mono text-[11.5px] leading-[1.55]"
    >
      {events.length === 0 && (
        <div className="py-6 text-center text-[#777]">
          (まだ出力がありません)
        </div>
      )}
      {events.map((ev) => (
        <TerminalLine key={ev.seq} ev={ev} />
      ))}
    </div>
  );
}

function TerminalLine({ ev }: { ev: SseEvent }) {
  const time = ev.createdAt?.slice(11, 19) ?? '--:--:--';
  const tone = toneFor(ev.type as string);
  const summary = summarize(ev);
  return (
    <div className="flex gap-2 whitespace-pre-wrap break-words">
      <span className="shrink-0 text-[#7a7a7a]">[{time}]</span>
      <span className={`shrink-0 ${tone.label}`}>[{ev.type}]</span>
      <span className={`min-w-0 flex-1 ${tone.body}`}>{summary}</span>
    </div>
  );
}

function toneFor(type: string): { label: string; body: string } {
  if (type === 'error' || type === 'result.failure' || type === 'guardrail.blocked')
    return { label: 'text-[#ff6b6b]', body: 'text-[#ffb3b3]' };
  if (type === 'runner.stderr')
    return { label: 'text-[#ffb57a]', body: 'text-[#ffd1b3]' };
  if (type === 'tool_use' || type === 'tool_result')
    return { label: 'text-[#9ed39e]', body: 'text-[#d8ead8]' };
  if (type === 'assistant.message' || type === 'message')
    return { label: 'text-[#d0d0d0]', body: 'text-[#eaeaea]' };
  if (type === 'system.init' || type === 'turn.started' || type === 'turn.ended')
    return { label: 'text-[#8ec7ff]', body: 'text-[#c0d9f2]' };
  if (type === 'result')
    return { label: 'text-[#b5d985]', body: 'text-[#dceab6]' };
  if (type === 'permission_request' || type === 'permission_resolved')
    return { label: 'text-[#f4c070]', body: 'text-[#f6dba4]' };
  if (type === 'saas_link') return { label: 'text-[#d8b4fe]', body: 'text-[#e8d5fe]' };
  return { label: 'text-[#8e8e8e]', body: 'text-[#b8b8b8]' };
}

function summarize(ev: SseEvent): string {
  const p = ev.payload as Record<string, unknown> | null | undefined;
  if (!p) return '';
  const t = ev.type as string;

  // runner.stderr carries the raw CLI stderr text
  if (t === 'runner.stderr') {
    return String(p.text ?? '').replace(/\n+$/, '');
  }

  // assistant message: extract text content
  if (t === 'assistant.message' || t === 'message') {
    const msg = (p.message ?? p) as { content?: Array<{ type: string; text?: string }> };
    if (Array.isArray(msg?.content)) {
      const texts = msg.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text as string);
      if (texts.length > 0) return texts.join('\n');
    }
    return shortJson(p);
  }

  // tool_use / tool_result
  if (t === 'tool_use') {
    const name = p.name ?? '?';
    const input = p.input ? shortJson(p.input, 200) : '';
    return `${name}${input ? ' ' + input : ''}`;
  }
  if (t === 'tool_result') {
    const arr = p.content as Array<{ type: string; text?: string }> | undefined;
    if (Array.isArray(arr)) {
      const text = arr
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text as string)
        .join('\n');
      if (text) return text.slice(0, 600);
    }
    return p.is_error ? 'ERROR' : 'ok';
  }

  // system.init
  if (t === 'system.init') {
    const model = p.model as string | undefined;
    const taskId = p.taskId as string | undefined;
    const trace = p.langfuseTraceUrl as string | undefined;
    const parts: string[] = [];
    if (model) parts.push(`model=${model}`);
    if (taskId) parts.push(`task=${taskId.slice(0, 8)}`);
    if (trace) parts.push('trace');
    return parts.join(' ') || shortJson(p, 180);
  }

  if (t === 'turn.started') {
    const text = (p.text as string | undefined) ?? '';
    const model = p.model as string | undefined;
    return `${model ? `[${model}] ` : ''}${text.slice(0, 220)}`;
  }
  if (t === 'turn.ended') {
    return `exitCode=${p.exitCode ?? 'null'}`;
  }

  if (t === 'result') {
    const code = p.exitCode ?? p.exit_code;
    const final = p.result as string | undefined;
    return `exit=${code ?? 'null'}${final ? ' | ' + final.slice(0, 200) : ''}`;
  }

  if (t === 'error') {
    return (p.message as string) ?? (p.scope as string) ?? shortJson(p, 200);
  }

  if (t === 'permission_request') {
    return `${p.toolName ?? '?'}  ${shortJson(p.input, 200)}`;
  }

  if (t === 'saas_link') {
    return `${p.provider ?? '?'} ${p.url ?? ''}`;
  }

  if (t === 'guardrail.blocked') {
    return `${p.toolName ?? '?'}: ${p.reason ?? ''}`;
  }

  return shortJson(p, 300);
}

function shortJson(v: unknown, max = 280): string {
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > max ? s.slice(0, max) + '…' : s;
  } catch {
    return String(v);
  }
}

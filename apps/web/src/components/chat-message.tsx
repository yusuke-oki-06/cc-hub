'use client';
import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SiSlack, SiJira, SiConfluence, SiGmail } from 'react-icons/si';
import type { FriendlyItem } from '@/lib/render/friendly';

/** ツール名から SaaS ブランドを識別する。 `summarizeToolCall` が
 *  `${service}: ${action}` 形式にしているのでそのまま prefix で見る。 */
type Brand = { key: 'slack' | 'jira' | 'confluence' | 'gmail'; label: string; color: string; icon: React.ReactNode };
function detectBrand(title: string): Brand | null {
  const low = title.toLowerCase();
  if (/slack/.test(low)) return { key: 'slack', label: 'Slack', color: '#4A154B', icon: <SiSlack size={13} /> };
  if (/jira/.test(low)) return { key: 'jira', label: 'Jira', color: '#0052CC', icon: <SiJira size={13} /> };
  if (/confluence/.test(low)) return { key: 'confluence', label: 'Confluence', color: '#172B4D', icon: <SiConfluence size={13} /> };
  if (/gmail/.test(low)) return { key: 'gmail', label: 'Gmail', color: '#EA4335', icon: <SiGmail size={13} /> };
  return null;
}

interface Props {
  item: FriendlyItem;
  /** render children for permission cards etc. */
  renderInline?: (item: FriendlyItem) => React.ReactNode;
}

/**
 * Claude.ai-style chat message row.
 *  - user  → right-aligned soft pill (max 680px, rounded-[20px])
 *  - assistant → no bubble, just text with a subtle "Claude" label and
 *    markdown rendering; copy button appears on hover
 *  - tool.running → compact inline muted line with dot spinner
 *  - tool.finished → compact inline muted line, expandable via details
 *  - result.success → inline small success stripe
 *  - result.failure → inline small error stripe
 *  - system / progress / guardrail / budget / saas_link → CLI-style muted line
 */
export function ChatMessage({ item, renderInline }: Props) {
  if (item.kind === 'hidden') return null;
  if (item.kind === 'user_question' && renderInline) {
    return <>{renderInline(item)}</>;
  }
  if (item.kind === 'permission' && renderInline) {
    return <div className="my-1">{renderInline(item)}</div>;
  }

  // Thinking (拡張思考) — 折りたたみ表示
  if (item.kind === 'thinking') {
    return <ThinkingBlock item={item} />;
  }

  // タスクリスト (TodoWrite)
  if (item.kind === 'task_list') {
    return <TaskListCard item={item} />;
  }

  // プラン承認 (ExitPlanMode)
  if (item.kind === 'plan_approval' && renderInline) {
    return <>{renderInline(item)}</>;
  }

  if (item.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[680px] rounded-[20px] bg-sand px-4 py-2.5 font-sans text-[14px] leading-[1.55] text-near whitespace-pre-wrap">
          {item.body || item.title}
        </div>
      </div>
    );
  }

  if (item.kind === 'assistant') {
    return <AssistantBubble item={item} />;
  }

  if (item.kind === 'tool.running') {
    const brand = detectBrand(item.title);
    if (brand) {
      return <BrandToolRunning item={item} brand={brand} />;
    }
    return (
      <div className="flex items-center gap-2 pl-1 pr-2 py-1 font-sans text-[12.5px] text-stone">
        <Dot pulsing />
        <span className="truncate">{item.title}</span>
      </div>
    );
  }

  if (item.kind === 'tool.finished') {
    const brand = detectBrand(item.title);
    if (brand) {
      return <BrandToolFinished item={item} brand={brand} />;
    }
    return <ToolFinishedLine item={item} />;
  }

  if (item.kind === 'result.success') {
    return (
      <div className="flex items-start gap-2 border-l-2 border-[#c9d9ab] py-1 pl-3">
        <span className="mt-[2px] text-[11px] text-[#6b8a3e]">●</span>
        <div className="min-w-0 flex-1">
          <div className="font-sans text-[13px] font-medium text-[#4b6a2a]">
            {item.title}
          </div>
          {item.body && (
            <div className="mt-1 whitespace-pre-wrap font-sans text-[13px] leading-[1.6] text-charcoal">
              {item.body}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (item.kind === 'result.failure') {
    return (
      <div className="flex items-start gap-2 border-l-2 border-[#e0a9a9] py-1 pl-3">
        <span className="mt-[2px] text-[11px] text-error-crimson">●</span>
        <div className="min-w-0 flex-1">
          <div className="font-sans text-[13px] font-medium text-error-crimson">
            {item.title}
          </div>
          {item.body && (
            <div className="mt-1 whitespace-pre-wrap font-sans text-[13px] leading-[1.6] text-charcoal">
              {item.body}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (item.kind === 'guardrail' || item.kind === 'budget') {
    return (
      <div className="flex items-start gap-2 border-l-2 border-[#e3d196] py-1 pl-3 font-sans text-[12.5px] text-[#7a5a12]">
        <span className="mt-[1px]">■</span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{item.title}</div>
          {item.body && <div className="mt-0.5 text-[12px] text-olive">{item.body}</div>}
        </div>
      </div>
    );
  }

  if (item.kind === 'saas_link') {
    return (
      <div className="px-2 py-1 font-sans text-[12.5px] text-terracotta">
        {item.title}
      </div>
    );
  }

  if (item.kind === 'progress') {
    return (
      <div className="flex items-center gap-2 px-2 py-1 font-sans text-[12px] italic text-stone">
        <Dot pulsing />
        <span>{item.title}</span>
      </div>
    );
  }

  // system: subtle mono one-liner (stderr, rate_limit, parse_error)
  return (
    <div className="flex items-baseline gap-2 px-2 py-[2px] font-mono text-[11.5px] text-stone">
      {item.meta && <span className="shrink-0 text-[10px]">{item.meta}</span>}
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
    </div>
  );
}

function AssistantBubble({ item }: { item: FriendlyItem }) {
  const [copied, setCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const text = item.body ?? item.title ?? '';
  const thinkingText = (item.data as { thinking?: string } | undefined)?.thinking;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // noop
    }
  };
  return (
    <div className="group relative pl-1 pr-8">
      {thinkingText && (
        <div className="mb-2 rounded-card border border-border-cream bg-parchment/50">
          <button
            type="button"
            onClick={() => setShowThinking((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-sans text-[11.5px] text-stone hover:bg-sand/60"
          >
            <span>{showThinking ? '▾' : '▸'}</span>
            <span>Claude の思考プロセス</span>
          </button>
          {showThinking && (
            <pre className="border-t border-border-cream bg-parchment/30 px-4 py-2 font-mono text-[11px] leading-[1.5] text-olive whitespace-pre-wrap max-h-[300px] overflow-y-auto">
              {thinkingText}
            </pre>
          )}
        </div>
      )}
      <div className="mb-1 font-sans text-[11px] uppercase tracking-[0.5px] text-stone">
        Claude
      </div>
      <div className="font-sans text-[14.5px] leading-[1.7] text-near assistant-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-terracotta underline underline-offset-2"
              >
                {children}
              </a>
            ),
            code: ({ className, children }) => {
              const isBlock = /language-/.test(className ?? '');
              if (isBlock) return <code className={className}>{children}</code>;
              return (
                <code className="rounded bg-parchment px-1 py-[1px] font-mono text-[12px]">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="my-3 overflow-x-auto rounded-[12px] border border-border-cream bg-parchment p-3 font-mono text-[12px] leading-[1.55]">
                {children}
              </pre>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
      <button
        onClick={onCopy}
        title="コピー"
        className="absolute right-0 top-5 rounded-full border border-border-cream bg-ivory p-1.5 text-[11px] text-stone opacity-0 transition hover:text-charcoal group-hover:opacity-100"
        aria-label="メッセージをコピー"
      >
        {copied ? '✓' : <CopyGlyph />}
      </button>
    </div>
  );
}

function ToolFinishedLine({ item }: { item: FriendlyItem }) {
  const [open, setOpen] = useState(false);
  const payload = item.data as { is_error?: boolean } | undefined;
  const err = payload?.is_error === true;
  return (
    <div className="font-sans text-[12.5px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-full items-center gap-2 rounded-full px-2 py-1 text-left transition hover:bg-parchment"
      >
        <span className={`text-[11px] ${err ? 'text-error-crimson' : 'text-[#6b8a3e]'}`}>●</span>
        <span className={err ? 'text-error-crimson' : 'text-stone'}>
          {item.title}
        </span>
        {item.meta && (
          <span className="truncate font-mono text-[11px] text-stone">· {item.meta}</span>
        )}
        <span className="ml-1 text-[10px] text-stone">{open ? '▾' : '▸'}</span>
      </button>
      {open && item.body && (
        <pre className="mt-1 ml-4 max-h-[220px] overflow-y-auto whitespace-pre-wrap rounded-[8px] border border-border-cream bg-parchment p-2 font-mono text-[11px] leading-[1.55] text-olive">
          {item.body}
        </pre>
      )}
    </div>
  );
}

function Dot({ pulsing = false }: { pulsing?: boolean }) {
  return (
    <span className="relative inline-flex h-1.5 w-1.5 items-center justify-center">
      <span
        className={
          'absolute inset-0 rounded-full bg-terracotta ' +
          (pulsing ? 'animate-ping opacity-60' : '')
        }
      />
      <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-terracotta" />
    </span>
  );
}

/** Extended thinking — 折りたたみ式の思考プロセス表示。CLI と同等。 */
function ThinkingBlock({ item }: { item: FriendlyItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-card border border-border-cream bg-parchment/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-sans text-[12.5px] text-stone transition hover:bg-sand/60"
      >
        <span className="text-[11px]">{open ? '▾' : '▸'}</span>
        <span className="font-medium">{item.title}</span>
        {item.meta && <span className="ml-auto font-mono text-[11px]">{item.meta}</span>}
      </button>
      {open && item.body && (
        <pre className="border-t border-border-cream bg-parchment/30 px-4 py-3 font-mono text-[11.5px] leading-[1.6] text-olive whitespace-pre-wrap max-h-[400px] overflow-y-auto">
          {item.body}
        </pre>
      )}
    </div>
  );
}

/** TodoWrite / TaskCreate → チェックリスト表示 */
function TaskListCard({ item }: { item: FriendlyItem }) {
  const input = item.data as {
    todos?: Array<{ id?: string; content?: string; status?: string }>;
  } | undefined;
  const todos = input?.todos ?? [];
  if (todos.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 font-sans text-[12.5px] text-stone">
        <Dot />
        <span>{item.title}</span>
      </div>
    );
  }
  return (
    <div className="rounded-card border border-border-cream bg-white">
      <div className="border-b border-border-cream px-3 py-2 font-sans text-[12px] font-medium text-stone">
        {item.title}
        {item.meta && <span className="ml-2 font-mono text-[11px]">{item.meta}</span>}
      </div>
      <ul className="divide-y divide-border-cream">
        {todos.map((t, i) => {
          const status = t.status ?? 'pending';
          const icon =
            status === 'completed' ? '✓' : status === 'in_progress' ? '●' : '○';
          const color =
            status === 'completed'
              ? 'text-[#6b8a3e]'
              : status === 'in_progress'
                ? 'text-terracotta'
                : 'text-stone';
          return (
            <li key={t.id ?? i} className="flex items-start gap-2.5 px-3 py-2">
              <span className={`mt-0.5 shrink-0 font-mono text-[13px] ${color}`}>{icon}</span>
              <span className="font-sans text-[13px] text-near">{t.content ?? ''}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CopyGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M2 10V3.5A1.5 1.5 0 0 1 3.5 2H10" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

/** Slack / Jira / Confluence / Gmail の MCP ツール呼び出し中カード。
 *  ブランドアイコン + ブランドカラーの左アクセントラインでひと目で連携を示す。 */
function BrandToolRunning({ item, brand }: { item: FriendlyItem; brand: Brand }) {
  return (
    <div
      className="flex items-center gap-2 rounded-card border border-border-cream bg-white px-2 py-1.5 font-sans text-[12.5px]"
      style={{ borderLeft: `3px solid ${brand.color}` }}
    >
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded"
        style={{ color: brand.color }}
        aria-hidden="true"
      >
        {brand.icon}
      </span>
      <span className="truncate text-charcoal">{item.title}</span>
      <Dot pulsing />
    </div>
  );
}

/** Slack / Jira / Confluence / Gmail の MCP ツール完了カード。 */
function BrandToolFinished({ item, brand }: { item: FriendlyItem; brand: Brand }) {
  const [open, setOpen] = useState(false);
  const payload = item.data as { is_error?: boolean } | undefined;
  const err = payload?.is_error === true;
  return (
    <div
      className="rounded-card border border-border-cream bg-white font-sans text-[12.5px]"
      style={{ borderLeft: `3px solid ${brand.color}` }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-parchment/60"
      >
        <span
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded"
          style={{ color: brand.color }}
          aria-hidden="true"
        >
          {brand.icon}
        </span>
        <span className={err ? 'text-error-crimson' : 'text-charcoal'}>
          {item.title}
        </span>
        {item.meta && (
          <span className="ml-auto shrink-0 font-mono text-[11px] text-stone">{item.meta}</span>
        )}
        <span className="shrink-0 text-[10px] text-stone">{open ? '▾' : '▸'}</span>
      </button>
      {open && item.body && (
        <pre className="mt-0 ml-9 mb-2 max-h-[220px] overflow-y-auto whitespace-pre-wrap rounded-[8px] border border-border-cream bg-parchment p-2 font-mono text-[11px] leading-[1.55] text-olive">
          {item.body}
        </pre>
      )}
    </div>
  );
}

/**
 * Thinking indicator placed after the last message while Claude is working.
 * When `onStop` is provided, a square Stop button appears on the right so
 * the user can cancel the ongoing turn without hunting for the header's
 * abort button. (claude.ai-style mid-generation stop affordance.)
 */
export function ChatThinking({ onStop }: { onStop?: () => void | Promise<void> }) {
  return (
    <div className="flex items-center justify-between gap-2 pl-1 py-2 font-sans text-[13px] text-olive">
      <div className="flex items-center gap-2">
        {/* CLI のスパークル風アニメーション */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          className="animate-spin text-terracotta"
          style={{ animationDuration: '2s' }}
          aria-hidden="true"
        >
          <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" fill="currentColor" />
          <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" fill="currentColor" opacity="0.5" />
          <path d="M4 16l.7 2.3L7 19l-2.3.7L4 22l-.7-2.3L1 19l2.3-.7L4 16z" fill="currentColor" opacity="0.3" />
        </svg>
        <span className="text-stone">Claude が考えています…</span>
      </div>
      {onStop && (
        <button
          type="button"
          onClick={() => void onStop()}
          title="応答を停止"
          className="inline-flex items-center gap-1.5 rounded-full border border-border-warm bg-white px-3 py-1 font-sans text-[12px] text-charcoal transition hover:bg-sand"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor" />
          </svg>
          停止
        </button>
      )}
    </div>
  );
}

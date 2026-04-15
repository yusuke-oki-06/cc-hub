'use client';
import { useEffect, useRef, useState, type JSX } from 'react';
import {
  CLAUDE_MODELS,
  GUI_PERMISSION_MODES,
  type ClaudeModelId,
  type GuiPermissionMode,
} from '@cc-hub/shared';
import { SkillPicker } from '@/components/skill-picker';

export interface ComposerSubmit {
  text: string;
  model?: ClaudeModelId;
  permissionMode?: GuiPermissionMode;
  allowedTools?: string[];
}

export interface PromptComposerProps {
  /** "new" for landing, "followup" for in-session continuation */
  variant?: 'new' | 'followup';
  placeholder?: string;
  disabled?: boolean;
  onSubmit: (payload: ComposerSubmit) => void | Promise<void>;
  /** フォローアップで表示したいショートカット (履歴整理・CLAUDE.md 生成 等)。
   *  composer の上に行として並ぶ。 */
  extraActions?: React.ReactNode;
  /** 値をリセットしたい時 (送信完了時など) に親側が数値を bump する。 */
  resetKey?: number;
}

// 注: per-turn tool allowlist override (以前 profile prop 経由) は撤廃した。
// ツール / MCP の制御は backend 側プロファイル + hooks で行う設計に統一。

export function PromptComposer({
  variant = 'followup',
  placeholder,
  disabled,
  onSubmit,
  extraActions,
  resetKey,
}: PromptComposerProps) {
  const [text, setText] = useState('');
  const [model, setModel] = useState<ClaudeModelId>('sonnet');
  const [mode, setMode] = useState<GuiPermissionMode>('default');
  const [sending, setSending] = useState(false);
  const [skillModal, setSkillModal] = useState(false);
  const [slash, setSlash] = useState<
    { start: number; query: string; top: number; left: number } | null
  >(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText('');
  }, [resetKey]);

  const handleSend = async () => {
    if (!text.trim() || sending || disabled) return;
    setSending(true);
    try {
      await onSubmit({
        text,
        model,
        permissionMode: mode === 'default' ? undefined : mode,
      });
      setText('');
    } finally {
      setSending(false);
    }
  };

  const insertSkillSlug = (slug: string, tokenStart: number, tokenLen: number) => {
    const before = text.slice(0, tokenStart);
    const after = text.slice(tokenStart + tokenLen);
    const inserted = `/${slug} `;
    const next = `${before}${inserted}${after}`;
    setText(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const caret = before.length + inserted.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const prependSkillSlug = (slug: string) => {
    const token = `/${slug} `;
    if (text.startsWith(token)) return;
    const next = `${token}${text}`;
    setText(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(token.length, token.length);
    });
  };

  return (
    <div className="space-y-2">
      {extraActions && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {extraActions}
        </div>
      )}

      <div className="overflow-visible rounded-[24px] border border-border-warm bg-ivory shadow-whisper theme-airbnb-composer">
        <textarea
          ref={textareaRef}
          rows={variant === 'new' ? 5 : 3}
          disabled={disabled}
          className="block w-full resize-none border-0 bg-transparent px-5 pt-4 pb-2 font-sans text-[15px] leading-[1.6] text-near placeholder:text-stone focus:outline-none"
          placeholder={placeholder ?? '返信…'}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            const caret = e.target.selectionStart ?? v.length;
            setSlash(detectSlashTrigger(v, caret, e.target));
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleSend();
              return;
            }
            if (slash && e.key === 'Enter') e.preventDefault();
          }}
          onBlur={() => {
            window.setTimeout(() => setSlash(null), 120);
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-cream bg-parchment/40 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <PlusMenuSimple onPickSkill={() => setSkillModal(true)} />
          </div>
          <div className="flex items-center gap-2">
            <ModeSelector value={mode} onChange={setMode} />
            <ModelPicker value={model} onChange={setModel} />
            <button
              type="button"
              onClick={handleSend}
              disabled={!text.trim() || sending || !!disabled}
              title="送信 (⌘Enter)"
              aria-label="送信"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-terracotta text-ivory transition hover:bg-[#b5573a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? (
                <svg width="14" height="14" viewBox="0 0 16 16" className="animate-spin" aria-hidden="true">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {slash && (
        <SkillPicker
          variant="inline"
          query={slash.query}
          anchor={{ top: slash.top, left: slash.left }}
          onPick={(s) => {
            insertSkillSlug(s.slug, slash.start, slash.query.length + 1);
            setSlash(null);
          }}
          onClose={() => setSlash(null)}
        />
      )}

      {skillModal && (
        <SkillPicker
          variant="modal"
          onPick={(s) => {
            prependSkillSlug(s.slug);
            setSkillModal(false);
          }}
          onClose={() => setSkillModal(false)}
        />
      )}
    </div>
  );
}

function PlusMenuSimple({ onPickSkill }: { onPickSkill: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = () => setOpen(false);
    const t = setTimeout(() => document.addEventListener('click', onDoc), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onDoc);
    };
  }, [open]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-warm bg-white text-stone hover:text-charcoal"
        title="スキルを選ぶ"
        aria-label="メニューを開く"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-card border border-border-warm bg-white shadow-whisper"
        >
          <button
            type="button"
            onClick={() => {
              onPickSkill();
              setOpen(false);
            }}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-sans text-[13px] text-charcoal hover:bg-sand"
          >
            <span>スキルを選ぶ</span>
            <span className="font-mono text-[11px] text-stone">/</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ModelPicker({
  value,
  onChange,
}: {
  value: ClaudeModelId;
  onChange: (v: ClaudeModelId) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = () => setOpen(false);
    const t = setTimeout(() => document.addEventListener('click', onDoc), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onDoc);
    };
  }, [open]);
  const current = CLAUDE_MODELS.find((m) => m.id === value) ?? CLAUDE_MODELS[1];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border-cream bg-white px-2.5 py-1 font-sans text-[12px] text-near hover:bg-sand"
        title={current.blurb}
      >
        <span className="whitespace-nowrap font-medium">{current.label}</span>
        <span aria-hidden="true" className="text-stone">▾</span>
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-card border border-border-warm bg-white shadow-whisper"
        >
          {CLAUDE_MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              className={
                'flex w-full flex-col gap-0.5 px-3 py-2 text-left font-sans text-[12px] hover:bg-sand ' +
                (m.id === value ? 'bg-ivory' : '')
              }
            >
              <span className="whitespace-nowrap font-medium text-near">{m.label}</span>
              <span className="font-sans text-[11px] text-stone">{m.blurb}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const MODE_ICONS: Record<GuiPermissionMode, JSX.Element> = {
  default: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4h10a1 1 0 011 1v5a1 1 0 01-1 1H6l-3 3V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  plan: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4" y="3" width="8" height="11" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 6h4M6 9h4M6 12h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  acceptEdits: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9 2L3 9h4l-1 5 6-7H8l1-5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
};

function ModeSelector({
  value,
  onChange,
}: {
  value: GuiPermissionMode;
  onChange: (v: GuiPermissionMode) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = () => setOpen(false);
    const t = setTimeout(() => document.addEventListener('click', onDoc), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onDoc);
    };
  }, [open]);
  const current = GUI_PERMISSION_MODES.find((m) => m.id === value) ?? GUI_PERMISSION_MODES[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-border-cream bg-white px-2.5 py-1 font-sans text-[12px] text-near hover:bg-sand"
        title={current.blurb}
      >
        <span className="text-stone">{MODE_ICONS[current.id]}</span>
        <span className="font-medium">{current.label}</span>
        <span aria-hidden="true" className="text-stone">▾</span>
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-card border border-border-warm bg-white shadow-whisper"
        >
          {GUI_PERMISSION_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              className={
                'flex w-full items-start gap-2 px-3 py-2 text-left font-sans text-[12px] hover:bg-sand ' +
                (m.id === value ? 'bg-ivory' : '')
              }
            >
              <span className="mt-0.5 shrink-0 text-stone">{MODE_ICONS[m.id]}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-near">{m.label}</span>
                <span className="block font-sans text-[11px] text-stone">{m.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function detectSlashTrigger(
  text: string,
  caret: number,
  el: HTMLTextAreaElement,
): { start: number; query: string; top: number; left: number } | null {
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '/') {
      const before = i === 0 ? '\n' : text[i - 1];
      if (!before || /\s/.test(before)) {
        const query = text.slice(i + 1, caret);
        if (/\s/.test(query)) return null;
        const rect = el.getBoundingClientRect();
        return { start: i, query, top: rect.bottom + 4, left: rect.left };
      }
      return null;
    }
    if (/\s/.test(ch ?? '')) return null;
    i -= 1;
  }
  return null;
}

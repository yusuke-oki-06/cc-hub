'use client';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import {
  CLAUDE_MODELS,
  GUI_PERMISSION_MODES,
  type ClaudeModelId,
  type GuiPermissionMode,
  type ToolProfile,
} from '@cc-hub/shared';

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
  profile?: ToolProfile;
  onSubmit: (payload: ComposerSubmit) => void | Promise<void>;
  /** 追加のボタン群 (compact / init など) を toolbar 右端に差し込む */
  extraActions?: React.ReactNode;
  /** 値がリセットされたことを外から指示したい時 (送信完了などで親が reset) */
  resetKey?: number;
}

const MODE_SHORT: Record<GuiPermissionMode, string> = {
  default: '通常',
  plan: '計画のみ',
  acceptEdits: '編集自動承認',
};

export function PromptComposer({
  variant = 'followup',
  placeholder,
  disabled,
  profile,
  onSubmit,
  extraActions,
  resetKey,
}: PromptComposerProps) {
  const [text, setText] = useState('');
  const [model, setModel] = useState<ClaudeModelId | ''>('');
  const [mode, setMode] = useState<GuiPermissionMode>('default');
  const [toolsOverride, setToolsOverride] = useState<string[] | null>(null);
  const [showTools, setShowTools] = useState(false);
  const [sending, setSending] = useState(false);
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
        model: model || undefined,
        permissionMode: mode === 'default' ? undefined : mode,
        allowedTools: toolsOverride ?? undefined,
      });
      setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-card border border-border-warm bg-ivory shadow-whisper',
        variant === 'new' ? 'p-0 overflow-hidden' : 'p-0',
      )}
    >
      <textarea
        ref={textareaRef}
        rows={variant === 'new' ? 5 : 3}
        disabled={disabled}
        className="block w-full resize-none border-0 bg-transparent px-5 pt-4 pb-2 font-sans text-[15px] leading-[1.6] text-near placeholder:text-stone focus:outline-none"
        placeholder={
          placeholder ??
          (variant === 'new'
            ? '例: この pcap の DNS クエリを要約して、怪しい宛先があれば列挙して'
            : '例: そのエラーの原因をもう少し詳しく教えて')
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void handleSend();
          }
        }}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-cream bg-parchment/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Model selector */}
          <ComposerSelect
            label="モデル"
            value={model}
            onChange={setModel}
            options={[
              { value: '', label: '自動 (既定)' },
              ...CLAUDE_MODELS.map((m) => ({ value: m.id, label: m.label })),
            ]}
            title={
              model
                ? CLAUDE_MODELS.find((m) => m.id === model)?.blurb
                : 'profile の既定モデルで実行'
            }
          />

          {/* Permission mode */}
          <ModeToggle value={mode} onChange={setMode} />

          {/* Tool allowlist popover */}
          {profile && (
            <ToolsButton
              profile={profile}
              override={toolsOverride}
              setOverride={setToolsOverride}
              open={showTools}
              setOpen={setShowTools}
            />
          )}

          {extraActions}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!text.trim() || sending || disabled}
          >
            {sending ? '送信中…' : '送信 (⌘Enter)'}
          </Button>
        </div>
      </div>

      {/* Summary row */}
      {(model || mode !== 'default' || toolsOverride) && (
        <div className="flex flex-wrap gap-1.5 border-t border-border-cream bg-ivory px-3 py-1.5 font-mono text-[10px] text-stone">
          {model && <span>model: {model}</span>}
          {mode !== 'default' && <span>mode: {MODE_SHORT[mode]}</span>}
          {toolsOverride && <span>tools: {toolsOverride.join(',') || '(なし)'}</span>}
        </div>
      )}
    </div>
  );
}

function ComposerSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  title,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  title?: string;
}) {
  return (
    <label
      className="flex items-center gap-1 rounded-card border border-border-cream bg-white px-1.5 py-0.5"
      title={title}
    >
      <span className="font-sans text-[10px] text-stone">{label}</span>
      <select
        className="bg-transparent font-sans text-[12px] text-near focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ModeToggle({
  value,
  onChange,
}: {
  value: GuiPermissionMode;
  onChange: (m: GuiPermissionMode) => void;
}) {
  return (
    <div className="flex items-center gap-0 rounded-card border border-border-cream bg-white">
      {GUI_PERMISSION_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          title={m.blurb}
          className={cn(
            'px-2 py-[3px] font-sans text-[12px] transition',
            value === m.id
              ? 'bg-terracotta text-ivory rounded-card'
              : 'text-charcoal hover:text-near',
          )}
        >
          {m.label.split(' — ')[0]}
        </button>
      ))}
    </div>
  );
}

function ToolsButton({
  profile,
  override,
  setOverride,
  open,
  setOpen,
}: {
  profile: ToolProfile;
  override: string[] | null;
  setOverride: (t: string[] | null) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const current = override ?? profile.allowedTools;
  const label =
    override === null
      ? `ツール: profile既定 (${profile.allowedTools.length})`
      : `ツール: ${override.length}選択`;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-card border border-border-cream bg-white px-2 py-[3px] font-sans text-[12px] text-charcoal hover:bg-sand"
      >
        {label}
      </button>
      {open && (
        <div
          className="absolute bottom-full left-0 z-30 mb-1 w-72 rounded-card border border-border-warm bg-ivory p-3 shadow-whisper"
          onBlur={() => setOpen(false)}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-sans text-[11px] font-medium text-stone">
              このターンで許可するツール
            </span>
            <button
              type="button"
              onClick={() => setOverride(null)}
              className="font-sans text-[11px] text-stone underline"
            >
              既定に戻す
            </button>
          </div>
          <div className="space-y-1">
            {profile.allowedTools.map((tool) => (
              <label
                key={tool}
                className="flex cursor-pointer items-center gap-2 rounded-card px-1.5 py-0.5 hover:bg-sand"
              >
                <input
                  type="checkbox"
                  checked={current.includes(tool)}
                  onChange={(e) => {
                    const base = override ?? profile.allowedTools;
                    const next = e.target.checked
                      ? [...new Set([...base, tool])]
                      : base.filter((t) => t !== tool);
                    setOverride(next);
                  }}
                />
                <span className="font-mono text-[12px] text-near">{tool}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 font-sans text-[10px] text-stone">
            profile で禁止されているツールは追加できません (ガードレール保護)。
          </p>
        </div>
      )}
    </div>
  );
}

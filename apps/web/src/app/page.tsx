'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { api, runnerBase, getAuthHeader, withTimeout } from '@/lib/api';
import { SiSlack, SiJira } from 'react-icons/si';
import { TokenSetup } from '@/components/token-setup';
import { SkillPicker, type SkillItem } from '@/components/skill-picker';
import { MoveToProjectModal } from '@/components/move-to-project-modal';
import {
  CLAUDE_MODELS,
  GUI_PERMISSION_MODES,
  type ClaudeModelId,
  type GuiPermissionMode,
} from '@cc-hub/shared';

interface Project {
  id: string;
  name: string;
}

// 既定の「未分類」プロジェクト ID — これ以外が選ばれたときだけ composer に
// プロジェクトアイコンを出す。
const UNTAGGED_PROJECT_ID = '00000000-0000-0000-0000-000000000100';

type ChipIcon = 'bulb' | 'pencil' | 'slack' | 'jira' | 'clock';

const SUGGESTIONS: Array<{
  title: string;
  prompt?: string;
  icon: ChipIcon;
  href?: string;
}> = [
  {
    title: 'ブレインストーミング',
    icon: 'bulb',
    prompt:
      'これから考えたいテーマを伝えるので、発散 → 観点整理 → 絞り込み の順でブレインストーミングを手伝ってください。まずは題材を聞いてください。',
  },
  {
    title: '文章作成',
    icon: 'pencil',
    prompt:
      '文章を書く手伝いをお願いします。まずは「何を」「誰に」「どんな形式で」書きたいか簡単に聞いてから、下書き → 推敲 を進めてください。',
  },
  {
    title: 'Slack',
    icon: 'slack',
    prompt:
      'Slack (MCP 連携) を使ってチャンネルを検索したりメッセージを要約したりしたいです。どんな情報が欲しいか聞いてから実行してください。',
  },
  {
    title: 'Jira',
    icon: 'jira',
    prompt:
      'Jira (MCP 連携) で issue を検索・要約したいです。どのプロジェクト / 期間 / キーワードか聞いてから実行してください。',
  },
  {
    title: 'ルーティン',
    icon: 'clock',
    href: '/schedules',
  },
];

type SubmitPhase = 'idle' | 'creating' | 'uploading' | 'starting' | 'navigating';
function phaseLabel(phase: SubmitPhase, uploadIndex = 0, uploadTotal = 0): string {
  if (phase === 'creating') return 'セッション作成中…';
  if (phase === 'uploading') return `アップロード中 (${uploadIndex}/${uploadTotal})…`;
  if (phase === 'starting') return 'Claude 起動中…';
  if (phase === 'navigating') return 'タスク画面へ遷移中…';
  return '実行 (⌘Enter)';
}

// ─── Randomized headline (time-based greeting removed per feedback) ──
const HEADLINES: string[] = [
  '今日は何をしましょう?',
  '何から始めましょうか?',
  'どんなタスクですか?',
  '気になっていることを教えてください',
  '手伝えることはありますか?',
  '次の一歩、お手伝いします',
  '今日の困りごとを教えてください',
  'どんな調べ物をしますか?',
  'さて、始めましょうか',
];
function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('00000000-0000-0000-0000-000000000100');
  const [profileId, setProfileId] = useState('default');
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<'upload' | 'none'>('none');
  const [permissionMode, setPermissionMode] = useState<GuiPermissionMode>('default');
  const [model, setModel] = useState<ClaudeModelId>('sonnet');
  const [projectModal, setProjectModal] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [skillModal, setSkillModal] = useState(false);
  const [slash, setSlash] = useState<{ start: number; query: string; top: number; left: number } | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>('idle');
  const [uploadProgress, setUploadProgress] = useState<{ index: number; total: number }>({ index: 0, total: 0 });
  const [error, setError] = useState<string>();
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loading = phase !== 'idle';

  // Random headline, picked on client mount to avoid SSR hydration mismatch.
  const [greeting, setGreeting] = useState<{ headline: string }>({
    headline: '今日は何をしましょう?',
  });
  useEffect(() => {
    setGreeting({ headline: pickRandom(HEADLINES) });
  }, []);

  useEffect(() => {
    void api<{ projects: Project[] }>('/api/projects')
      .then((r) => setProjects(r.projects))
      .catch((err) => setError((err as Error).message));
  }, []);

  const submit = async () => {
    setError(undefined);
    setPhase('creating');
    try {
      const created = await api<{ sessionId: string; taskId: string }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ profileId, prompt, projectId }),
      });

      if (mode === 'upload' && files.length > 0) {
        setPhase('uploading');
        setUploadProgress({ index: 0, total: files.length });
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          setUploadProgress({ index: i + 1, total: files.length });
          const form = new FormData();
          form.append('file', f);
          const r = await fetch(`${runnerBase}/api/sessions/${created.sessionId}/upload`, {
            method: 'POST',
            body: form,
            headers: { Authorization: getAuthHeader() },
          });
          if (!r.ok) throw new Error(`upload failed: ${f.name}`);
        }
      }

      setPhase('starting');
      // Cap claude/start wait at 120s so a stuck sandbox doesn't leave the
      // submit button disabled indefinitely with no way for the user to react.
      await withTimeout(
        api(`/api/sessions/${created.sessionId}/claude/start`, {
          method: 'POST',
          body: JSON.stringify({ permissionMode, model }),
        }),
        120_000,
        'Claude 起動',
      );

      setPhase('navigating');
      router.push(`/tasks/${created.taskId}`);
    } catch (err) {
      setError((err as Error).message);
      setPhase('idle');
    }
  };

  // Replace the slash token (e.g. "/pdf") with "/slug " in place and move
  // the caret to just after the inserted slug.
  const insertSkillSlug = (slug: string, tokenStart: number, tokenLen: number) => {
    const before = prompt.slice(0, tokenStart);
    const after = prompt.slice(tokenStart + tokenLen);
    const inserted = `/${slug} `;
    const next = `${before}${inserted}${after}`;
    setPrompt(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const caret = before.length + inserted.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  // From the modal: prepend "/slug " if not already present.
  const prependSkillSlug = (slug: string) => {
    const token = `/${slug} `;
    if (prompt.startsWith(token)) return;
    const next = `${token}${prompt}`;
    setPrompt(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(token.length, token.length);
    });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[720px] flex-col justify-center px-6 pt-16 pb-12">
      <TokenSetup />

      <header className="mb-8 mt-2 text-center">
        <h1
          className="font-serif text-[40px] leading-[1.1] text-near theme-airbnb-hero whitespace-nowrap"
          suppressHydrationWarning
        >
          {greeting.headline}
        </h1>
      </header>

      {/* Compact prompt composer (claude.ai-style). overflow-visible so
          the PlusMenu popover can extend below the toolbar. */}
      <Card
        className={
          'overflow-visible p-0 shadow-whisper theme-airbnb-composer transition ' +
          (dragOver ? 'ring-2 ring-[#2f6fbf]/50' : '')
        }
        onDragOver={(e) => {
          // Only act if files are being dragged
          if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
            e.preventDefault();
            if (!dragOver) setDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          // Clear only when the pointer leaves the Card entirely, not when it
          // merely moves into a descendant. `relatedTarget` is the element we're
          // entering; if it's inside the Card we're still "over" it.
          const to = e.relatedTarget as Node | null;
          if (!to || !e.currentTarget.contains(to)) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = Array.from(e.dataTransfer.files ?? []);
          if (dropped.length === 0) return;
          setFiles([...files, ...dropped]);
          setMode('upload');
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length === 0) return;
            setFiles([...files, ...picked]);
            setMode('upload');
            e.target.value = ''; // allow reselecting the same file later
          }}
        />
        <textarea
          ref={textareaRef}
          rows={2}
          className="block w-full resize-none border-0 bg-transparent px-5 pt-5 pb-2 font-sans text-[16px] leading-[1.6] text-near placeholder:text-stone focus:outline-none"
          placeholder="今日はどんなお題から始めましょうか?"
          value={prompt}
          onChange={(e) => {
            const v = e.target.value;
            setPrompt(v);
            const caret = e.target.selectionStart ?? v.length;
            setSlash(detectSlashTrigger(v, caret, e.target));
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              if (prompt.trim()) void submit();
              return;
            }
            if (slash && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
              // SkillPicker listens to document keydown; prevent newline on Enter.
              if (e.key === 'Enter') e.preventDefault();
            }
          }}
          onBlur={() => {
            // Delay close so clicks on the popover register first.
            window.setTimeout(() => setSlash(null), 120);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-cream bg-parchment/40 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <PlusMenu
              files={files}
              onPickFile={() => fileInputRef.current?.click()}
              onPickSkill={() => setSkillModal(true)}
              onPickProject={() => setProjectModal(true)}
            />
            {projectId !== UNTAGGED_PROJECT_ID && (
              <div className="group relative inline-flex h-7 items-stretch overflow-hidden rounded-md border border-[#2f6fbf]">
                <button
                  type="button"
                  onClick={() => setProjectModal(true)}
                  aria-label={`プロジェクト: ${projects.find((p) => p.id === projectId)?.name ?? ''}`}
                  className="inline-flex w-7 items-center justify-center bg-[#2f6fbf] text-white transition hover:bg-[#2456a0]"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M2.5 4.2a1 1 0 011-1h3.2l1.2 1.4h4.6a1 1 0 011 1v6.2a1 1 0 01-1 1h-9a1 1 0 01-1-1V4.2z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      fill="currentColor"
                      fillOpacity="0.25"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setProjectId(UNTAGGED_PROJECT_ID)}
                  aria-label="プロジェクトを解除"
                  className="inline-flex w-0 items-center justify-center overflow-hidden bg-[#2f6fbf] text-white opacity-0 transition-[width,opacity] duration-150 hover:bg-[#2456a0] group-hover:w-7 group-hover:opacity-100"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute left-[14px] top-full z-30 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border-warm bg-white px-2.5 py-1 font-sans text-[12px] text-near opacity-0 shadow-whisper transition-opacity duration-100 group-hover:opacity-100"
                >
                  {projects.find((p) => p.id === projectId)?.name ?? 'プロジェクト'}
                </div>
              </div>
            )}
            {files.length > 0 && (
              <span className="font-sans text-[12px] text-olive">添付 {files.length} 件</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ModeSelector value={permissionMode} onChange={setPermissionMode} />
            <ModelPicker value={model} onChange={setModel} />
            <button
              type="button"
              onClick={submit}
              disabled={!prompt.trim() || loading}
              title={`実行 (⌘Enter) — ${phaseLabel(phase, uploadProgress.index, uploadProgress.total)}`}
              aria-label="送信"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-terracotta text-ivory transition hover:bg-[#b5573a] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
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
        {mode === 'upload' && (
          <div className="border-t border-border-cream px-4 py-3">
            <FileDropzone files={files} setFiles={setFiles} />
          </div>
        )}
      </Card>

      {loading && (
        <Card className="mt-4 border-border-warm bg-parchment/60">
          <div className="flex items-center gap-3">
            <span className="inline-flex gap-[3px]">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-terracotta [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-terracotta [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-terracotta" />
            </span>
            <span className="font-sans text-[13px] text-olive">
              現在: {phaseLabel(phase, uploadProgress.index, uploadProgress.total)}
            </span>
          </div>
        </Card>
      )}

      {error && (
        <Card className="mt-4 border-[#e0a9a9] bg-[#f8e5e5]">
          <div className="font-sans text-sm text-error-crimson">エラー: {error}</div>
        </Card>
      )}

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

      {projectModal && (
        <MoveToProjectModal
          currentProjectId={projectId}
          currentProjectName={projects.find((p) => p.id === projectId)?.name ?? null}
          projects={projects}
          onMove={(id) => {
            setProjectId(id);
            setProjectModal(false);
          }}
          onClose={() => setProjectModal(false)}
        />
      )}

      {/* Suggestion chips (claude.ai-style, with icons).
          Each chip fades in from the left with a small bounce; staggered
          delays make the row look like it rolls in with a gentle wave. */}
      <section className="mt-4 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s, i) => {
          const chipClass =
            'chip-wave-in inline-flex items-center gap-1.5 rounded-full border border-border-cream bg-ivory px-3 py-1.5 font-sans text-[13px] text-charcoal transition hover:shadow-ring';
          const chipStyle = { animationDelay: `${i * 90}ms` };
          return s.href ? (
            <a key={s.title} href={s.href} className={chipClass} style={chipStyle}>
              <ChipIconSvg name={s.icon} />
              {s.title}
            </a>
          ) : (
            <button
              key={s.title}
              onClick={() => s.prompt && setPrompt(s.prompt)}
              title={s.prompt}
              className={chipClass}
              style={chipStyle}
            >
              <ChipIconSvg name={s.icon} />
              {s.title}
            </button>
          );
        })}
      </section>
    </div>
  );
}

function ChipIconSvg({ name }: { name: ChipIcon }) {
  const common = { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none' as const, 'aria-hidden': true };
  if (name === 'bulb') {
    return (
      <svg {...common}>
        <path
          d="M8 2.5a4 4 0 0 0-2.5 7.1V11h5V9.6A4 4 0 0 0 8 2.5zM6 13h4M7 14.5h2"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === 'pencil') {
    return (
      <svg {...common}>
        <path
          d="M11.5 2.5 13.5 4.5 5 13H3v-2l8.5-8.5z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === 'clock') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'slack') {
    // Official Slack brand (via simple-icons)
    return <SiSlack size={13} color="#4A154B" aria-hidden="true" />;
  }
  // Official Jira brand
  return <SiJira size={13} color="#0052CC" aria-hidden="true" />;
}

function PlusMenu({
  files,
  onPickFile,
  onPickSkill,
  onPickProject,
}: {
  files: File[];
  onPickFile: () => void;
  onPickSkill: () => void;
  onPickProject: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDocClick = () => setOpen(false);
    // Delay attach so the click that opened the menu doesn't close it.
    const t = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onDocClick);
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
        title="添付 / スキル / プロジェクト"
        aria-label="添付メニューを開く"
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
              onPickFile();
              setOpen(false);
            }}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-sans text-[13px] text-charcoal hover:bg-sand"
          >
            <span>ファイル添付</span>
            {files.length > 0 && (
              <span className="font-mono text-[11px] text-stone">{files.length}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              onPickSkill();
              setOpen(false);
            }}
            className="flex w-full items-center justify-between gap-2 border-t border-border-cream px-3 py-2 text-left font-sans text-[13px] text-charcoal hover:bg-sand"
          >
            <span>スキルを選ぶ</span>
            <span className="font-mono text-[11px] text-stone">/</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onPickProject();
              setOpen(false);
            }}
            className="flex w-full items-center justify-between gap-2 border-t border-border-cream px-3 py-2 text-left font-sans text-[13px] text-charcoal hover:bg-sand"
          >
            <span>プロジェクトを選ぶ</span>
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
          className="absolute left-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-card border border-border-warm bg-white shadow-whisper"
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
          className="absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-card border border-border-warm bg-white shadow-whisper"
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

/** Returns slash-trigger state if the caret follows a `/` that starts at the
 *  beginning of input or after whitespace. Returns null otherwise. */
function detectSlashTrigger(
  text: string,
  caret: number,
  el: HTMLTextAreaElement,
): { start: number; query: string; top: number; left: number } | null {
  // Walk backwards from the caret until we hit a `/` with a valid boundary
  // char in front, or fail (hit whitespace/start before any `/`).
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '/') {
      const before = i === 0 ? '\n' : text[i - 1];
      if (!before || /\s/.test(before)) {
        const query = text.slice(i + 1, caret);
        // Abort if the query already contains whitespace — user moved past the token.
        if (/\s/.test(query)) return null;
        // Position the popover near the textarea (top-left of element, offset down).
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

function FileDropzone({ files, setFiles }: { files: File[]; setFiles: (f: File[]) => void }) {
  return (
    <div
      onDrop={(e) => {
        e.preventDefault();
        setFiles([...files, ...Array.from(e.dataTransfer.files)]);
      }}
      onDragOver={(e) => e.preventDefault()}
      className="rounded-card border-2 border-dashed border-border-warm bg-parchment/50 p-5 text-center"
    >
      <p className="font-sans text-[13px] text-olive">ドラッグ&ドロップ</p>
      <p className="mt-0.5 font-sans text-[11px] text-stone">
        .pcap / .xlsx / .pptx / .pdf / .docx / .csv / .zip …
      </p>
      <label className="mt-3 inline-flex cursor-pointer">
        <span className="rounded-card bg-sand px-3 py-1 font-sans text-[12px] text-charcoal shadow-ring hover:shadow-ring-deep">
          ファイルを選択
        </span>
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) setFiles([...files, ...Array.from(e.target.files)]);
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="mt-3 space-y-1 text-left font-mono text-[11px] text-olive">
          {files.map((f, i) => (
            <li key={i} className="flex justify-between border-t border-border-cream pt-1.5">
              <span className="truncate">{f.name}</span>
              <span className="text-stone">{(f.size / 1024).toFixed(1)} KB</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

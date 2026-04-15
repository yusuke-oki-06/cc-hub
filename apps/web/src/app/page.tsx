'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { api, runnerBase, getAuthHeader, withTimeout } from '@/lib/api';
import { SiSlack, SiJira } from 'react-icons/si';
import { TokenSetup } from '@/components/token-setup';
import {
  GUI_PERMISSION_MODES,
  type GuiPermissionMode,
  type ToolProfile,
} from '@cc-hub/shared';

interface Project {
  id: string;
  name: string;
}

type ChipIcon = 'bulb' | 'pencil' | 'slack' | 'jira';

const SUGGESTIONS: Array<{ title: string; prompt: string; icon: ChipIcon }> = [
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
  const [profiles, setProfiles] = useState<ToolProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('00000000-0000-0000-0000-000000000100');
  const [profileId, setProfileId] = useState('default');
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [gitUrl, setGitUrl] = useState('');
  const [mode, setMode] = useState<'upload' | 'git' | 'none'>('none');
  const [permissionMode, setPermissionMode] = useState<GuiPermissionMode>('default');
  const [phase, setPhase] = useState<SubmitPhase>('idle');
  const [uploadProgress, setUploadProgress] = useState<{ index: number; total: number }>({ index: 0, total: 0 });
  const [error, setError] = useState<string>();
  const loading = phase !== 'idle';

  // Random headline, picked on client mount to avoid SSR hydration mismatch.
  const [greeting, setGreeting] = useState<{ headline: string }>({
    headline: '今日は何をしましょう?',
  });
  useEffect(() => {
    setGreeting({ headline: pickRandom(HEADLINES) });
  }, []);

  useEffect(() => {
    void Promise.all([
      api<{ profiles: ToolProfile[] }>('/api/profiles').then((r) => setProfiles(r.profiles)),
      api<{ projects: Project[] }>('/api/projects').then((r) => setProjects(r.projects)),
    ]).catch((err) => setError((err as Error).message));
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
      } else if (mode === 'git' && gitUrl) {
        setPhase('uploading');
        await api(`/api/sessions/${created.sessionId}/git-clone`, {
          method: 'POST',
          body: JSON.stringify({ url: gitUrl }),
        });
      }

      setPhase('starting');
      // Cap claude/start wait at 120s so a stuck sandbox doesn't leave the
      // submit button disabled indefinitely with no way for the user to react.
      await withTimeout(
        api(`/api/sessions/${created.sessionId}/claude/start`, {
          method: 'POST',
          body: JSON.stringify({ permissionMode }),
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
      <Card className="overflow-visible p-0 shadow-whisper theme-airbnb-composer">
        <textarea
          rows={2}
          className="block w-full resize-none border-0 bg-transparent px-5 pt-5 pb-2 font-sans text-[16px] leading-[1.6] text-near placeholder:text-stone focus:outline-none"
          placeholder="例: この pcap の DNS クエリを要約して、怪しい宛先があれば列挙して"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              if (prompt.trim()) void submit();
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-cream bg-parchment/40 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <PlusMenu
              mode={mode}
              setMode={setMode}
              files={files}
              gitUrl={gitUrl}
            />
            {files.length > 0 && (
              <span className="font-sans text-[12px] text-olive">添付 {files.length} 件</span>
            )}
            {gitUrl && (
              <span className="truncate font-sans text-[12px] text-olive">Git 設定済</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-card border border-border-warm bg-white px-2 py-1 font-sans text-[12px] text-near"
              value={permissionMode}
              onChange={(e) => setPermissionMode(e.target.value as GuiPermissionMode)}
              title="実行モード"
            >
              {GUI_PERMISSION_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-card border border-border-warm bg-white px-2 py-1 font-sans text-[12px] text-near"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-card border border-border-warm bg-white px-2 py-1 font-sans text-[12px] text-near"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={submit} disabled={!prompt.trim() || loading}>
              {phaseLabel(phase, uploadProgress.index, uploadProgress.total)}
            </Button>
          </div>
        </div>
        {mode === 'upload' && (
          <div className="border-t border-border-cream px-4 py-3">
            <FileDropzone files={files} setFiles={setFiles} />
          </div>
        )}
        {mode === 'git' && (
          <div className="border-t border-border-cream px-4 py-3">
            <input
              className="w-full rounded-card border border-border-warm bg-white px-3 py-2 font-mono text-[13px]"
              placeholder="https://github.com/org/repo.git"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
            />
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

      {/* Suggestion chips (claude.ai-style, with icons) */}
      <section className="mt-4 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => setPrompt(s.prompt)}
            title={s.prompt}
            className="inline-flex items-center gap-1.5 rounded-full border border-border-cream bg-ivory px-3 py-1.5 font-sans text-[13px] text-charcoal transition hover:shadow-ring"
          >
            <ChipIconSvg name={s.icon} />
            {s.title}
          </button>
        ))}
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
  if (name === 'slack') {
    // Official Slack brand (via simple-icons)
    return <SiSlack size={13} color="#4A154B" aria-hidden="true" />;
  }
  // Official Jira brand
  return <SiJira size={13} color="#0052CC" aria-hidden="true" />;
}

function PlusMenu({
  mode,
  setMode,
  files,
  gitUrl,
}: {
  mode: 'upload' | 'git' | 'none';
  setMode: (m: 'upload' | 'git' | 'none') => void;
  files: File[];
  gitUrl: string;
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
        title="添付 / Git"
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
              setMode(mode === 'upload' ? 'none' : 'upload');
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
              setMode(mode === 'git' ? 'none' : 'git');
              setOpen(false);
            }}
            className="flex w-full items-center justify-between gap-2 border-t border-border-cream px-3 py-2 text-left font-sans text-[13px] text-charcoal hover:bg-sand"
          >
            <span>Git クローン</span>
            {gitUrl && <span className="font-mono text-[11px] text-stone">設定済</span>}
          </button>
        </div>
      )}
    </div>
  );
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

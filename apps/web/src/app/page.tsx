'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { api, runnerBase, getAuthHeader, withTimeout } from '@/lib/api';
import { TokenSetup } from '@/components/token-setup';
import type { ToolProfile } from '@cc-hub/shared';

interface Project {
  id: string;
  name: string;
}

const SUGGESTIONS = [
  {
    title: 'パケキャプを解析',
    prompt:
      'このパケットキャプチャに含まれる怪しい通信を検出してください。TCP 再送が多い宛先、DNS クエリの異常も含めて。',
  },
  {
    title: 'Excel を要約',
    prompt:
      'このエクセルのシートをすべて読み、各シートの目的・主要な指標・異常値 (外れ値) を日本語で箇条書きにしてください。',
  },
  {
    title: 'パワポのレビュー',
    prompt:
      'このパワポの各スライドを日本語で 1 行に要約し、論旨が弱いところ / 補足が必要なところを指摘してください。',
  },
  {
    title: 'PDF 文書から要点抽出',
    prompt:
      'この PDF の要点を 10 項目以内にまとめ、引用したページ番号を併記してください。',
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

// ─── Time-of-day greeting + randomized headline ─────────────────────
type TimeSlot = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'late';

const GREETINGS: Record<TimeSlot, string[]> = {
  dawn:      ['早起きですね、おはようございます', '早朝からお疲れ様です', 'まだ静かな朝ですね'],
  morning:   ['おはようございます', 'いい朝ですね', '今日も一日始まりました'],
  noon:      ['こんにちは', 'お昼休憩中ですか?', 'お疲れ様です'],
  afternoon: ['午後もよろしくお願いします', '集中できる時間ですね', 'おかえりなさい'],
  evening:   ['お疲れ様です', 'こんばんは', '一日、お疲れ様です'],
  night:     ['こんばんは', '夜の作業ですね', 'お疲れ様です'],
  late:      ['夜更かしですね', 'こんな時間までお疲れ様です', 'もう少しで一段落?'],
};

const HEADLINES: string[] = [
  '今日は何をしましょう?',
  '何から始めましょうか?',
  'どんなタスクですか?',
  'どんな資料を見てもらいましょう?',
  '気になっていることを教えてください',
  '手伝えることはありますか?',
  '次の一歩、お手伝いします',
  '今日の困りごとを教えてください',
  'どんな調べ物をしますか?',
  'さて、始めましょうか',
];

function pickSlot(h: number): TimeSlot {
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 11) return 'morning';
  if (h >= 11 && h < 14) return 'noon';
  if (h >= 14 && h < 17) return 'afternoon';
  if (h >= 17 && h < 19) return 'evening';
  if (h >= 19 && h < 23) return 'night';
  return 'late';
}
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
  const [phase, setPhase] = useState<SubmitPhase>('idle');
  const [uploadProgress, setUploadProgress] = useState<{ index: number; total: number }>({ index: 0, total: 0 });
  const [error, setError] = useState<string>();
  const loading = phase !== 'idle';

  // Time-based greeting + random headline, picked on client mount to avoid
  // SSR hydration mismatch. SSR serves a neutral default that gets replaced
  // after hydration so the pair is always refreshed per visit.
  const [greeting, setGreeting] = useState<{ hello: string; headline: string }>({
    hello: '',
    headline: '今日は何をしましょう?',
  });
  useEffect(() => {
    const slot = pickSlot(new Date().getHours());
    setGreeting({
      hello: pickRandom(GREETINGS[slot]),
      headline: pickRandom(HEADLINES),
    });
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
          body: JSON.stringify({}),
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
    <div className="mx-auto max-w-[860px] px-8 py-12">
      <TokenSetup />

      <header className="mb-10 mt-2 text-center">
        {greeting.hello && (
          <div className="mb-2 font-sans text-[13px] text-olive" suppressHydrationWarning>
            {greeting.hello}
          </div>
        )}
        <h1
          className="font-serif text-[56px] leading-[1.05] text-near theme-airbnb-hero"
          suppressHydrationWarning
        >
          {greeting.headline}
        </h1>
        <p className="mt-3 font-sans text-[14px] text-olive">
          ファイル or Git を添えて依頼を書くだけ。Claude が解析して返します。
        </p>
      </header>

      {/* Big prompt composer */}
      <Card className="overflow-hidden p-0 shadow-whisper theme-airbnb-composer">
        <textarea
          rows={5}
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
          <div className="flex items-center gap-1">
            <AttachButton
              active={mode === 'upload'}
              onClick={() => setMode(mode === 'upload' ? 'none' : 'upload')}
              label={files.length > 0 ? `添付 ${files.length} 件` : '添付'}
            />
            <AttachButton
              active={mode === 'git'}
              onClick={() => setMode(mode === 'git' ? 'none' : 'git')}
              label={gitUrl ? 'Git URL 設定済' : 'Git'}
            />
          </div>
          <div className="flex items-center gap-2">
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

      {/* Suggestion cards */}
      <section className="mt-10">
        <h2 className="mb-3 font-sans text-[12px] font-medium uppercase tracking-[0.5px] text-stone">
          よくある依頼
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.title}
              onClick={() => setPrompt(s.prompt)}
              className="rounded-card border border-border-cream bg-ivory px-4 py-3 text-left transition hover:shadow-ring"
            >
              <div className="font-serif text-[15px] text-near">{s.title}</div>
              <p className="mt-1 line-clamp-2 font-sans text-[12px] text-olive">{s.prompt}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function AttachButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'rounded-card px-2.5 py-1 font-sans text-[12px] transition ' +
        (active ? 'bg-sand text-near shadow-ring' : 'text-charcoal hover:bg-sand')
      }
    >
      {label}
    </button>
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

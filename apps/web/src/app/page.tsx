'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { api, runnerBase, getAuthHeader } from '@/lib/api';
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
    emoji: '📡',
  },
  {
    title: 'Excel を要約',
    prompt:
      'このエクセルのシートをすべて読み、各シートの目的・主要な指標・異常値 (外れ値) を日本語で箇条書きにしてください。',
    emoji: '📊',
  },
  {
    title: 'パワポのレビュー',
    prompt:
      'このパワポの各スライドを日本語で 1 行に要約し、論旨が弱いところ / 補足が必要なところを指摘してください。',
    emoji: '🎞',
  },
  {
    title: 'PDF 文書から要点抽出',
    prompt:
      'この PDF の要点を 10 項目以内にまとめ、引用したページ番号を併記してください。',
    emoji: '📄',
  },
];

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void Promise.all([
      api<{ profiles: ToolProfile[] }>('/api/profiles').then((r) => setProfiles(r.profiles)),
      api<{ projects: Project[] }>('/api/projects').then((r) => setProjects(r.projects)),
    ]).catch((err) => setError((err as Error).message));
  }, []);

  const submit = async () => {
    setError(undefined);
    setLoading(true);
    try {
      const created = await api<{ sessionId: string; taskId: string }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ profileId, prompt, projectId }),
      });

      // Run ingest + claude/start in the foreground before navigating.
      // Fire-and-forget after router.push is unreliable: React tears down
      // the component and pending fetches can silently drop, leaving the
      // task stuck in "queued" with no claude exec ever spawning.
      if (mode === 'upload' && files.length > 0) {
        for (const f of files) {
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
        await api(`/api/sessions/${created.sessionId}/git-clone`, {
          method: 'POST',
          body: JSON.stringify({ url: gitUrl }),
        });
      }
      await api(`/api/sessions/${created.sessionId}/claude/start`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      router.push(`/tasks/${created.taskId}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[860px] px-8 py-12">
      <TokenSetup />

      <header className="mb-10 mt-2 text-center">
        <h1 className="font-serif text-[56px] leading-[1.05] text-near">今日は何をしましょう?</h1>
        <p className="mt-3 font-sans text-[14px] text-olive">
          ファイル or Git を添えて依頼を書くだけ。Claude が解析して返します。
        </p>
      </header>

      {/* Big prompt composer */}
      <Card className="overflow-hidden p-0 shadow-whisper">
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
              label={files.length > 0 ? `📎 ${files.length} ファイル` : '📎 添付'}
            />
            <AttachButton
              active={mode === 'git'}
              onClick={() => setMode(mode === 'git' ? 'none' : 'git')}
              label={gitUrl ? '🔗 Git URL 設定済' : '🔗 Git'}
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
              {loading ? '起動中…' : '実行 (⌘Enter)'}
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
              <div className="flex items-center gap-2">
                <span className="text-[18px]">{s.emoji}</span>
                <span className="font-serif text-[15px] text-near">{s.title}</span>
              </div>
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

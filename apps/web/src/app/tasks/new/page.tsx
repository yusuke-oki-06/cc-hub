'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { ToolProfile } from '@cc-hub/shared';
import { runnerBase, getAuthHeader } from '@/lib/api';

export default function NewTask() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ToolProfile[]>([]);
  const [profileId, setProfileId] = useState('default');
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [gitUrl, setGitUrl] = useState('');
  const [mode, setMode] = useState<'upload' | 'git'>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api<{ profiles: ToolProfile[] }>('/api/profiles')
      .then((r) => setProfiles(r.profiles))
      .catch((err) => setError((err as Error).message));
  }, []);

  const onSubmit = async () => {
    setError(undefined);
    setLoading(true);
    try {
      const created = await api<{ sessionId: string; taskId: string }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ profileId, prompt }),
      });

      if (mode === 'upload' && files.length > 0) {
        for (const file of files) {
          const form = new FormData();
          form.append('file', file);
          const res = await fetch(`${runnerBase}/api/sessions/${created.sessionId}/upload`, {
            method: 'POST',
            body: form,
            headers: { Authorization: getAuthHeader() },
          });
          if (!res.ok) throw new Error(`upload failed: ${file.name}`);
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
    <div className="mx-auto max-w-[820px] px-8 py-12 space-y-8">
      <header className="border-b border-border-warm pb-6">
        <Link href="/" className="font-sans text-[13px] text-stone hover:text-olive">
          ← ダッシュボード
        </Link>
        <h1 className="mt-3 font-serif text-[40px] leading-[1.1] text-near">新規タスク</h1>
        <p className="mt-2 font-sans text-[15px] text-olive">
          ファイルを渡して、依頼内容を書くだけ。Claude が解析してレポートを作ります。
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>① 対象データ</CardTitle>
        </CardHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <TabButton active={mode === 'upload'} onClick={() => setMode('upload')}>
              ファイルアップロード
            </TabButton>
            <TabButton active={mode === 'git'} onClick={() => setMode('git')}>
              Git リポジトリ (HTTPS)
            </TabButton>
          </div>
          {mode === 'upload' ? (
            <FileDropzone files={files} setFiles={setFiles} />
          ) : (
            <input
              className="w-full rounded-card border border-border-warm bg-white px-3 py-2.5 font-mono text-[13px] text-near"
              placeholder="https://github.com/org/repo.git"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
            />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>② 依頼内容</CardTitle>
        </CardHeader>
        <textarea
          rows={6}
          className="w-full rounded-card border border-border-warm bg-white px-3 py-2.5 font-sans text-[15px] leading-[1.6] text-near placeholder:text-stone"
          placeholder="例: このパケットキャプチャに含まれる怪しい通信を検出してください。TCP retransmit が多い宛先、DNS クエリの異常も含めて。"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>③ プロファイル</CardTitle>
        </CardHeader>
        <select
          className="w-full rounded-card border border-border-warm bg-white px-3 py-2.5 font-sans text-[14px] text-near"
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Card>

      {error && (
        <Card className="border-[#e0a9a9] bg-[#f8e5e5]">
          <div className="font-sans text-sm text-error-crimson">エラー: {error}</div>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={() => router.back()}>
          キャンセル
        </Button>
        <Button onClick={onSubmit} disabled={loading || !prompt}>
          {loading ? '起動中…' : '実行'}
        </Button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'rounded-card px-4 py-2 font-sans text-[13px] transition ' +
        (active
          ? 'bg-near text-ivory'
          : 'bg-sand text-charcoal hover:shadow-ring')
      }
    >
      {children}
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
      className="rounded-hero border-2 border-dashed border-border-warm bg-parchment p-10 text-center"
    >
      <p className="font-sans text-[14px] text-olive">
        ここにファイルをドラッグ&ドロップ
      </p>
      <p className="mt-1 font-sans text-[12px] text-stone">
        .pcap / .xlsx / .pptx / .pdf / .docx / .csv / .zip ほか
      </p>
      <label className="mt-4 inline-flex cursor-pointer">
        <span className="rounded-card bg-sand px-4 py-2 font-sans text-[13px] text-charcoal shadow-ring hover:shadow-ring-deep">
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
        <ul className="mt-5 space-y-1 text-left font-mono text-[12px] text-olive">
          {files.map((f, i) => (
            <li key={i} className="flex justify-between border-t border-border-cream pt-2">
              <span className="truncate">{f.name}</span>
              <span className="text-stone">{(f.size / 1024).toFixed(1)} KB</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

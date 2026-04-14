'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
          const res = await fetch(
            `${runnerBase}/api/sessions/${created.sessionId}/upload`,
            { method: 'POST', body: form, headers: { Authorization: getAuthHeader() } },
          );
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

      router.push(`/tasks/${created.taskId}?sid=${created.sessionId}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-8 space-y-6">
      <header>
        <h1 className="text-xl font-semibold">新規タスク</h1>
        <p className="text-xs text-slate-400 mt-1">
          ファイルを渡して、依頼内容を書くだけ。Claude が解析してレポートを作ります。
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>① 対象データ</CardTitle>
        </CardHeader>
        <div className="space-y-3">
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
              className="w-full rounded-md bg-slate-900 border border-slate-800 px-3 py-2 text-sm"
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
          className="w-full rounded-md bg-slate-900 border border-slate-800 px-3 py-2 text-sm"
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
          className="w-full rounded-md bg-slate-900 border border-slate-800 px-3 py-2 text-sm"
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
        <Card className="border-red-900/60 bg-red-900/10">
          <div className="text-sm text-red-300">エラー: {error}</div>
        </Card>
      )}

      <div className="flex justify-end gap-2">
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
        'rounded-md px-3 py-1.5 text-sm ' +
        (active
          ? 'bg-brand-500/20 text-brand-50 border border-brand-500/50'
          : 'bg-slate-800 text-slate-300')
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
      className="rounded-lg border-2 border-dashed border-slate-700 bg-slate-900/30 p-6 text-center"
    >
      <p className="text-sm text-slate-400">
        ここにファイルをドラッグ&ドロップ (.pcap / .xlsx / .pdf / .zip / ...)
      </p>
      <input
        type="file"
        multiple
        className="mt-3 block w-full text-xs"
        onChange={(e) => {
          if (e.target.files) setFiles([...files, ...Array.from(e.target.files)]);
        }}
      />
      {files.length > 0 && (
        <ul className="mt-3 space-y-1 text-left text-xs text-slate-300">
          {files.map((f, i) => (
            <li key={i} className="flex justify-between">
              <span className="truncate">{f.name}</span>
              <span className="text-slate-500">{(f.size / 1024).toFixed(1)} KB</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { ToolProfile } from '@cc-hub/shared';

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<ToolProfile[]>([]);
  const [editing, setEditing] = useState<string>('');
  const [draft, setDraft] = useState('');

  const load = () =>
    api<{ profiles: ToolProfile[] }>('/api/profiles').then((r) => setProfiles(r.profiles));

  useEffect(() => {
    void load();
  }, []);

  const startEdit = (p: ToolProfile) => {
    setEditing(p.id);
    setDraft(JSON.stringify(p, null, 2));
  };

  const save = async () => {
    await api('/api/profiles', { method: 'POST', body: draft });
    setEditing('');
    await load();
  };

  return (
    <div className="mx-auto max-w-[900px] px-8 py-12 space-y-6">
      <Link href="/" className="font-sans text-[13px] text-stone hover:text-olive">
        ← ダッシュボード
      </Link>
      <header className="space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e3d196] bg-[#faf3dd] px-2.5 py-[3px] font-sans text-[11px] text-[#7a5a12]">
          管理者向け
        </div>
        <h1 className="font-serif text-[40px] leading-[1.1] text-near">プロファイル</h1>
        <p className="font-sans text-[13px] leading-[1.6] text-olive">
          Claude に許可するツールや 1 セッションの上限を決めるセキュリティ設定です。
          誤って広すぎる権限を与えると機密情報の流出や意図しないコマンド実行につながるため、
          編集は管理者のみを想定しています。
        </p>
      </header>
      {profiles.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle>{p.name}</CardTitle>
            <Button variant="sand" size="sm" onClick={() => startEdit(p)}>
              編集 (JSON)
            </Button>
          </CardHeader>
          {editing === p.id ? (
            <div className="space-y-3">
              <textarea
                rows={22}
                className="w-full rounded-card border border-border-warm bg-white p-3 font-mono text-[12px] text-near"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing('')}>
                  キャンセル
                </Button>
                <Button onClick={save}>保存</Button>
              </div>
            </div>
          ) : (
            <pre className="font-mono text-[12px] text-olive whitespace-pre-wrap">
              {JSON.stringify(p, null, 2)}
            </pre>
          )}
        </Card>
      ))}
    </div>
  );
}

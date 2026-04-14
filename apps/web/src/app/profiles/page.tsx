'use client';
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { ToolProfile } from '@cc-hub/shared';

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<ToolProfile[]>([]);
  const [editing, setEditing] = useState<string>('');
  const [draft, setDraft] = useState('');

  const load = () => api<{ profiles: ToolProfile[] }>('/api/profiles').then((r) => setProfiles(r.profiles));

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
    <div className="mx-auto max-w-3xl p-6 space-y-4">
      <h1 className="text-lg font-semibold">Profile</h1>
      {profiles.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle>{p.name}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => startEdit(p)}>
              編集 (JSON)
            </Button>
          </CardHeader>
          {editing === p.id ? (
            <div className="space-y-2">
              <textarea
                rows={20}
                className="w-full font-mono text-xs rounded bg-slate-900 border border-slate-800 p-2"
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
            <pre className="text-xs text-slate-400 whitespace-pre-wrap">
              {JSON.stringify(p, null, 2)}
            </pre>
          )}
        </Card>
      ))}
    </div>
  );
}

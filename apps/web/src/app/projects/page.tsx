'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  taskCount: number;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const load = () =>
    api<{ projects: Project[] }>('/api/projects').then((r) => setProjects(r.projects));

  useEffect(() => {
    void load();
  }, []);

  const createNew = async () => {
    if (!name.trim()) return;
    await api('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description: description || undefined }),
    });
    setName('');
    setDescription('');
    setCreating(false);
    await load();
  };

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-12 space-y-6">
      <Link href="/" className="font-sans text-[13px] text-stone hover:text-olive">
        ← ダッシュボード
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-[40px] leading-[1.1] text-near">プロジェクト</h1>
        <Button onClick={() => setCreating((v) => !v)}>+ 新規プロジェクト</Button>
      </div>
      {creating && (
        <Card className="border-terracotta/50">
          <div className="space-y-3">
            <input
              className="w-full rounded-card border border-border-warm bg-white px-3 py-2 text-sm"
              placeholder="プロジェクト名 (例: 週次レポート)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <textarea
              rows={2}
              className="w-full rounded-card border border-border-warm bg-white px-3 py-2 text-sm"
              placeholder="説明 (任意)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreating(false)}>
                キャンセル
              </Button>
              <Button onClick={createNew} disabled={!name.trim()}>
                作成
              </Button>
            </div>
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {projects.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="block">
            <Card className="hover:shadow-ring transition cursor-pointer">
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <Badge>{p.taskCount} タスク</Badge>
              </CardHeader>
              {p.description && (
                <p className="font-sans text-[13px] text-olive">{p.description}</p>
              )}
              <div className="mt-2 font-mono text-[11px] text-stone">
                {new Date(p.createdAt).toLocaleString('ja-JP')}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

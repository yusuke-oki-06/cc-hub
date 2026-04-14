'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}
interface Task {
  id: string;
  prompt: string;
  status: string;
  costUsd: number;
  createdAt: string;
}

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (!projectId) return;
    void Promise.all([
      api<Project>(`/api/projects/${projectId}`).then(setProject),
      api<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`).then((r) => setTasks(r.tasks)),
    ]).catch(() => null);
  }, [projectId]);

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-10 space-y-6">
      <Link href="/projects" className="font-sans text-[13px] text-stone hover:text-olive">
        ← プロジェクト一覧
      </Link>
      <header className="flex items-start justify-between border-b border-border-warm pb-5">
        <div>
          <h1 className="font-serif text-[36px] leading-[1.1] text-near">
            {project?.name ?? '…'}
          </h1>
          {project?.description && (
            <p className="mt-2 font-sans text-[14px] text-olive">{project.description}</p>
          )}
        </div>
        <Link href={`/tasks/new?projectId=${projectId}`}>
          <Button>+ このプロジェクトで新規タスク</Button>
        </Link>
      </header>

      <div className="space-y-2">
        {tasks.map((t) => (
          <Link key={t.id} href={`/tasks/${t.id}`}>
            <Card className="hover:shadow-ring transition cursor-pointer">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    <span className="font-mono text-[11px] text-stone">
                      {t.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="font-serif text-[18px] leading-[1.3] text-near line-clamp-2">
                    {t.prompt}
                  </div>
                  <div className="font-mono text-[11px] text-stone">
                    {new Date(t.createdAt).toLocaleString('ja-JP')}
                  </div>
                </div>
                <div className="font-serif text-[16px] text-near">
                  ${t.costUsd.toFixed(3)}
                </div>
              </div>
            </Card>
          </Link>
        ))}
        {tasks.length === 0 && (
          <Card>
            <div className="text-center font-sans text-[13px] text-stone py-6">
              まだタスクがありません
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function statusTone(s: string): 'default' | 'success' | 'warn' | 'danger' {
  if (s === 'succeeded') return 'success';
  if (s === 'running' || s === 'queued') return 'warn';
  if (s === 'failed' || s === 'aborted') return 'danger';
  return 'default';
}

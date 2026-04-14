'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
// Link already imported below; this is just to keep the diff minimal.

interface Skill {
  id: string;
  slug: string;
  version: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showAll, setShowAll] = useState(false);
  const load = () =>
    api<{ skills: Skill[] }>(
      showAll ? '/api/skills' : '/api/skills?status=published',
    ).then((r) => setSkills(r.skills));
  useEffect(() => {
    void load();
  }, [showAll]);

  const install = async (id: string) => {
    await api(`/api/skills/${id}/install`, {
      method: 'POST',
      body: JSON.stringify({ profileId: 'default' }),
    });
    alert('default profile にインストールしました');
  };

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-12 space-y-6">
      <Link href="/" className="font-sans text-[13px] text-stone hover:text-olive">
        ← ダッシュボード
      </Link>
      <div className="flex items-center justify-between border-b border-border-warm pb-4">
        <h1 className="font-serif text-[36px] leading-[1.1] text-near">Skills マーケット</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 font-sans text-[12px] text-olive">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            全状態を表示
          </label>
          <Link href="/skills/new">
            <Button>+ Skill を作る</Button>
          </Link>
          <Link href="/admin/skills/review">
            <Button variant="ghost">レビュー (admin)</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {skills.map((s) => (
          <Link key={s.id} href={`/skills/${s.id}`}>
            <Card className="hover:shadow-ring transition cursor-pointer">
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
              </CardHeader>
              <p className="font-sans text-[13px] text-olive">{s.description ?? '—'}</p>
              <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-stone">
                <span>
                  {s.slug} · v{s.version}
                </span>
                {s.status === 'published' && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void install(s.id);
                    }}
                    className="rounded-card bg-terracotta px-3 py-1 font-sans text-[12px] text-ivory hover:bg-[#b5573a]"
                  >
                    install
                  </button>
                )}
              </div>
            </Card>
          </Link>
        ))}
        {skills.length === 0 && (
          <Card>
            <div className="py-8 text-center font-sans text-[13px] text-stone">
              まだ Skill がありません
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function statusTone(s: string): 'default' | 'success' | 'warn' | 'danger' {
  if (s === 'published') return 'success';
  if (s === 'scan_passed') return 'warn';
  if (s === 'scan_failed' || s === 'rejected') return 'danger';
  return 'default';
}

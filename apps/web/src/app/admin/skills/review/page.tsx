'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

interface Skill {
  id: string;
  slug: string;
  version: string;
  title: string;
  description: string | null;
  status: string;
  scanReport: unknown;
  createdAt: string;
}

export default function SkillReview() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const load = () =>
    api<{ skills: Skill[] }>('/api/skills?status=scan_passed').then((r) => setSkills(r.skills));
  useEffect(() => {
    void load();
  }, []);

  const approve = async (id: string) => {
    await api(`/api/admin/skills/${id}/approve`, { method: 'POST' });
    await load();
  };
  const reject = async (id: string) => {
    await api(`/api/admin/skills/${id}/reject`, { method: 'POST' });
    await load();
  };

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-10 space-y-4">
      <Link href="/skills" className="font-sans text-[13px] text-stone hover:text-olive">
        ← Skills
      </Link>
      <h1 className="font-serif text-[32px] leading-[1.1] text-near">Skill レビュー (admin)</h1>
      <div className="space-y-3">
        {skills.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>
                {s.title} <span className="font-mono text-[11px] text-stone">({s.slug} v{s.version})</span>
              </CardTitle>
              <Badge tone="warn">{s.status}</Badge>
            </CardHeader>
            <p className="font-sans text-[13px] text-olive">{s.description ?? '—'}</p>
            <pre className="mt-2 whitespace-pre-wrap rounded-card border border-border-cream bg-ivory p-3 font-mono text-[11px] text-olive">
              {JSON.stringify(s.scanReport, null, 2).slice(0, 2000)}
            </pre>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => reject(s.id)}>
                却下
              </Button>
              <Button onClick={() => approve(s.id)}>承認 (公開)</Button>
            </div>
          </Card>
        ))}
        {skills.length === 0 && (
          <Card>
            <div className="py-8 text-center font-sans text-[13px] text-stone">
              レビュー待ちの Skill はありません
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

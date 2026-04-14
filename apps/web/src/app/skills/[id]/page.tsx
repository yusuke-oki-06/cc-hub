'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface SkillDetail {
  id: string;
  slug: string;
  version: string;
  title: string;
  description: string | null;
  authorId: string;
  status: 'draft' | 'scan_passed' | 'scan_failed' | 'published' | 'rejected';
  scanReport: {
    passed: boolean;
    issues: Array<{ kind: string; severity: string; message: string; context?: string }>;
  } | null;
  createdAt: string;
  contentText: string | null;
}

export default function SkillDetail() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!id) return;
    api<SkillDetail>(`/api/skills/${id}`)
      .then(setSkill)
      .catch((err) => setError((err as Error).message));
  }, [id]);

  const install = async () => {
    if (!skill) return;
    await api(`/api/skills/${skill.id}/install`, {
      method: 'POST',
      body: JSON.stringify({ profileId: 'default' }),
    });
    alert('default profile にインストールしました');
  };

  if (error) {
    return (
      <div className="mx-auto max-w-[900px] px-8 py-12">
        <Link href="/skills" className="font-sans text-[13px] text-stone hover:text-olive">
          ← Skills
        </Link>
        <Card className="mt-4 border-[#e0a9a9] bg-[#f8e5e5]">
          <div className="text-error-crimson">エラー: {error}</div>
        </Card>
      </div>
    );
  }
  if (!skill) {
    return (
      <div className="mx-auto max-w-[900px] px-8 py-12">
        <div className="font-sans text-[13px] text-stone">読み込み中…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] px-8 py-10 space-y-6">
      <Link href="/skills" className="font-sans text-[13px] text-stone hover:text-olive">
        ← Skills
      </Link>

      <header className="flex items-start justify-between gap-4 border-b border-border-warm pb-5">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(skill.status)}>{skill.status}</Badge>
            <span className="font-mono text-[11px] text-stone">
              {skill.slug} · v{skill.version}
            </span>
          </div>
          <h1 className="font-serif text-[32px] leading-[1.1] text-near">{skill.title}</h1>
          {skill.description && (
            <p className="font-sans text-[14px] text-olive">{skill.description}</p>
          )}
        </div>
        {skill.status === 'published' && (
          <Button onClick={install}>install</Button>
        )}
      </header>

      {/* Scan report */}
      {skill.scanReport && (
        <Card>
          <CardHeader>
            <CardTitle>スキャン結果</CardTitle>
            <Badge tone={skill.scanReport.passed ? 'success' : 'danger'}>
              {skill.scanReport.passed ? 'passed' : 'failed'}
            </Badge>
          </CardHeader>
          {skill.scanReport.issues.length === 0 ? (
            <div className="font-sans text-[13px] text-olive">問題は見つかりませんでした。</div>
          ) : (
            <ul className="space-y-2">
              {skill.scanReport.issues.map((iss, i) => (
                <li
                  key={i}
                  className="rounded-card border border-border-cream bg-ivory px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge tone={severityTone(iss.severity)}>{iss.severity}</Badge>
                    <span className="font-sans text-[12px] text-stone">{iss.kind}</span>
                  </div>
                  <div className="mt-1 font-sans text-[13px] text-near">{iss.message}</div>
                  {iss.context && (
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-olive">
                      {iss.context}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Content preview */}
      {skill.contentText && (
        <Card>
          <CardHeader>
            <CardTitle>SKILL.md</CardTitle>
            <span className="font-mono text-[11px] text-stone">
              {skill.contentText.length} 文字
            </span>
          </CardHeader>
          <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-card border border-border-cream bg-ivory p-3 font-mono text-[12px] leading-[1.6] text-near">
            {skill.contentText}
          </pre>
        </Card>
      )}

      {/* Meta */}
      <Card>
        <CardHeader>
          <CardTitle>メタ情報</CardTitle>
        </CardHeader>
        <dl className="space-y-1 font-sans text-[13px]">
          <div className="flex justify-between">
            <dt className="text-stone">slug</dt>
            <dd className="font-mono text-near">{skill.slug}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone">version</dt>
            <dd className="font-mono text-near">{skill.version}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone">author</dt>
            <dd className="font-mono text-near">{skill.authorId.slice(0, 8)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone">created</dt>
            <dd className="text-near">{new Date(skill.createdAt).toLocaleString('ja-JP')}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

function statusTone(s: string): 'default' | 'success' | 'warn' | 'danger' {
  if (s === 'published') return 'success';
  if (s === 'scan_passed') return 'warn';
  if (s === 'scan_failed' || s === 'rejected') return 'danger';
  return 'default';
}
function severityTone(s: string): 'default' | 'success' | 'warn' | 'danger' {
  if (s === 'high') return 'danger';
  if (s === 'medium') return 'warn';
  return 'default';
}

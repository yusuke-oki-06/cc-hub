'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

const TEMPLATE = `---
name: my-skill
description: ここに Skill の目的を 1 行で書く
---

# My Skill

## When to use
<いつ Claude がこの Skill を呼ぶべきか>

## Steps
1. まず /workspace の中身を確認
2. …
`;

export default function NewSkill() {
  const [slug, setSlug] = useState('my-skill');
  const [version, setVersion] = useState('0.1.0');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [md, setMd] = useState(TEMPLATE);
  const [report, setReport] = useState<unknown>(null);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const r = await api<{ status: string; scanReport: unknown }>('/api/skills', {
        method: 'POST',
        body: JSON.stringify({
          slug,
          version,
          title,
          description: description || undefined,
          contentBase64: Buffer.from(md, 'utf8').toString('base64'),
          contentKind: 'skill_md',
        }),
      });
      setStatus(r.status);
      setReport(r.scanReport);
    } catch (err) {
      setStatus('error: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[900px] px-8 py-10 space-y-4">
      <Link href="/skills" className="font-sans text-[13px] text-stone hover:text-olive">
        ← Skills
      </Link>
      <h1 className="font-serif text-[32px] leading-[1.1] text-near">新しい Skill を作る</h1>
      <Card>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="block font-sans text-[12px] text-stone">slug</span>
              <input
                className="w-full rounded-card border border-border-warm bg-white px-3 py-2 font-mono text-[13px]"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="block font-sans text-[12px] text-stone">version</span>
              <input
                className="w-full rounded-card border border-border-warm bg-white px-3 py-2 font-mono text-[13px]"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </label>
            <label className="space-y-1 col-span-1">
              <span className="block font-sans text-[12px] text-stone">タイトル</span>
              <input
                className="w-full rounded-card border border-border-warm bg-white px-3 py-2 text-[13px]"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="block font-sans text-[12px] text-stone">description</span>
            <input
              className="w-full rounded-card border border-border-warm bg-white px-3 py-2 text-[13px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="space-y-1 block">
            <span className="block font-sans text-[12px] text-stone">SKILL.md</span>
            <textarea
              rows={16}
              className="w-full rounded-card border border-border-warm bg-white p-3 font-mono text-[12px]"
              value={md}
              onChange={(e) => setMd(e.target.value)}
            />
          </label>
          <div className="flex items-center justify-between">
            <div className="font-sans text-[12px] text-stone">
              Claude に作らせたい場合は、新規タスクで
              <code className="mx-1 rounded bg-sand px-1">/skill-create &lt;説明&gt;</code>
              を実行し、生成された SKILL.md をここに貼り付け。
            </div>
            <Button onClick={submit} disabled={!slug || !title || loading}>
              {loading ? 'スキャン中…' : 'Publish (scan)'}
            </Button>
          </div>
        </div>
      </Card>
      {status && (
        <Card className="border-ring-warm">
          <CardHeader>
            <CardTitle>結果: {status}</CardTitle>
          </CardHeader>
          <pre className="whitespace-pre-wrap font-mono text-[11px] text-olive">
            {JSON.stringify(report, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}

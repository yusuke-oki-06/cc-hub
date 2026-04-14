'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

interface AuditEntry {
  id: string;
  ts: string;
  kind: string;
  payload: unknown;
  redacted: boolean;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        const r = await api<{ entries: AuditEntry[] }>('/api/audit?limit=200');
        setEntries(r.entries);
      } catch {
        // ignore
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-12 space-y-6">
      <Link href="/" className="font-sans text-[13px] text-stone hover:text-olive">
        ← ダッシュボード
      </Link>
      <h1 className="font-serif text-[40px] leading-[1.1] text-near">監査ログ</h1>
      <Card>
        <CardHeader>
          <CardTitle>最新 {entries.length} 件</CardTitle>
        </CardHeader>
        <div className="space-y-2 font-mono text-[12px]">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-start gap-3 border-b border-border-cream pb-3 last:border-0"
            >
              <span className="shrink-0 text-stone">
                {e.ts.slice(0, 19).replace('T', ' ')}
              </span>
              <Badge tone={kindTone(e.kind)}>{e.kind}</Badge>
              {e.redacted && <Badge tone="warn">redacted</Badge>}
              <pre className="flex-1 whitespace-pre-wrap break-words text-olive">
                {JSON.stringify(e.payload).slice(0, 800)}
              </pre>
            </div>
          ))}
          {entries.length === 0 && (
            <div className="py-10 text-center font-sans text-[13px] text-stone">
              監査ログはまだありません。
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function kindTone(k: string): 'default' | 'success' | 'warn' | 'danger' | 'brand' {
  if (k === 'guardrail') return 'danger';
  if (k === 'prompt') return 'brand';
  if (k === 'tool_use') return 'success';
  if (k === 'budget') return 'warn';
  return 'default';
}

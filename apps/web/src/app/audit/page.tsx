'use client';
import { useEffect, useState } from 'react';
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
    <div className="mx-auto max-w-5xl p-6 space-y-4">
      <h1 className="text-lg font-semibold">監査ログ</h1>
      <Card>
        <CardHeader>
          <CardTitle>最新 {entries.length} 件</CardTitle>
        </CardHeader>
        <div className="space-y-2 text-xs font-mono">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-start gap-2 border-b border-slate-800 pb-2 last:border-0"
            >
              <span className="text-slate-500">{e.ts.slice(0, 19).replace('T', ' ')}</span>
              <Badge tone={kindTone(e.kind)}>{e.kind}</Badge>
              {e.redacted && <Badge tone="warn">redacted</Badge>}
              <pre className="flex-1 whitespace-pre-wrap break-words text-slate-300">
                {JSON.stringify(e.payload).slice(0, 800)}
              </pre>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function kindTone(k: string): 'default' | 'success' | 'warn' | 'danger' {
  if (k === 'guardrail') return 'danger';
  if (k === 'prompt') return 'default';
  if (k === 'tool_use') return 'success';
  if (k === 'budget') return 'warn';
  return 'default';
}

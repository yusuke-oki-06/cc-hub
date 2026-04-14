'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Health {
  ok: boolean;
  host: string;
  latencyMs?: number;
  error?: string;
}

export function LangfuseBadge() {
  const [h, setH] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api<Health>('/api/langfuse/health');
        if (!cancelled) setH(r);
      } catch (err) {
        if (!cancelled) setH({ ok: false, host: '', error: (err as Error).message });
      }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!h) {
    return (
      <span className="inline-flex items-center gap-1.5 font-sans text-[11px] text-stone">
        <span className="h-1.5 w-1.5 rounded-full bg-stone" />
        Langfuse 確認中…
      </span>
    );
  }
  const label = h.ok
    ? `Langfuse 接続中${h.latencyMs !== undefined ? ` (${h.latencyMs}ms)` : ''}`
    : `Langfuse 未接続`;
  const dot = h.ok ? 'bg-[#7ca05a]' : 'bg-[#d08b63]';
  const title = h.ok ? h.host : h.error ?? h.host;
  return (
    <a
      href={h.host || 'http://localhost:3100'}
      target="_blank"
      rel="noreferrer"
      title={title}
      className="inline-flex items-center gap-1.5 font-sans text-[11px] text-olive hover:text-near"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </a>
  );
}

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface Schedule {
  id: string;
  name: string;
  cronExpr: string;
  prompt: string;
  profileId: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastTaskId: string | null;
  createdAt: string;
}

const PRESET_CRONS: Array<{ label: string; expr: string }> = [
  { label: '毎朝 9:00', expr: '0 9 * * *' },
  { label: '毎週月曜 10:00', expr: '0 10 * * 1' },
  { label: '平日 18:00', expr: '0 18 * * 1-5' },
  { label: '毎月 1 日 0:00', expr: '0 0 1 * *' },
];

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [cronExpr, setCronExpr] = useState('0 9 * * *');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await api<{ schedules: Schedule[] }>('/api/schedules');
      setSchedules(r.schedules);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !cronExpr.trim() || !prompt.trim()) {
      setError('名前・cron 式・プロンプトは必須です');
      return;
    }
    setBusy(true);
    try {
      await api('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ name, cronExpr, prompt }),
      });
      setName('');
      setPrompt('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('このルーティンを削除しますか?')) return;
    await api(`/api/schedules/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="mx-auto max-w-[880px] px-8 py-10 space-y-6">
      <Link href="/" className="font-sans text-[13px] text-stone hover:text-olive">
        ← ダッシュボード
      </Link>
      <header>
        <h1 className="font-serif text-[32px] leading-[1.1] text-near">ルーティン</h1>
        <p className="mt-1 font-sans text-[13px] text-olive">
          プロンプトを cron で定期実行。発火するとサイドバーに「待機中」タスクとして追加され、
          開いて「実行」を押すとサンドボックスが立ち上がります。
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>新しいルーティン</CardTitle>
        </CardHeader>
        <div className="space-y-3 font-sans text-[13px]">
          <label className="block">
            <div className="mb-1 text-[12px] text-stone">名前</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 毎朝のメール要約"
              className="w-full rounded-card border border-border-warm bg-white px-3 py-2 text-near focus:outline-none"
            />
          </label>
          <label className="block">
            <div className="mb-1 flex items-center justify-between text-[12px] text-stone">
              <span>cron 式 (分 時 日 月 曜)</span>
              <div className="flex flex-wrap gap-1">
                {PRESET_CRONS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setCronExpr(p.expr)}
                    className="rounded-full border border-border-cream bg-ivory px-2 py-[1px] text-[11px] text-charcoal hover:bg-sand"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="0 9 * * *"
              className="w-full rounded-card border border-border-warm bg-white px-3 py-2 font-mono text-near focus:outline-none"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-[12px] text-stone">プロンプト (Claude に渡される指示)</div>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例: 今日の Gmail をチェックして、重要なものだけ要約してください"
              className="w-full resize-none rounded-card border border-border-warm bg-white px-3 py-2 text-near focus:outline-none"
            />
          </label>
          {error && (
            <div className="rounded-card border border-[#e0a9a9] bg-[#fbeaea] px-3 py-2 text-[12px] text-error-crimson">
              {error}
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={busy}>
              {busy ? '登録中…' : '登録する'}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>登録済み ({schedules.length})</CardTitle>
        </CardHeader>
        {schedules.length === 0 ? (
          <div className="py-6 text-center font-sans text-[13px] text-stone">
            まだルーティンはありません
          </div>
        ) : (
          <ul className="divide-y divide-border-cream">
            {schedules.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-baseline gap-2 font-sans text-[14px] text-near">
                    <span className="font-medium">{s.name}</span>
                    <span className="font-mono text-[12px] text-stone">{s.cronExpr}</span>
                  </div>
                  <div className="line-clamp-2 font-sans text-[12px] text-olive">{s.prompt}</div>
                  <div className="font-mono text-[10px] text-stone">
                    {s.lastRunAt
                      ? `最終発火: ${new Date(s.lastRunAt).toLocaleString('ja-JP')}`
                      : '未発火'}
                    {s.lastTaskId && (
                      <>
                        {' · '}
                        <Link
                          href={`/tasks/${s.lastTaskId}`}
                          className="text-terracotta hover:underline"
                        >
                          最新のタスク ↗
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(s.id)}>
                  削除
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

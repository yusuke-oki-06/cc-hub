'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useToast } from '@/components/toast';

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

const FREQUENCY_OPTIONS = [
  { label: '毎朝 9:00', expr: '0 9 * * *', desc: '毎日 AM 9:00' },
  { label: '毎週月曜 10:00', expr: '0 10 * * 1', desc: '月曜日 AM 10:00' },
  { label: '平日 18:00', expr: '0 18 * * 1-5', desc: '月〜金 PM 6:00' },
  { label: '毎月 1 日', expr: '0 0 1 * *', desc: '毎月 1 日 AM 0:00' },
];

export default function SchedulesPage() {
  const router = useRouter();
  const toast = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [selectedFreq, setSelectedFreq] = useState(0);
  const [customCron, setCustomCron] = useState(false);
  const [cronExpr, setCronExpr] = useState('0 9 * * *');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

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
    if (!name.trim() || !prompt.trim()) {
      setError('名前とプロンプトは必須です');
      return;
    }
    const expr = customCron ? cronExpr : FREQUENCY_OPTIONS[selectedFreq]?.expr ?? cronExpr;
    setBusy(true);
    try {
      await api('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ name, cronExpr: expr, prompt }),
      });
      setName('');
      setPrompt('');
      setCustomCron(false);
      await load();
      toast.show('ルーティンを登録しました', 'success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('このルーティンを削除しますか?')) return;
    await api(`/api/schedules/${id}`, { method: 'DELETE' });
    toast.show('削除しました', 'success');
    await load();
  };

  const runNow = async (id: string) => {
    setRunningId(id);
    try {
      const res = await api<{ ok: boolean; taskId: string }>(`/api/schedules/${id}/run`, {
        method: 'POST',
      });
      toast.show('タスクを作成しました', 'success');
      await load();
      if (res.taskId) {
        router.push(`/tasks/${res.taskId}`);
      }
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[880px] px-8 py-10 space-y-6">
      <header>
        <h1 className="font-serif text-[32px] leading-[1.1] text-near">ルーティン</h1>
        <p className="mt-1 font-sans text-[13px] text-olive">
          定期実行するプロンプトを登録できます。発火するとサイドバーにタスクとして追加されます。
        </p>
      </header>

      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle>新しいルーティン</CardTitle>
        </CardHeader>
        <div className="space-y-4 font-sans text-[13px]">
          <label className="block">
            <div className="mb-1 text-[12px] font-medium text-stone">名前</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 毎朝のメール要約"
              className="w-full rounded-card border border-border-warm bg-white px-3 py-2 text-near focus:outline-none focus:ring-1 focus:ring-terracotta/40"
            />
          </label>

          {/* Frequency selector */}
          <div>
            <div className="mb-2 text-[12px] font-medium text-stone">実行頻度</div>
            <div className="grid grid-cols-2 gap-2">
              {FREQUENCY_OPTIONS.map((opt, i) => (
                <button
                  key={opt.expr}
                  type="button"
                  onClick={() => {
                    setSelectedFreq(i);
                    setCronExpr(opt.expr);
                    setCustomCron(false);
                  }}
                  className={
                    'rounded-card border px-3 py-2.5 text-left transition ' +
                    (!customCron && selectedFreq === i
                      ? 'border-terracotta bg-[#faf3dd] shadow-[0_0_0_1px_#c96442]'
                      : 'border-border-warm bg-white hover:bg-ivory')
                  }
                >
                  <div className="font-medium text-near">{opt.label}</div>
                  <div className="text-[11px] text-stone">{opt.desc}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCustomCron((v) => !v)}
              className="mt-2 font-sans text-[11px] text-stone hover:text-charcoal"
            >
              {customCron ? '▾ プリセットに戻す' : '▸ カスタム cron 式を入力'}
            </button>
            {customCron && (
              <input
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="分 時 日 月 曜 (例: 0 9 * * *)"
                className="mt-1 w-full rounded-card border border-border-warm bg-white px-3 py-2 font-mono text-near focus:outline-none focus:ring-1 focus:ring-terracotta/40"
              />
            )}
          </div>

          <label className="block">
            <div className="mb-1 text-[12px] font-medium text-stone">プロンプト</div>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例: 今日の Gmail をチェックして、重要なものだけ要約してください"
              className="w-full resize-none rounded-card border border-border-warm bg-white px-3 py-2 text-near focus:outline-none focus:ring-1 focus:ring-terracotta/40"
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

      {/* Schedule list */}
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
                    <span className="rounded-full bg-ivory px-2 py-0.5 font-mono text-[11px] text-stone">
                      {cronToLabel(s.cronExpr)}
                    </span>
                  </div>
                  <div className="line-clamp-2 font-sans text-[12px] text-olive">{s.prompt}</div>
                  <div className="font-mono text-[10px] text-stone">
                    {s.lastRunAt
                      ? `最終実行: ${new Date(s.lastRunAt).toLocaleString('ja-JP')}`
                      : '未実行'}
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
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => runNow(s.id)}
                    disabled={runningId === s.id}
                  >
                    {runningId === s.id ? '実行中…' : '今すぐ実行'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(s.id)}>
                    削除
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** cron 式をわかりやすい日本語ラベルに変換 */
function cronToLabel(expr: string): string {
  const match = FREQUENCY_OPTIONS.find((o) => o.expr === expr);
  if (match) return match.label;
  return expr;
}

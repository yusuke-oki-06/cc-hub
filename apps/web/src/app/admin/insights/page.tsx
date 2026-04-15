'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

interface MonthRow {
  month: string;
  costUsd: number;
  taskCount: number;
  succeededCount: number;
  activeUsers: number;
}

interface Usage {
  todayUsd: number;
  weekUsd: number;
  monthUsd: number;
  prevMonthUsd: number;
  taskCount: number;
  activeUsers: number;
  timeSavedMinutesMonth: number;
  timeSavedMinutesPrevMonth: number;
  minutesSavedPerTask: number;
  succeededCountMonth: number;
  successRateMonth: number;
  totalCostUsd: number;
  topTasks: Array<{ taskId: string; prompt: string; costUsd: number; createdAt: string }>;
  perDay: Array<{ day: string; cost: number; tasks: number }>;
  perMonth: MonthRow[];
}

interface RoiSettings {
  fxJpyPerUsd: number;
}

const DEFAULTS: RoiSettings = { fxJpyPerUsd: 150 };
const STORAGE_KEY = 'cc-hub-roi-settings';

function loadSettings(): RoiSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<RoiSettings>;
    return { fxJpyPerUsd: Number(parsed.fxJpyPerUsd ?? DEFAULTS.fxJpyPerUsd) };
  } catch {
    return DEFAULTS;
  }
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} 分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} 時間` : `${h} 時間 ${m} 分`;
}

function yen(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `¥${Math.round(n).toLocaleString('ja-JP')}`;
}

function percent(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

function deltaBadge(now: number, prev: number): { label: string; tone: 'up' | 'down' | 'flat' } {
  if (prev <= 0 && now <= 0) return { label: '—', tone: 'flat' };
  if (prev <= 0) return { label: '新規', tone: 'up' };
  const delta = (now - prev) / prev;
  if (Math.abs(delta) < 0.005) return { label: 'ほぼ横ばい', tone: 'flat' };
  const sign = delta >= 0 ? '▲' : '▼';
  return { label: `前月比 ${sign}${(Math.abs(delta) * 100).toFixed(1)}%`, tone: delta >= 0 ? 'up' : 'down' };
}

export default function AdminInsights() {
  const [u, setU] = useState<Usage | null>(null);
  const [settings, setSettings] = useState<RoiSettings>(DEFAULTS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    void api<Usage>('/api/admin/usage-summary')
      .then(setU)
      .catch(() => null);
  }, []);

  const persistSettings = (next: RoiSettings) => {
    setSettings(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  };

  const derived = useMemo(() => {
    if (!u) return null;
    const hoursSaved = u.timeSavedMinutesMonth / 60;
    const prevHoursSaved = u.timeSavedMinutesPrevMonth / 60;
    const spendJpy = u.monthUsd * settings.fxJpyPerUsd;
    const prevSpendJpy = u.prevMonthUsd * settings.fxJpyPerUsd;
    const totalSpendJpy = u.totalCostUsd * settings.fxJpyPerUsd;
    // 単位時間あたり投資額 — 時給換算なしで語れる効率指標。
    const costPerHourSaved = hoursSaved > 0 ? spendJpy / hoursSaved : null;
    const avgCostPerTask = u.taskCount > 0 ? spendJpy / u.taskCount : 0;
    const annualHoursProjection = hoursSaved * 12;
    const annualSpendJpy = spendJpy * 12;
    return {
      hoursSaved,
      prevHoursSaved,
      spendJpy,
      prevSpendJpy,
      totalSpendJpy,
      costPerHourSaved,
      avgCostPerTask,
      annualHoursProjection,
      annualSpendJpy,
    };
  }, [u, settings]);

  const maxMonthSpendJpy =
    Math.max(0.01, ...(u?.perMonth ?? []).map((m) => m.costUsd * settings.fxJpyPerUsd));
  const maxMonthHours =
    Math.max(
      0.01,
      ...(u?.perMonth ?? []).map((m) => (m.succeededCount * (u?.minutesSavedPerTask ?? 30)) / 60),
    );
  const maxCost = Math.max(0.01, ...(u?.perDay.map((p) => p.cost) ?? [0]));

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-10 space-y-6">
      <Link href="/" className="font-sans text-[13px] text-stone hover:text-olive">
        ← ダッシュボード
      </Link>
      <header className="flex items-start justify-between gap-4 border-b border-border-warm pb-4">
        <div>
          <h1 className="font-serif text-[36px] leading-[1.1] text-near">利用状況 (経営サマリー)</h1>
          <p className="mt-1 font-sans text-[12px] text-stone">
            投資対効果を経営層に示すための集計。時給単価は組織・案件で異なるため、ここでは時間と投資額をそのまま提示します。詳細な trace は{' '}
            <a
              href={process.env.NEXT_PUBLIC_LANGFUSE_URL ?? 'http://localhost:3100'}
              target="_blank"
              rel="noreferrer"
              className="underline text-terracotta"
            >
              Langfuse ↗
            </a>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="shrink-0 rounded-card border border-border-warm bg-white px-3 py-1.5 font-sans text-[12px] text-charcoal hover:bg-sand"
        >
          算定パラメータ {settingsOpen ? '▲' : '▼'}
        </button>
      </header>

      {settingsOpen && (
        <Card>
          <CardHeader>
            <CardTitle>算定パラメータ</CardTitle>
            <span className="font-sans text-[11px] text-stone">ブラウザ単位で保存されます</span>
          </CardHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block font-sans text-[12px] text-stone">
              <span className="mb-1 block">為替レート (¥/USD)</span>
              <input
                type="number"
                min={0}
                step={1}
                value={settings.fxJpyPerUsd}
                onChange={(e) =>
                  persistSettings({ ...settings, fxJpyPerUsd: Number(e.target.value) })
                }
                className="w-full rounded-card border border-border-warm bg-white px-3 py-1.5 font-mono text-[13px] text-near"
              />
            </label>
            <div className="block font-sans text-[12px] text-stone">
              <span className="mb-1 block">タスクあたり削減時間 (推定)</span>
              <div className="rounded-card border border-border-cream bg-ivory px-3 py-1.5 font-mono text-[13px] text-near">
                {u?.minutesSavedPerTask ?? 30} 分
                <span className="ml-2 font-sans text-[11px] text-stone">server-side</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ① Executive summary — 稼働削減時間 と Claude 投資額 の 2 大ヘッドライン */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <HeroCard
          label="今月の稼働削減時間"
          value={u ? formatTime(u.timeSavedMinutesMonth) : '…'}
          delta={u ? deltaBadge(u.timeSavedMinutesMonth, u.timeSavedMinutesPrevMonth) : undefined}
          accent="olive"
          subline={u ? `完了 ${u.succeededCountMonth} 件 × 人手 ${u.minutesSavedPerTask} 分/件の概算` : undefined}
        />
        <HeroCard
          label="今月の Claude 投資額"
          value={derived ? yen(derived.spendJpy) : '…'}
          delta={derived ? deltaBadge(derived.spendJpy, derived.prevSpendJpy) : undefined}
          accent="terracotta"
          subline={u ? `$${u.monthUsd.toFixed(2)} × ${settings.fxJpyPerUsd} 円/USD` : undefined}
        />
      </section>

      {/* ② 効率・予測 */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          label="1 時間削減あたり投資額"
          value={
            derived?.costPerHourSaved == null
              ? '—'
              : yen(derived.costPerHourSaved)
          }
          hint="¥ / 削減時間 1 時間。低いほど効率的"
        />
        <StatCard
          label="年間の稼働削減時間予測"
          value={derived ? formatTime(Math.round(derived.annualHoursProjection * 60)) : '…'}
          hint="直近月ペース × 12"
        />
        <StatCard
          label="年間の Claude 投資額予測"
          value={derived ? yen(derived.annualSpendJpy) : '…'}
          hint="直近月ペース × 12"
        />
        <StatCard
          label="1 タスク当たり平均コスト"
          value={derived ? yen(derived.avgCostPerTask) : '…'}
          hint={u ? `全 ${u.taskCount} 件の平均` : undefined}
        />
      </section>

      {/* ③ 利用定着 */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="今月の MAU"
          value={`${u?.activeUsers ?? '…'} 人`}
          hint="タスクを実行したユーザー数"
        />
        <StatCard
          label="1 ユーザー当たり削減時間"
          value={
            u && u.activeUsers > 0
              ? formatTime(Math.round(u.timeSavedMinutesMonth / u.activeUsers))
              : '—'
          }
          hint="削減時間 ÷ MAU"
        />
        <StatCard
          label="今月のタスク成功率"
          value={u ? percent(u.successRateMonth) : '…'}
          hint={u ? `${u.succeededCountMonth} / ${u.taskCount} 件` : undefined}
        />
      </section>

      {/* ④ 月次トレンド — 削減時間 と 投資額 を並べる */}
      <Card>
        <CardHeader>
          <CardTitle>直近 6 ヶ月の推移</CardTitle>
          <span className="font-sans text-[11px] text-stone">
            上段=稼働削減時間 / 下段=Claude 投資額 (¥)
          </span>
        </CardHeader>
        <div className="space-y-3">
          {(u?.perMonth ?? []).map((m) => {
            const hours = (m.succeededCount * (u?.minutesSavedPerTask ?? 30)) / 60;
            const spendJpy = m.costUsd * settings.fxJpyPerUsd;
            const hoursPct = (hours / maxMonthHours) * 100;
            const spendPct = (spendJpy / maxMonthSpendJpy) * 100;
            return (
              <div key={m.month} className="grid grid-cols-[70px_1fr_auto] items-center gap-3">
                <div className="font-mono text-[12px] text-stone">{m.month}</div>
                <div className="space-y-1">
                  <div className="relative h-3 rounded-sm bg-sand/50">
                    <div
                      className="absolute left-0 top-0 h-3 rounded-sm bg-[#7a9a3a]"
                      style={{ width: `${hoursPct}%` }}
                      title={`削減時間 ${hours.toFixed(1)} 時間`}
                    />
                  </div>
                  <div className="relative h-3 rounded-sm bg-sand/50">
                    <div
                      className="absolute left-0 top-0 h-3 rounded-sm bg-terracotta/70"
                      style={{ width: `${spendPct}%` }}
                      title={`投資額 ${yen(spendJpy)}`}
                    />
                  </div>
                </div>
                <div className="text-right font-mono text-[11px] text-stone">
                  <div className="text-[#3f5a24]">{hours.toFixed(1)} h</div>
                  <div className="text-terracotta">{yen(spendJpy)}</div>
                </div>
              </div>
            );
          })}
          {(!u || u.perMonth.length === 0) && (
            <div className="py-6 text-center font-sans text-[12px] text-stone">データなし</div>
          )}
        </div>
      </Card>

      {/* ⑤ 既存: 日次 + Top tasks */}
      <Card>
        <CardHeader>
          <CardTitle>直近 28 日の日次コスト</CardTitle>
        </CardHeader>
        <div className="flex h-36 items-end gap-1">
          {u?.perDay.map((p) => (
            <div
              key={p.day}
              className="flex-1 rounded-t bg-terracotta/80 hover:bg-terracotta"
              style={{ height: `${(p.cost / maxCost) * 100}%` }}
              title={`${p.day}: $${p.cost.toFixed(3)} (${p.tasks} tasks)`}
            />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>コスト上位タスク</CardTitle>
        </CardHeader>
        <ul className="space-y-2 font-sans text-[13px]">
          {u?.topTasks.map((t) => (
            <li key={t.taskId} className="flex items-start justify-between border-b border-border-cream pb-2">
              <div className="min-w-0 flex-1">
                <div className="line-clamp-1 text-near">{t.prompt}</div>
                <div className="font-mono text-[10px] text-stone">
                  {new Date(t.createdAt).toLocaleString('ja-JP')}
                </div>
              </div>
              <div className="ml-3 shrink-0 font-serif text-[14px] text-near">
                ${t.costUsd.toFixed(3)}
                <span className="ml-2 font-sans text-[11px] text-stone">
                  ≒ {yen(t.costUsd * settings.fxJpyPerUsd)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <div className="font-sans text-[12px] text-stone">{label}</div>
      <div className="mt-1 font-serif text-[28px] leading-[1] text-near">{value}</div>
      {hint && <div className="mt-1 font-sans text-[11px] text-stone">{hint}</div>}
    </Card>
  );
}

function HeroCard({
  label,
  value,
  subline,
  delta,
  accent,
}: {
  label: string;
  value: string;
  subline?: string;
  delta?: { label: string; tone: 'up' | 'down' | 'flat' };
  accent: 'terracotta' | 'olive';
}) {
  const accentClass =
    accent === 'terracotta'
      ? 'border-terracotta/40 bg-[linear-gradient(135deg,#fbece4_0%,#ffffff_65%)]'
      : 'border-[#7a9a3a]/40 bg-[linear-gradient(135deg,#eef5df_0%,#ffffff_65%)]';
  const deltaClass =
    delta?.tone === 'up'
      ? 'border-[#bcd5a6] bg-[#f3f8ec] text-[#3f5a24]'
      : delta?.tone === 'down'
        ? 'border-[#e0a9a9] bg-[#fbeaea] text-error-crimson'
        : 'border-border-cream bg-ivory text-stone';
  return (
    <Card className={`border ${accentClass}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-sans text-[12px] text-stone">{label}</div>
        {delta && (
          <span className={`rounded-full border px-2 py-[1px] font-sans text-[11px] ${deltaClass}`}>
            {delta.label}
          </span>
        )}
      </div>
      <div className="mt-2 font-serif text-[44px] leading-[1] text-near">{value}</div>
      {subline && <div className="mt-2 font-sans text-[12px] text-olive">{subline}</div>}
    </Card>
  );
}

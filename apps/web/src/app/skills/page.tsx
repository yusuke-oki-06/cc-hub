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
  category: string;
  installCount: number;
  favoriteCount: number;
  favoritedByMe: boolean | null;
  createdAt: string;
}

// `favorites` は「お気に入り登録済みだけ」を絞り込むフィルタ。通常カテゴリと
// 並列に並べてタブ切替で扱う。
const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'すべて' },
  { id: 'favorites', label: 'お気に入り' },
  { id: 'general', label: '汎用' },
  { id: 'writing', label: '執筆・編集' },
  { id: 'analysis', label: '分析' },
  { id: 'integration', label: '連携' },
  { id: 'workflow', label: 'ワークフロー' },
  { id: 'other', label: 'その他' },
];

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [ranking, setRanking] = useState<Skill[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [category, setCategory] = useState<string>('all');

  const load = async () => {
    const params = new URLSearchParams();
    if (!showAll) params.set('status', 'published');
    if (category === 'favorites') {
      params.set('favoritedByMe', 'true');
    } else if (category !== 'all') {
      params.set('category', category);
    }
    const [listRes, rankRes] = await Promise.all([
      api<{ skills: Skill[] }>(`/api/skills?${params.toString()}`),
      api<{ skills: Skill[] }>('/api/skills?status=published&orderBy=popular'),
    ]);
    setSkills(listRes.skills);
    // Show top 10 by install count; include those with zero so official seeds
    // don't disappear entirely when no one has installed them yet.
    setRanking(rankRes.skills.slice(0, 10));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll, category]);

  const install = async (id: string) => {
    await api(`/api/skills/${id}/install`, {
      method: 'POST',
      body: JSON.stringify({ profileId: 'default' }),
    });
    await load();
  };

  const toggleFavorite = async (id: string) => {
    await api(`/api/skills/${id}/favorite`, { method: 'POST' });
    await load();
  };

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-12 space-y-6">
      <Link href="/" className="font-sans text-[13px] text-stone hover:text-olive">
        ← ダッシュボード
      </Link>
      <div className="flex items-center justify-between border-b border-border-warm pb-4">
        <h1 className="font-serif text-[36px] leading-[1.1] text-near">Skills マーケットプレイス</h1>
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

      {/* Popularity ranking — 常時表示 (Top 10)。メダル風の順位表示 */}
      {ranking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>人気ランキング Top 10</CardTitle>
            <span className="font-sans text-[11px] text-stone">インストール数順</span>
          </CardHeader>
          <ol className="space-y-1 font-sans text-[13px]">
            {ranking.map((s, i) => (
              <li key={s.id}>
                <Link
                  href={`/skills/${s.id}`}
                  className="flex items-center justify-between gap-3 rounded-card px-2 py-1.5 hover:bg-sand"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <RankBadge rank={i + 1} />
                    <span className="truncate font-medium text-near">{s.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-stone">
                      {categoryLabel(s.category)}
                    </span>
                  </div>
                  <div className="shrink-0 flex items-center gap-3 font-mono text-[11px] text-stone">
                    <span>
                      ★ <span className="tabular-nums">{s.favoriteCount}</span>
                    </span>
                    <span>
                      インストール <span className="tabular-nums">{s.installCount}</span>
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border-cream pb-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={
              'rounded-full border px-3 py-1 font-sans text-[12px] transition ' +
              (category === c.id
                ? 'border-terracotta bg-terracotta text-ivory'
                : 'border-border-cream bg-ivory text-charcoal hover:bg-sand')
            }
          >
            {c.id === 'favorites' ? '★ ' : ''}
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {skills.map((s) => (
          <div key={s.id} className="relative">
            <Link href={`/skills/${s.id}`}>
              <Card className="hover:shadow-ring transition cursor-pointer">
                <CardHeader>
                  <CardTitle>{s.title}</CardTitle>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="default">{categoryLabel(s.category)}</Badge>
                    <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                  </div>
                </CardHeader>
                <p className="font-sans text-[13px] text-olive">{s.description ?? '—'}</p>
                <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[11px] text-stone">
                  <span className="truncate">
                    {s.slug} · v{s.version} · インストール{' '}
                    <span className="tabular-nums">{s.installCount}</span> 件 · ★{' '}
                    <span className="tabular-nums">{s.favoriteCount}</span>
                  </span>
                  {s.status === 'published' && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void install(s.id);
                      }}
                      className="shrink-0 rounded-card bg-terracotta px-3 py-1 font-sans text-[12px] text-ivory hover:bg-[#b5573a]"
                    >
                      install
                    </button>
                  )}
                </div>
              </Card>
            </Link>
            {/* Favorite star — overlayed at the top-right of the card. */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void toggleFavorite(s.id);
              }}
              aria-label={s.favoritedByMe ? 'お気に入り解除' : 'お気に入りに追加'}
              title={s.favoritedByMe ? 'お気に入り解除' : 'お気に入りに追加'}
              className={
                'absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full transition ' +
                (s.favoritedByMe
                  ? 'bg-[#fff7d1] text-[#d4a017] hover:bg-[#fceba5]'
                  : 'bg-white text-stone hover:bg-sand')
              }
            >
              <StarIcon filled={!!s.favoritedByMe} />
            </button>
          </div>
        ))}
        {skills.length === 0 && (
          <Card>
            <div className="py-8 text-center font-sans text-[13px] text-stone">
              {category === 'favorites'
                ? 'お気に入りに登録したスキルはまだありません'
                : 'このカテゴリにはまだ Skill がありません'}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

function statusTone(s: string): 'default' | 'success' | 'warn' | 'danger' {
  if (s === 'published') return 'success';
  if (s === 'scan_passed') return 'warn';
  if (s === 'scan_failed' || s === 'rejected') return 'danger';
  return 'default';
}

function RankBadge({ rank }: { rank: number }) {
  const tone =
    rank === 1
      ? 'bg-[#e0b84c] text-white'
      : rank === 2
        ? 'bg-[#b5b2a8] text-white'
        : rank === 3
          ? 'bg-[#c17a4a] text-white'
          : 'bg-ivory text-stone';
  return (
    <span
      className={
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-serif text-[12px] tabular-nums ' +
        tone
      }
    >
      {rank}
    </span>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15 9 22 9.5 16.5 14 18 21 12 17 6 21 7.5 14 2 9.5 9 9 12 2" />
    </svg>
  );
}

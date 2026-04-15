'use client';
import { useEffect, useMemo, useState } from 'react';
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
  authorId: string;
  installCount: number;
  favoriteCount: number;
  favoritedByMe: boolean | null;
  createdAt: string;
}

// 0010_seed_official_skills.sql で投入した Anthropic 公式ユーザー ID
const OFFICIAL_AUTHOR_ID = '00000000-0000-0000-0000-000000000010';

type CategoryId =
  | 'all'
  | 'favorites'
  | 'general'
  | 'writing'
  | 'analysis'
  | 'integration'
  | 'workflow'
  | 'other';

const CATEGORIES: Array<{ id: CategoryId; label: string; blurb: string; icon: CategoryIcon }> = [
  { id: 'all', label: 'すべて', blurb: '全カテゴリを横断', icon: 'grid' },
  { id: 'favorites', label: 'お気に入り', blurb: '★ をつけたスキル', icon: 'star' },
  { id: 'general', label: '汎用', blurb: '幅広い作業で使える', icon: 'gear' },
  { id: 'writing', label: '執筆・編集', blurb: '文書・スライド作成', icon: 'pencil' },
  { id: 'analysis', label: '分析', blurb: 'データ解析・要約', icon: 'chart' },
  { id: 'integration', label: '連携', blurb: 'MCP / 外部サービス', icon: 'link' },
  { id: 'workflow', label: 'ワークフロー', blurb: '定型作業の自動化', icon: 'flow' },
  { id: 'other', label: 'その他', blurb: 'カテゴリ外', icon: 'dots' },
];

type SortId = 'popular' | 'favorites' | 'recent';
const SORTS: Array<{ id: SortId; label: string }> = [
  { id: 'popular', label: '人気順 (インストール数)' },
  { id: 'favorites', label: 'お気に入り多い順' },
  { id: 'recent', label: '最新順' },
];

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [ranking, setRanking] = useState<Skill[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [category, setCategory] = useState<CategoryId>('all');
  const [sort, setSort] = useState<SortId>('popular');
  const [searchInput, setSearchInput] = useState('');

  // Debounce the search so typing doesn't hit the API on every keystroke.
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const load = async () => {
    const params = new URLSearchParams();
    if (!showAll) params.set('status', 'published');
    params.set('orderBy', sort);
    if (category === 'favorites') {
      params.set('favoritedByMe', 'true');
    } else if (category !== 'all') {
      params.set('category', category);
    }
    if (search) params.set('search', search);
    const [listRes, rankRes] = await Promise.all([
      api<{ skills: Skill[] }>(`/api/skills?${params.toString()}`),
      api<{ skills: Skill[] }>('/api/skills?status=published&orderBy=popular'),
    ]);
    setSkills(listRes.skills);
    setRanking(rankRes.skills.slice(0, 10));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll, category, sort, search]);

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

  const categoryMeta = useMemo(
    () => (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0],
    [],
  );

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

      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[280px] flex-1 items-center gap-2 rounded-full border border-border-cream bg-white px-4 py-2 focus-within:border-terracotta">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-stone">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" fill="none" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="スキルを検索 (名前・用途・カテゴリ)"
            className="flex-1 bg-transparent font-sans text-[13px] text-near placeholder:text-stone focus:outline-none"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="検索をクリア"
              className="shrink-0 rounded p-0.5 text-stone hover:bg-sand hover:text-charcoal"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortId)}
          className="rounded-full border border-border-cream bg-white px-3 py-1.5 font-sans text-[12px] text-near hover:bg-sand"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Popularity ranking — Top 10 with medal badges */}
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
                    {s.authorId === OFFICIAL_AUTHOR_ID && <OfficialBadge />}
                    <span className="shrink-0 font-mono text-[11px] text-stone">
                      {categoryMeta(s.category).label}
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

      {/* Browse by category — card grid */}
      <section>
        <h2 className="mb-3 font-serif text-[18px] text-near">カテゴリから探す</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={
                'flex items-start gap-2 rounded-card border px-3 py-2.5 text-left transition ' +
                (category === c.id
                  ? 'border-terracotta bg-[#fbece4] text-near shadow-ring'
                  : 'border-border-cream bg-white text-charcoal hover:bg-sand')
              }
            >
              <span
                className={
                  'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ' +
                  (category === c.id
                    ? 'bg-terracotta text-ivory'
                    : 'bg-sand text-charcoal')
                }
              >
                <CategoryIconSvg name={c.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-[13px] font-medium">{c.label}</span>
                <span className="block font-sans text-[11px] text-stone">{c.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Skill list */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {skills.map((s) => (
          <div key={s.id} className="relative">
            <Link href={`/skills/${s.id}`}>
              <Card className="hover:shadow-ring transition cursor-pointer">
                <CardHeader>
                  <div className="flex min-w-0 items-center gap-2">
                    <CardTitle>{s.title}</CardTitle>
                    {s.authorId === OFFICIAL_AUTHOR_ID && <OfficialBadge />}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="default">{categoryMeta(s.category).label}</Badge>
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
              {search
                ? `「${search}」に一致するスキルが見つかりません`
                : category === 'favorites'
                  ? 'お気に入りに登録したスキルはまだありません'
                  : 'このカテゴリにはまだ Skill がありません'}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
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

function OfficialBadge() {
  return (
    <span
      className="shrink-0 rounded-full border border-[#2f6fbf] bg-[#e8f0fa] px-2 py-[1px] font-sans text-[10px] font-medium text-[#2456a0]"
      title="Anthropic 公式スキル"
    >
      公式
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

type CategoryIcon = 'grid' | 'star' | 'gear' | 'pencil' | 'chart' | 'link' | 'flow' | 'dots';

function CategoryIconSvg({ name }: { name: CategoryIcon }) {
  const common = { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none' as const, stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (name) {
    case 'grid':
      return (
        <svg {...common}>
          <rect x="2" y="2" width="5" height="5" />
          <rect x="9" y="2" width="5" height="5" />
          <rect x="2" y="9" width="5" height="5" />
          <rect x="9" y="9" width="5" height="5" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common} fill="currentColor">
          <polygon points="8 2 10 6.5 14.5 7 11 10.5 12 15 8 12.5 4 15 5 10.5 1.5 7 6 6.5" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.2" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4" />
        </svg>
      );
    case 'pencil':
      return (
        <svg {...common}>
          <path d="M2 14l1-3 8-8 2 2-8 8-3 1z" />
          <path d="M10 4l2 2" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...common}>
          <path d="M2 13h12" />
          <rect x="3.5" y="8" width="2" height="5" />
          <rect x="7" y="5" width="2" height="8" />
          <rect x="10.5" y="2.5" width="2" height="10.5" />
        </svg>
      );
    case 'link':
      return (
        <svg {...common}>
          <path d="M6.5 9.5a3 3 0 004.2 0l2-2a3 3 0 10-4.2-4.2l-0.8 0.8" />
          <path d="M9.5 6.5a3 3 0 00-4.2 0l-2 2a3 3 0 104.2 4.2l0.8-0.8" />
        </svg>
      );
    case 'flow':
      return (
        <svg {...common}>
          <rect x="1.5" y="3" width="4" height="3" rx="0.5" />
          <rect x="10.5" y="3" width="4" height="3" rx="0.5" />
          <rect x="6" y="10" width="4" height="3" rx="0.5" />
          <path d="M5.5 4.5h5M8 6v4" />
        </svg>
      );
    case 'dots':
    default:
      return (
        <svg {...common} fill="currentColor">
          <circle cx="4" cy="8" r="1.2" />
          <circle cx="8" cy="8" r="1.2" />
          <circle cx="12" cy="8" r="1.2" />
        </svg>
      );
  }
}

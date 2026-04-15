'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { LangfuseBadge } from '@/components/langfuse-badge';
import { ThemeToggle } from '@/components/theme-toggle';

interface Project {
  id: string;
  name: string;
  taskCount: number;
}
interface Task {
  id: string;
  prompt: string;
  status: string;
  createdAt: string;
  profileId: string;
}
interface Budget {
  dailyUsedUsd: number;
  dailyCapUsd: number;
}

export function Sidebar() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [p, t, b] = await Promise.all([
          api<{ projects: Project[] }>('/api/projects'),
          api<{ tasks: Task[] }>('/api/tasks'),
          api<Budget>('/api/me/budget'),
        ]);
        setProjects(p.projects);
        setTasks(t.tasks.slice(0, 12));
        setBudget(b);
      } catch {
        // silent: initial load may fail before token
      }
    };
    void load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  const isActive = (path: string) =>
    pathname === path || (path !== '/' && pathname?.startsWith(path));

  if (collapsed) {
    return (
      <aside className="sticky top-0 flex h-screen w-[56px] shrink-0 flex-col items-center gap-2 border-r border-ring-warm bg-sand py-4">
        <button
          aria-label="サイドバーを開く"
          onClick={() => setCollapsed(false)}
          className="rounded-card p-2 text-charcoal hover:bg-ivory"
        >
          <IconMenu />
        </button>
        <Link
          href="/"
          className="rounded-card bg-terracotta p-2 text-ivory shadow-[0_0_0_1px_#c96442]"
          aria-label="新規セッション"
          title="新規セッション"
        >
          <IconPlus />
        </Link>
        <Link
          href="/workspace"
          className={cn(
            'rounded-card p-2',
            isActive('/workspace') ? 'bg-ivory text-near shadow-[0_0_0_1px_#d1cfc5]' : 'text-charcoal hover:bg-ivory',
          )}
          title="ワークスペース"
        >
          <IconGrid />
        </Link>
        <Link
          href="/projects"
          className={cn(
            'rounded-card p-2',
            isActive('/projects') ? 'bg-ivory text-near shadow-[0_0_0_1px_#d1cfc5]' : 'text-charcoal hover:bg-ivory',
          )}
          title="プロジェクト"
        >
          <IconFolder />
        </Link>
        <Link
          href="/skills"
          className={cn(
            'rounded-card p-2',
            isActive('/skills') ? 'bg-ivory text-near shadow-[0_0_0_1px_#d1cfc5]' : 'text-charcoal hover:bg-ivory',
          )}
          title="Skills"
        >
          <IconStar />
        </Link>
      </aside>
    );
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[260px] shrink-0 flex-col border-r border-ring-warm bg-sand">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-card bg-terracotta text-ivory font-serif">
            CC
          </span>
          <span className="font-serif text-[18px] leading-none text-near">CC Hub</span>
        </Link>
        <button
          aria-label="サイドバーを閉じる"
          onClick={() => setCollapsed(true)}
          className="rounded-card p-1.5 text-stone hover:bg-ivory hover:text-charcoal"
        >
          <IconMenu />
        </button>
      </div>

      {/* + 新規セッション */}
      <div className="px-3">
        <Link
          href="/"
          className={cn(
            'flex items-center justify-center gap-2 rounded-card bg-terracotta px-3 py-2 font-sans text-[14px] font-medium text-ivory shadow-[0_0_0_1px_#c96442] hover:bg-[#b5573a]',
            pathname === '/' ? 'ring-2 ring-terracotta/40' : '',
          )}
        >
          <IconPlus /> 新規セッション
        </Link>
      </div>

      {/* Scrollable body */}
      <div className="mt-4 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {/* Projects */}
        <Section title="プロジェクト" actionHref="/projects" actionLabel="すべて">
          <ul className="space-y-0.5">
            {projects.slice(0, 6).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className={cn(
                    'flex items-center justify-between rounded-card px-2 py-1.5 font-sans text-[13px] text-charcoal hover:bg-ivory',
                    isActive(`/projects/${p.id}`) ? 'bg-ivory text-near shadow-[0_0_0_1px_#d1cfc5]' : '',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <IconFolder className="shrink-0 text-stone" />
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-stone">{p.taskCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        {/* Recent tasks */}
        <Section title="最近のセッション" actionHref="/workspace" actionLabel="開く">
          <ul className="space-y-0.5">
            {tasks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tasks/${t.id}`}
                  className={cn(
                    'flex min-w-0 items-start gap-2 rounded-card px-2 py-1.5 font-sans text-[12.5px] leading-[1.35] text-charcoal hover:bg-ivory',
                    isActive(`/tasks/${t.id}`) ? 'bg-ivory text-near shadow-[0_0_0_1px_#d1cfc5]' : '',
                  )}
                >
                  <StatusDot status={t.status} />
                  <span className="line-clamp-2 flex-1 break-words">{t.prompt}</span>
                </Link>
              </li>
            ))}
            {tasks.length === 0 && (
              <li className="px-2 py-1.5 font-sans text-[12px] text-stone">まだセッションなし</li>
            )}
          </ul>
        </Section>

        {/* Navigation */}
        <Section title="ツール">
          <nav className="space-y-0.5">
            <NavItem href="/workspace" label="ワークスペース" icon={<IconGrid />} active={isActive('/workspace')} />
            <NavItem href="/wiki" label="Wiki" icon={<IconBook />} active={isActive('/wiki')} />
            <NavItem href="/skills" label="Skills" icon={<IconStar />} active={isActive('/skills')} />
            <NavItem href="/audit" label="監査ログ" icon={<IconShield />} active={isActive('/audit')} />
            <NavItem href="/profiles" label="プロファイル" icon={<IconSettings />} active={isActive('/profiles')} />
            <NavItem href="/admin/insights" label="利用状況 (admin)" icon={<IconCrown />} active={isActive('/admin/insights')} />
          </nav>
        </Section>
      </div>

      {/* Footer: budget + Langfuse health */}
      <div className="space-y-2 border-t border-ring-warm px-4 py-3">
        {budget ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between font-sans text-[11px] text-stone">
              <span>今日の利用</span>
              <span className="font-mono text-near">
                ${budget.dailyUsedUsd.toFixed(3)} / ${budget.dailyCapUsd.toFixed(0)}
              </span>
            </div>
            <div className="h-[4px] overflow-hidden rounded-full bg-[#d1cfc5]">
              <div
                className="h-full rounded-full bg-terracotta"
                style={{
                  width: `${Math.min(100, (budget.dailyUsedUsd / budget.dailyCapUsd) * 100)}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="font-sans text-[11px] text-stone">利用量 読み込み中…</div>
        )}
        <div className="pt-1">
          <LangfuseBadge />
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="font-sans text-[10px] uppercase tracking-[0.5px] text-stone">
            Theme
          </span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
  actionHref,
  actionLabel,
}: {
  title: string;
  children: React.ReactNode;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between px-2">
        <h4 className="font-sans text-[11px] font-medium uppercase tracking-[0.5px] text-stone">
          {title}
        </h4>
        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="font-sans text-[10px] text-stone hover:text-charcoal"
          >
            {actionLabel} →
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function NavItem({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-card px-2 py-1.5 font-sans text-[13px] text-charcoal hover:bg-ivory',
        active ? 'bg-ivory text-near shadow-[0_0_0_1px_#d1cfc5]' : '',
      )}
    >
      <span className="text-stone">{icon}</span>
      {label}
    </Link>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'succeeded'
      ? 'bg-[#7a9a3a]'
      : status === 'running' || status === 'queued'
        ? 'bg-[#c5902f]'
        : status === 'failed' || status === 'aborted'
          ? 'bg-[#b53333]'
          : 'bg-stone';
  return <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', color)} />;
}

// ----- minimal inline icons (no external dep) -----
function IconMenu({ className = '' }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconPlus({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconGrid({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function IconFolder({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M2 4.5C2 3.67 2.67 3 3.5 3h3l1.5 1.5h4.5c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5h-9C2.67 13 2 12.33 2 11.5v-7z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
function IconBook({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M3 3h4.5a2 2 0 0 1 2 2v7.5M13 3H8.5a2 2 0 0 0-2 2v7.5M3 3v9.5h4.5M13 3v9.5H8.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconStar({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M8 2.5l1.7 3.4 3.8.5-2.75 2.68.65 3.78L8 11.1 4.6 12.86l.65-3.78L2.5 6.4l3.8-.5L8 2.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconShield({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M8 2l5 2v4c0 3-2 5-5 6-3-1-5-3-5-6V4l5-2z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconSettings({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconCrown({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M2 5l2.5 2.5L8 3l3.5 4.5L14 5v7H2V5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  label: string | null;
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

  useEffect(() => {
    void load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      {/* Top toggle: Chat / Workspace (Claude Desktop-style) */}
      <div className="mx-3 flex gap-0 border-b border-ring-warm">
        <TopTab
          href="/"
          label="Chat"
          active={pathname === '/' || pathname?.startsWith('/tasks') || pathname?.startsWith('/wiki') || pathname?.startsWith('/projects') || pathname?.startsWith('/skills')}
        />
        <TopTab
          href="/workspace"
          label="Monitor"
          active={pathname?.startsWith('/workspace') ?? false}
        />
      </div>

      {/* + 新規セッション */}
      <div className="px-3 pt-3">
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
              <SessionRow
                key={t.id}
                task={t}
                active={isActive(`/tasks/${t.id}`)}
                projects={projects}
                onChanged={() => load()}
              />
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
            <NavItem href="/schedules" label="ルーティン" icon={<IconClock />} active={isActive('/schedules')} />
          </nav>
        </Section>

        {/* Admin-only section. Enforcement is best-effort visual labelling
            in this single-operator PoC; Phase 2 will add middleware RBAC. */}
        <Section title="管理">
          <nav className="space-y-0.5">
            <NavItem href="/profiles" label="プロファイル" icon={<IconSettings />} active={isActive('/profiles')} />
            <NavItem href="/audit" label="監査ログ" icon={<IconShield />} active={isActive('/audit')} />
            <NavItem href="/admin/insights" label="利用状況" icon={<IconCrown />} active={isActive('/admin/insights')} />
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

function SessionRow({
  task,
  active,
  projects,
  onChanged,
}: {
  task: Task;
  active: boolean;
  projects: Project[];
  onChanged: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(task.label ?? task.prompt);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = () => setMenuOpen(false);
    const t = setTimeout(() => document.addEventListener('click', onDoc), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onDoc);
    };
  }, [menuOpen]);

  const submitRename = async () => {
    const next = draft.trim();
    if (!next) {
      setRenaming(false);
      return;
    }
    await api(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ label: next }),
    });
    setRenaming(false);
    onChanged();
  };

  const moveProject = async (projectId: string) => {
    await api(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ projectId }),
    });
    setMenuOpen(false);
    onChanged();
  };

  const del = async () => {
    if (!window.confirm('このセッションを削除しますか? (取り消しできません)')) return;
    await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
    setMenuOpen(false);
    onChanged();
  };

  const displayText = task.label ?? task.prompt;

  return (
    <li className="group relative">
      <div
        className={cn(
          'flex min-w-0 items-start gap-1.5 rounded-card py-1.5 pl-2 pr-0 font-sans text-[12.5px] leading-[1.35] text-charcoal hover:bg-ivory',
          active ? 'bg-ivory text-near shadow-[0_0_0_1px_#d1cfc5]' : '',
        )}
      >
        <Link href={`/tasks/${task.id}`} className="flex min-w-0 flex-1 items-start gap-2">
          <StatusDot status={task.status} />
          {renaming ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              onClick={(e) => e.preventDefault()}
              className="w-full rounded-card border border-border-warm bg-white px-1 text-[12.5px] text-near focus:outline-none"
            />
          ) : (
            <span className="line-clamp-1 flex-1 break-words">{displayText}</span>
          )}
        </Link>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="ml-auto -mr-1.5 shrink-0 rounded p-1 text-stone opacity-0 transition hover:bg-sand hover:text-charcoal group-hover:opacity-100"
          aria-label="セッションメニュー"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="3" r="1.2" fill="currentColor" />
            <circle cx="8" cy="8" r="1.2" fill="currentColor" />
            <circle cx="8" cy="13" r="1.2" fill="currentColor" />
          </svg>
        </button>
      </div>
      {menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-1 top-7 z-20 w-52 overflow-hidden rounded-card border border-border-warm bg-white shadow-whisper"
        >
          <button
            type="button"
            onClick={() => {
              setRenaming(true);
              setMenuOpen(false);
            }}
            className="block w-full px-3 py-2 text-left font-sans text-[12.5px] text-charcoal hover:bg-sand"
          >
            名前を変更
          </button>
          <div className="border-t border-border-cream">
            <div className="px-3 py-1.5 font-sans text-[11px] uppercase tracking-[0.5px] text-stone">
              プロジェクトに移動
            </div>
            {projects.slice(0, 6).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => moveProject(p.id)}
                className="block w-full truncate px-3 py-1.5 text-left font-sans text-[12.5px] text-charcoal hover:bg-sand"
              >
                {p.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={del}
            className="block w-full border-t border-border-cream px-3 py-2 text-left font-sans text-[12.5px] text-[#b53333] hover:bg-[#fbeaea]"
          >
            削除
          </button>
        </div>
      )}
    </li>
  );
}

function TopTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex-1 py-2 text-center font-sans text-[13px] transition',
        active ? 'text-near' : 'text-stone hover:text-charcoal',
      )}
    >
      {label}
      {active && (
        <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-terracotta" />
      )}
    </Link>
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
  if (status === 'running' || status === 'queued') {
    return (
      <span className="relative mt-1 inline-flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#7a9a3a] opacity-70" />
        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-[#7a9a3a]" />
      </span>
    );
  }
  if (status === 'failed' || status === 'aborted') {
    return <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b53333]" />;
  }
  // succeeded / other → subtle grey dot, doesn't grab attention
  return <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c7c3b8]" />;
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

function IconClock({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

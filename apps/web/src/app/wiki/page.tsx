'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { WikiGraph, type GraphNode, type GraphLink } from '@/components/wiki-graph';
import { WikiMarkdown } from '@/components/wiki-markdown';
import { WikiTree, type TreeEntry } from '@/components/wiki-tree';

type ViewMode = 'graph' | 'reading';

interface ConfigRes {
  enabled: boolean;
  vaultPath?: string;
  pageCount?: number;
  initialized?: boolean;
  hint?: string;
}
interface PageRes {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  wikilinks: string[];
  mtime: number;
}

function slugToPath(slug: string): string {
  return slug.endsWith('.md') ? slug : `${slug}.md`;
}

export default function WikiPage() {
  const [cfg, setCfg] = useState<ConfigRes | null>(null);
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [page, setPage] = useState<PageRes | null>(null);
  const [view, setView] = useState<ViewMode>('graph');
  const [error, setError] = useState<string | null>(null);
  const [initBusy, setInitBusy] = useState(false);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const c = await api<ConfigRes>('/api/wiki/config');
      setCfg(c);
      if (!c.enabled) return;
      const t = await api<{ entries: TreeEntry[] }>('/api/wiki/tree');
      setTree(t.entries);
      const g = await api<{ nodes: GraphNode[]; links: GraphLink[] }>('/api/wiki/graph');
      setGraph(g);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedPath) {
      setPage(null);
      return;
    }
    (async () => {
      try {
        const p = await api<PageRes>(`/api/wiki/page?path=${encodeURIComponent(selectedPath)}`);
        setPage(p);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [selectedPath]);

  const selectedId = useMemo(
    () => (selectedPath ? selectedPath.replace(/\.md$/i, '') : null),
    [selectedPath],
  );

  const handleInit = async () => {
    setInitBusy(true);
    try {
      await api('/api/wiki/init', { method: 'POST', body: JSON.stringify({}) });
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInitBusy(false);
    }
  };

  if (cfg === null) {
    return (
      <div className="mx-auto max-w-[1280px] px-8 py-12">
        <div className="font-sans text-[13px] text-stone">読み込み中…</div>
      </div>
    );
  }

  if (!cfg.enabled) {
    return (
      <div className="mx-auto max-w-[860px] px-8 py-12 space-y-5">
        <h1 className="font-serif text-[32px] text-near">Wiki</h1>
        <Card>
          <CardHeader>
            <CardTitle>vault が未設定です</CardTitle>
          </CardHeader>
          <div className="space-y-3 font-sans text-[13px] text-charcoal">
            <p>Obsidian vault のパスを <code className="rounded bg-parchment px-1 font-mono text-[12px]">apps/runner/.env.local</code> に設定してください。</p>
            <pre className="overflow-x-auto rounded-card border border-border-cream bg-parchment p-3 font-mono text-[12px]">
CC_HUB_VAULT_PATH=C:\Users\koori\Documents\ObsidianVault
            </pre>
            <p className="text-olive">設定後、runner を再起動するとこのページが有効になります。</p>
            {cfg.hint && <p className="text-stone">{cfg.hint}</p>}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1480px] px-8 py-8 space-y-4">
      <header className="flex items-end justify-between gap-4 border-b border-border-warm pb-4">
        <div>
          <h1 className="font-serif text-[28px] text-near">Wiki</h1>
          <p className="mt-1 font-sans text-[12px] text-stone">
            {cfg.vaultPath} &middot; {cfg.pageCount ?? 0} pages
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!cfg.initialized && (
            <Button onClick={handleInit} disabled={initBusy} size="sm">
              {initBusy ? '初期化中…' : 'Wiki を初期化 (seed)'}
            </Button>
          )}
          <ViewSegment value={view} onChange={setView} />
        </div>
      </header>

      {error && (
        <Card className="border-[#e0a9a9] bg-[#fbeaea]">
          <div className="font-sans text-[13px] text-error-crimson">エラー: {error}</div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-card border border-border-cream bg-ivory">
          <div className="border-b border-border-cream px-3 py-2 font-sans text-[11px] font-medium uppercase tracking-[0.5px] text-stone">
            files
          </div>
          <div className="max-h-[68vh] overflow-y-auto py-1">
            <WikiTree
              entries={tree}
              selectedPath={selectedPath}
              onSelect={(p) => setSelectedPath(p)}
            />
          </div>
        </aside>

        <section className="min-h-[68vh] rounded-card border border-border-cream bg-ivory">
          {view === 'graph' ? (
            <div className="h-[68vh]">
              <WikiGraph
                nodes={graph.nodes}
                links={graph.links}
                selectedId={selectedId}
                onNodeClick={(n) => {
                  setSelectedPath(slugToPath(n.id));
                  setView('reading');
                }}
              />
            </div>
          ) : (
            <div className="h-[68vh] overflow-y-auto p-6">
              {page ? (
                <>
                  <h2 className="mb-2 font-serif text-[22px] text-near">
                    {(page.frontmatter.title as string) ?? page.path}
                  </h2>
                  <div className="mb-3 font-mono text-[11px] text-stone">{page.path}</div>
                  <WikiMarkdown
                    body={page.body}
                    onWikilinkClick={(target) => {
                      const node = graph.nodes.find(
                        (n) =>
                          n.id === target ||
                          n.id.endsWith(`/${target}`) ||
                          n.path === slugToPath(target),
                      );
                      if (node) {
                        setSelectedPath(node.path);
                      }
                    }}
                  />
                </>
              ) : (
                <div className="py-12 text-center font-sans text-[13px] text-stone">
                  左からページを選んでください
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ViewSegment({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const opts: Array<{ v: ViewMode; label: string }> = [
    { v: 'graph', label: 'グラフ' },
    { v: 'reading', label: 'リーディング' },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-card border border-border-warm bg-white">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={
            'px-3 py-1 font-sans text-[12px] transition ' +
            (value === o.v ? 'bg-sand text-near' : 'text-stone hover:bg-parchment')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

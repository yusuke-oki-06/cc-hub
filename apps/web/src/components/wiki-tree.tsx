'use client';

export interface TreeEntry {
  path: string;
  name: string;
  isDir: boolean;
  mtime: number;
}

interface Props {
  entries: TreeEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

/**
 * Paths hidden from the user-facing tree. These files are either
 * Claude maintenance targets (skill definitions, operating instructions)
 * or append-only history that the user does not edit directly.
 */
const HIDDEN_EXACT = new Set(['CLAUDE.md', 'log.md']);
function isHidden(path: string): boolean {
  if (HIDDEN_EXACT.has(path)) return true;
  // Strip every `.claude/` subtree (skills definitions etc.)
  if (path === '.claude' || path.startsWith('.claude/')) return true;
  return false;
}

/** Japanese label that sits next to an English top-level folder name. */
const FOLDER_HINT: Record<string, string> = {
  raw: '生データ',
  concepts: '概念',
  entities: '固有名詞',
  queries: '過去の質問',
};
/** Japanese label for specific files (key = posix path relative to vault). */
const FILE_HINT: Record<string, string> = {
  'index.md': '目次',
};

function buildTree(entries: TreeEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] };
  for (const e of entries.slice().sort((a, b) => a.path.localeCompare(b.path))) {
    if (isHidden(e.path)) continue;
    const parts = e.path.split('/');
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!;
      const partialPath = parts.slice(0, i + 1).join('/');
      const isLast = i === parts.length - 1;
      let child = cur.children.find((c) => c.name === name);
      if (!child) {
        child = {
          name,
          path: partialPath,
          isDir: isLast ? e.isDir : true,
          children: [],
        };
        cur.children.push(child);
      }
      cur = child;
    }
  }
  function sort(n: TreeNode): void {
    n.children.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of n.children) sort(c);
  }
  sort(root);
  return root.children;
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const isMd = !node.isDir && node.name.toLowerCase().endsWith('.md');
  const pad = { paddingLeft: `${8 + depth * 12}px` };
  if (node.isDir) {
    const hint = depth === 0 ? FOLDER_HINT[node.name] : undefined;
    return (
      <div>
        <div
          className="flex items-baseline gap-1.5 font-sans text-[12px] font-medium uppercase tracking-[0.3px] text-stone"
          style={pad}
        >
          <span className="truncate">{node.name}/</span>
          {hint && (
            <span className="shrink-0 normal-case font-sans text-[11px] tracking-normal text-olive">
              — {hint}
            </span>
          )}
        </div>
        {node.children.map((c) => (
          <TreeItem
            key={c.path}
            node={c}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  }
  const fileHint = depth === 0 ? FILE_HINT[node.path] : undefined;
  return (
    <button
      onClick={() => isMd && onSelect(node.path)}
      disabled={!isMd}
      style={pad}
      className={
        'flex w-full items-baseline gap-1.5 text-left font-sans text-[13px] transition ' +
        (selectedPath === node.path
          ? 'bg-sand text-near'
          : isMd
            ? 'text-charcoal hover:bg-parchment'
            : 'text-stone opacity-60')
      }
    >
      <span className="truncate">{node.name}</span>
      {fileHint && (
        <span className="shrink-0 font-sans text-[11px] text-stone">({fileHint})</span>
      )}
    </button>
  );
}

export function WikiTree({ entries, selectedPath, onSelect }: Props) {
  const tree = buildTree(entries);
  if (tree.length === 0) {
    return (
      <div className="p-4 font-sans text-[12px] text-stone">まだ何もありません</div>
    );
  }
  return (
    <div className="space-y-0.5">
      {tree.map((n) => (
        <TreeItem
          key={n.path}
          node={n}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

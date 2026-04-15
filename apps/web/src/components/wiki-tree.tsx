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

function buildTree(entries: TreeEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] };
  for (const e of entries.slice().sort((a, b) => a.path.localeCompare(b.path))) {
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
  // Sort: directories first, then files; each alphabetically
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
    return (
      <div>
        <div
          className="truncate font-sans text-[12px] font-medium uppercase tracking-[0.3px] text-stone"
          style={pad}
        >
          {node.name}/
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
  return (
    <button
      onClick={() => isMd && onSelect(node.path)}
      disabled={!isMd}
      style={pad}
      className={
        'block w-full truncate text-left font-sans text-[13px] transition ' +
        (selectedPath === node.path
          ? 'bg-sand text-near'
          : isMd
            ? 'text-charcoal hover:bg-parchment'
            : 'text-stone opacity-60')
      }
    >
      {node.name}
    </button>
  );
}

export function WikiTree({ entries, selectedPath, onSelect }: Props) {
  const tree = buildTree(entries);
  if (tree.length === 0) {
    return (
      <div className="p-4 font-sans text-[12px] text-stone">vault が空です</div>
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

import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, relative, dirname, resolve, basename } from 'node:path';
import matter from 'gray-matter';

export interface WikiConfigResult {
  enabled: boolean;
  vaultPath?: string;
  pageCount?: number;
  initialized?: boolean;
}

export interface TreeEntry {
  path: string;          // posix-style relative to vault root, e.g. "concepts/rag.md"
  name: string;          // basename, e.g. "rag.md"
  isDir: boolean;
  mtime: number;         // unix millis
}

export interface GraphNode {
  id: string;            // slug (relative path without .md)
  label: string;         // display name (filename or frontmatter title)
  folder: string;        // "root" | "raw" | "concepts" | ...
  path: string;          // full relative path
}
export interface GraphLink {
  source: string;        // node id
  target: string;        // node id
}
export interface WikiGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface PageContent {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  wikilinks: string[];
  mtime: number;
}

/** Return the configured vault path if set and existing, else null. */
export function resolveVaultPath(): string | null {
  const p = process.env.CC_HUB_VAULT_PATH;
  if (!p) return null;
  if (!existsSync(p)) return null;
  return resolve(p);
}

/**
 * Extract [[wikilink]] targets from markdown body. Handles:
 *   [[target]]
 *   [[target|display]]
 *   [[target#heading]]
 *   [[target#heading|display]]
 * Returns unique target slugs (without heading anchors) in insertion order.
 */
export function parseWikilinks(body: string): string[] {
  const re = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const target = (m[1] ?? '').trim();
    if (!target) continue;
    if (seen.has(target)) continue;
    seen.add(target);
    out.push(target);
  }
  return out;
}

/** Convert a relative vault path ("concepts/rag.md" or "rag") into a slug ("concepts/rag"). */
function toSlug(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/\.md$/i, '');
}

/** Normalize posix path separators. */
function toPosix(p: string): string {
  return p.split(/[\\/]/).join('/');
}

function topFolder(relPath: string): string {
  const posix = toPosix(relPath);
  const idx = posix.indexOf('/');
  return idx < 0 ? 'root' : posix.slice(0, idx);
}

/** List every file/directory recursively. */
export async function scanTree(vaultPath: string): Promise<TreeEntry[]> {
  const out: TreeEntry[] = [];
  async function walk(abs: string, rel: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(abs);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith('.') && name !== '.claude') continue; // hide dotfiles except .claude
      const absChild = join(abs, name);
      const relChild = rel ? `${rel}/${name}` : name;
      let st;
      try {
        st = await stat(absChild);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        out.push({ path: toPosix(relChild), name, isDir: true, mtime: st.mtimeMs });
        await walk(absChild, relChild);
      } else if (st.isFile()) {
        out.push({ path: toPosix(relChild), name, isDir: false, mtime: st.mtimeMs });
      }
    }
  }
  await walk(vaultPath, '');
  return out;
}

/** Read a single page with frontmatter + wikilinks parsed. */
export async function readPage(vaultPath: string, relPath: string): Promise<PageContent> {
  const safe = sanitizeRelPath(relPath);
  const abs = join(vaultPath, safe);
  const raw = await readFile(abs, 'utf8');
  const st = await stat(abs);
  const parsed = matter(raw);
  const body = String(parsed.content ?? '');
  return {
    path: toPosix(safe),
    frontmatter: parsed.data ?? {},
    body,
    wikilinks: parseWikilinks(body),
    mtime: st.mtimeMs,
  };
}

/** Reject paths escaping vault or absolute paths. */
export function sanitizeRelPath(relPath: string): string {
  const cleaned = relPath.replace(/\\/g, '/');
  if (cleaned.startsWith('/')) throw new Error('absolute path not allowed');
  if (cleaned.includes('..')) throw new Error('parent traversal not allowed');
  return cleaned;
}

/**
 * Build the graph for the whole vault.
 * - Nodes: every .md file
 * - Links: each [[target]] in a page becomes a directed edge from that page to
 *   the best-matching .md (target could be "slug" or "folder/slug" — we match
 *   by trailing suffix)
 */
export async function buildGraph(vaultPath: string): Promise<WikiGraph> {
  const all = await scanTree(vaultPath);
  const mdFiles = all.filter((e) => !e.isDir && e.name.toLowerCase().endsWith('.md'));

  // Build node set keyed by slug
  const nodes: GraphNode[] = [];
  const slugByPath = new Map<string, string>();
  for (const entry of mdFiles) {
    const slug = toSlug(entry.path);
    slugByPath.set(entry.path, slug);
    let title: string | undefined;
    try {
      const raw = readFileSync(join(vaultPath, entry.path), 'utf8');
      const fm = matter(raw).data as { title?: unknown } | undefined;
      if (fm && typeof fm.title === 'string') title = fm.title;
    } catch {
      // ignore
    }
    nodes.push({
      id: slug,
      label: title ?? basename(entry.name, '.md'),
      folder: topFolder(entry.path),
      path: entry.path,
    });
  }

  const knownSlugs = new Set(nodes.map((n) => n.id));

  const links: GraphLink[] = [];
  const linkSet = new Set<string>();
  for (const entry of mdFiles) {
    let body = '';
    try {
      const raw = readFileSync(join(vaultPath, entry.path), 'utf8');
      body = matter(raw).content ?? '';
    } catch {
      continue;
    }
    const sourceSlug = slugByPath.get(entry.path)!;
    for (const rawTarget of parseWikilinks(body)) {
      const target = resolveLinkTarget(rawTarget, knownSlugs);
      if (!target) continue;
      const key = `${sourceSlug}::${target}`;
      if (linkSet.has(key)) continue;
      linkSet.add(key);
      links.push({ source: sourceSlug, target });
    }
  }

  return { nodes, links };
}

/**
 * Resolve a [[wikilink]] target to an existing node slug.
 * Prefers exact match. Falls back to suffix match on the slug's last segment
 * (e.g. "rag" matches "concepts/rag"). If the target is a real file like
 * "raw/foo" we accept it as-is.
 */
function resolveLinkTarget(raw: string, knownSlugs: Set<string>): string | null {
  const candidate = toSlug(raw);
  if (knownSlugs.has(candidate)) return candidate;
  // Suffix match: target "rag" → any slug ending with "/rag" or equal to "rag"
  for (const slug of knownSlugs) {
    if (slug === candidate) return slug;
    if (slug.endsWith(`/${candidate}`)) return slug;
  }
  return null;
}

/**
 * Seed a fresh vault with CLAUDE.md / index.md / log.md and the three skills.
 * Skips files that already exist (idempotent).
 */
export async function initVault(vaultPath: string, seedDir: string): Promise<{ written: string[]; skipped: string[] }> {
  const written: string[] = [];
  const skipped: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  async function copyOne(srcAbs: string, destRel: string, transform?: (s: string) => string): Promise<void> {
    const destAbs = join(vaultPath, destRel);
    if (existsSync(destAbs)) {
      skipped.push(destRel);
      return;
    }
    await mkdir(dirname(destAbs), { recursive: true });
    let content = await readFile(srcAbs, 'utf8');
    if (transform) content = transform(content);
    await writeFile(destAbs, content, 'utf8');
    written.push(destRel);
  }

  async function ensureDir(destRel: string): Promise<void> {
    const destAbs = join(vaultPath, destRel);
    if (!existsSync(destAbs)) {
      await mkdir(destAbs, { recursive: true });
      written.push(destRel + '/');
    }
  }

  // Top-level docs
  await copyOne(join(seedDir, 'CLAUDE.md'), 'CLAUDE.md');
  await copyOne(join(seedDir, 'index.md'), 'index.md');
  await copyOne(join(seedDir, 'log.md'), 'log.md', (s) => s.replace('{{INIT_DATE}}', today));

  // Folders (ensure exist so Obsidian shows them immediately)
  await ensureDir('raw');
  await ensureDir('concepts');
  await ensureDir('entities');
  await ensureDir('queries');

  // Skills
  for (const skill of ['wiki-ingest', 'wiki-query', 'wiki-lint']) {
    await copyOne(
      join(seedDir, '.claude', 'skills', skill, 'SKILL.md'),
      `.claude/skills/${skill}/SKILL.md`,
    );
  }

  return { written, skipped };
}

/** Count markdown pages in the vault (shallow stat). */
export function countPages(vaultPath: string): number {
  function walk(abs: string): number {
    let n = 0;
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch {
      return 0;
    }
    for (const name of entries) {
      if (name.startsWith('.') && name !== '.claude') continue;
      const child = join(abs, name);
      let st;
      try {
        st = statSync(child);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        n += walk(child);
      } else if (st.isFile() && name.toLowerCase().endsWith('.md')) {
        n += 1;
      }
    }
    return n;
  }
  return walk(vaultPath);
}

/**
 * Resolve the on-disk seed directory. In production (built), seed lives next to
 * the runner. In dev (tsx) we walk up to the repo root.
 */
export function resolveSeedDir(): string {
  // Convention: infra/wiki-seed/ at repo root. The runner always runs from
  // apps/runner/, so ../../infra/wiki-seed is reliable.
  return resolve(process.cwd(), '..', '..', 'infra', 'wiki-seed');
}

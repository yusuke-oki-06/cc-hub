import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseWikilinks,
  scanTree,
  readPage,
  buildGraph,
  countPages,
  initVault,
  sanitizeRelPath,
} from '../wiki.js';

describe('parseWikilinks', () => {
  it('extracts simple [[target]]', () => {
    expect(parseWikilinks('see [[rag]] and [[memex]]')).toEqual(['rag', 'memex']);
  });
  it('handles [[target|alias]]', () => {
    expect(parseWikilinks('see [[rag|RAG approach]]')).toEqual(['rag']);
  });
  it('handles [[target#heading]]', () => {
    expect(parseWikilinks('see [[rag#intro]]')).toEqual(['rag']);
  });
  it('handles [[target#heading|alias]]', () => {
    expect(parseWikilinks('see [[rag#intro|RAG]]')).toEqual(['rag']);
  });
  it('dedupes by target', () => {
    expect(parseWikilinks('[[rag]] and [[rag]] again')).toEqual(['rag']);
  });
  it('handles folder-scoped targets', () => {
    expect(parseWikilinks('see [[concepts/rag]]')).toEqual(['concepts/rag']);
  });
  it('returns empty for no links', () => {
    expect(parseWikilinks('no links here')).toEqual([]);
  });
});

describe('sanitizeRelPath', () => {
  it('accepts nested paths', () => {
    expect(sanitizeRelPath('concepts/rag.md')).toBe('concepts/rag.md');
  });
  it('rejects absolute paths', () => {
    expect(() => sanitizeRelPath('/etc/passwd')).toThrow();
  });
  it('rejects traversal', () => {
    expect(() => sanitizeRelPath('../outside.md')).toThrow();
  });
});

describe('vault scanning + graph', () => {
  let vault: string;

  beforeAll(async () => {
    vault = await mkdtemp(join(tmpdir(), 'cc-hub-wiki-test-'));
    await writeFile(
      join(vault, 'index.md'),
      '# Index\n- [[concepts/rag]]\n- [[entities/karpathy]]\n',
      'utf8',
    );
    await mkdir(join(vault, 'concepts'));
    await writeFile(
      join(vault, 'concepts', 'rag.md'),
      '---\ntitle: RAG\n---\n\nSee also [[concepts/wiki-pattern]] and [[entities/karpathy]].',
      'utf8',
    );
    await writeFile(
      join(vault, 'concepts', 'wiki-pattern.md'),
      '---\ntitle: Wiki Pattern\n---\n\nContrast with [[rag]].',
      'utf8',
    );
    await mkdir(join(vault, 'entities'));
    await writeFile(
      join(vault, 'entities', 'karpathy.md'),
      '---\ntitle: Andrej Karpathy\n---\n\nAuthored [[concepts/wiki-pattern]].',
      'utf8',
    );
  });

  afterAll(async () => {
    await rm(vault, { recursive: true, force: true });
  });

  it('scanTree returns posix-style relative paths', async () => {
    const entries = await scanTree(vault);
    const files = entries.filter((e) => !e.isDir).map((e) => e.path);
    expect(files).toContain('index.md');
    expect(files).toContain('concepts/rag.md');
    expect(files).toContain('entities/karpathy.md');
  });

  it('countPages returns total md file count', () => {
    expect(countPages(vault)).toBe(4);
  });

  it('readPage returns frontmatter + body + wikilinks', async () => {
    const page = await readPage(vault, 'concepts/rag.md');
    expect(page.frontmatter.title).toBe('RAG');
    expect(page.wikilinks).toEqual(['concepts/wiki-pattern', 'entities/karpathy']);
    expect(page.body).toContain('See also');
  });

  it('buildGraph produces nodes for every md file', async () => {
    const graph = await buildGraph(vault);
    const ids = graph.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['concepts/rag', 'concepts/wiki-pattern', 'entities/karpathy', 'index']);
  });

  it('buildGraph uses frontmatter title for label when present', async () => {
    const graph = await buildGraph(vault);
    const rag = graph.nodes.find((n) => n.id === 'concepts/rag');
    expect(rag?.label).toBe('RAG');
  });

  it('buildGraph resolves [[short-slug]] to folder/slug via suffix match', async () => {
    const graph = await buildGraph(vault);
    // wiki-pattern contains [[rag]] which should resolve to concepts/rag
    const hit = graph.links.find(
      (l) => l.source === 'concepts/wiki-pattern' && l.target === 'concepts/rag',
    );
    expect(hit).toBeDefined();
  });

  it('buildGraph links source and target correctly for qualified slugs', async () => {
    const graph = await buildGraph(vault);
    const expected: Array<[string, string]> = [
      ['index', 'concepts/rag'],
      ['index', 'entities/karpathy'],
      ['concepts/rag', 'concepts/wiki-pattern'],
      ['concepts/rag', 'entities/karpathy'],
      ['entities/karpathy', 'concepts/wiki-pattern'],
    ];
    for (const [s, t] of expected) {
      expect(graph.links).toContainEqual(expect.objectContaining({ source: s, target: t }));
    }
  });

  it('buildGraph assigns folder based on top-level directory', async () => {
    const graph = await buildGraph(vault);
    const byFolder = Object.fromEntries(graph.nodes.map((n) => [n.id, n.folder]));
    expect(byFolder['index']).toBe('root');
    expect(byFolder['concepts/rag']).toBe('concepts');
    expect(byFolder['entities/karpathy']).toBe('entities');
  });
});

describe('initVault', () => {
  let vault: string;
  const seedDir = join(__dirname, '..', '..', '..', '..', '..', 'infra', 'wiki-seed');

  beforeAll(async () => {
    vault = await mkdtemp(join(tmpdir(), 'cc-hub-wiki-init-'));
  });
  afterAll(async () => {
    await rm(vault, { recursive: true, force: true });
  });

  it('seeds an empty vault with CLAUDE.md + index.md + log.md + 3 skills', async () => {
    const result = await initVault(vault, seedDir);
    expect(result.written).toContain('CLAUDE.md');
    expect(result.written).toContain('index.md');
    expect(result.written).toContain('log.md');
    expect(result.written).toContain('.claude/skills/wiki-ingest/SKILL.md');
    expect(result.written).toContain('.claude/skills/wiki-query/SKILL.md');
    expect(result.written).toContain('.claude/skills/wiki-lint/SKILL.md');
  });

  it('substitutes INIT_DATE into log.md', async () => {
    const log = await readFile(join(vault, 'log.md'), 'utf8');
    expect(log).not.toContain('{{INIT_DATE}}');
    expect(log).toMatch(/\[\d{4}-\d{2}-\d{2}\] init/);
  });

  it('is idempotent — second run skips existing files', async () => {
    const result = await initVault(vault, seedDir);
    expect(result.skipped).toContain('CLAUDE.md');
    expect(result.written.filter((f) => !f.endsWith('/'))).toHaveLength(0);
  });
});

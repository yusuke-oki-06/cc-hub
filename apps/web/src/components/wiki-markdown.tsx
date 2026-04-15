'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo } from 'react';

interface Props {
  body: string;
  /** called when a [[wikilink]] is clicked — receives the target slug */
  onWikilinkClick?: (target: string) => void;
}

/**
 * Obsidian `[[target]]` / `[[target|alias]]` は markdown-spec 外なので、
 * ReactMarkdown に渡す前に通常の <a> リンクに書き換える。
 * 書き換え後は onWikilinkClick 経由でクライアント側で page 切替する。
 */
function rewriteWikilinks(body: string): string {
  return body.replace(
    /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
    (_m, target: string, alias?: string) => {
      const label = alias ?? target;
      const safeTarget = encodeURIComponent(target.trim());
      return `[${label}](#wiki:${safeTarget})`;
    },
  );
}

export function WikiMarkdown({ body, onWikilinkClick }: Props) {
  const rewritten = useMemo(() => rewriteWikilinks(body), [body]);

  return (
    <div className="prose prose-sm max-w-none font-sans text-[14px] leading-[1.7] text-charcoal">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }) => {
            if (typeof href === 'string' && href.startsWith('#wiki:')) {
              const target = decodeURIComponent(href.slice('#wiki:'.length));
              return (
                <a
                  href="#"
                  className="rounded px-0.5 text-terracotta underline decoration-terracotta/50 hover:bg-sand"
                  onClick={(e) => {
                    e.preventDefault();
                    onWikilinkClick?.(target);
                  }}
                >
                  {children}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="text-terracotta underline" {...rest}>
                {children}
              </a>
            );
          },
          code: ({ children, ...rest }) => (
            <code className="rounded bg-parchment px-1 py-[1px] font-mono text-[12px]" {...rest}>
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-card border border-border-cream bg-parchment p-3 font-mono text-[12px] leading-[1.6] text-charcoal">
              {children}
            </pre>
          ),
        }}
      >
        {rewritten}
      </ReactMarkdown>
    </div>
  );
}

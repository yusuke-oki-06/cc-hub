'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';

// react-force-graph-2d pulls in canvas + d3 which require window, so it must
// be client-only.
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

export interface GraphNode {
  id: string;
  label: string;
  folder: string;
  path: string;
  x?: number;
  y?: number;
}
export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface Props {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick?: (node: GraphNode) => void;
  selectedId?: string | null;
}

// Obsidian-inspired palette: dark background, muted violet accents, subtle
// link gradient. Non-folder-specific nodes get a uniform violet tone just
// like Obsidian's default graph view.
const FOLDER_COLORS: Record<string, string> = {
  root: '#d07b4f',      // warm orange (CLAUDE.md, index.md)
  concepts: '#7a9dd4',  // Obsidian blue
  entities: '#b07cd4',  // Obsidian violet
  queries: '#7ac476',   // soft green
  raw: '#8a8680',       // neutral grey
  '.claude': '#b5a46c',
};
function colorFor(folder: string): string {
  return FOLDER_COLORS[folder] ?? '#8e8e8e';
}

export function WikiGraph({ nodes, links, onNodeClick, selectedId }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 520 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pre-compute degree (in + out) per node so node radius can scale with
  // connection count, matching Obsidian's "hub nodes are bigger" convention.
  const { graphData, degree } = useMemo(() => {
    const d = new Map<string, number>();
    for (const l of links) {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      d.set(s, (d.get(s) ?? 0) + 1);
      d.set(t, (d.get(t) ?? 0) + 1);
    }
    return { graphData: { nodes, links }, degree: d };
  }, [nodes, links]);

  return (
    <div ref={wrapRef} className="h-full w-full overflow-hidden rounded-card" style={{ backgroundColor: '#1e1e20' }}>
      {size.w > 0 && size.h > 0 && (
        <ForceGraph2D
          graphData={graphData}
          width={size.w}
          height={size.h}
          backgroundColor="#1e1e20"
          nodeLabel={(n) => (n as GraphNode).label}
          nodeRelSize={4}
          linkColor={() => 'rgba(200, 200, 220, 0.18)'}
          linkWidth={0.8}
          linkDirectionalArrowLength={0}
          cooldownTime={4000}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          onNodeClick={(node) => onNodeClick?.(node as GraphNode)}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as GraphNode;
            const label = n.label;
            const fontSize = 11 / globalScale;
            const isSelected = selectedId === n.id;
            const deg = degree.get(n.id) ?? 0;
            // Base radius 3; add 0.8 per connection, cap at 10. Selected
            // nodes get a bump so they stand out in the cluster.
            const base = Math.min(10, 3 + deg * 0.8);
            const radius = isSelected ? base + 2 : base;
            const color = colorFor(n.folder);

            // Outer subtle glow for selected node
            if (isSelected) {
              ctx.beginPath();
              ctx.arc(n.x ?? 0, n.y ?? 0, radius + 4, 0, 2 * Math.PI, false);
              ctx.fillStyle = color + '33';
              ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = color;
            ctx.fill();

            // Labels: only draw when zoomed in enough OR selected, to keep
            // the overview uncluttered like Obsidian's graph.
            if (globalScale > 1.1 || isSelected || deg >= 3) {
              ctx.font = `${fontSize}px "Inter", sans-serif`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(230, 230, 240, 0.75)';
              ctx.fillText(label, (n.x ?? 0) + radius + 3, n.y ?? 0);
            }
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const n = node as GraphNode;
            const deg = degree.get(n.id) ?? 0;
            const radius = Math.min(10, 3 + deg * 0.8) + 3;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, radius, 0, 2 * Math.PI, false);
            ctx.fill();
          }}
        />
      )}
    </div>
  );
}

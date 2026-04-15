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

const FOLDER_COLORS: Record<string, string> = {
  root: '#c17a4a',       // terracotta
  concepts: '#5c8cb7',   // blue
  entities: '#9d6aae',   // purple
  queries: '#7ca05a',    // green
  raw: '#9e958c',        // gray
  '.claude': '#b5a46c',  // sand
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

  const graphData = useMemo(() => ({ nodes, links }), [nodes, links]);

  return (
    <div ref={wrapRef} className="h-full w-full">
      {size.w > 0 && size.h > 0 && (
        <ForceGraph2D
          graphData={graphData}
          width={size.w}
          height={size.h}
          backgroundColor="#faf9f5"
          nodeLabel={(n) => (n as GraphNode).label}
          nodeRelSize={4}
          linkColor={() => 'rgba(150, 140, 125, 0.4)'}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={0.9}
          cooldownTime={3000}
          onNodeClick={(node) => onNodeClick?.(node as GraphNode)}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as GraphNode;
            const label = n.label;
            const fontSize = 12 / globalScale;
            const isSelected = selectedId === n.id;
            const radius = isSelected ? 7 : 5;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = colorFor(n.folder);
            ctx.fill();
            if (isSelected) {
              ctx.strokeStyle = '#3a2a1e';
              ctx.lineWidth = 2 / globalScale;
              ctx.stroke();
            }
            ctx.font = `${fontSize}px "Inter", sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#3a2a1e';
            ctx.fillText(label, (n.x ?? 0) + radius + 3, n.y ?? 0);
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const n = node as GraphNode;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, 8, 0, 2 * Math.PI, false);
            ctx.fill();
          }}
        />
      )}
    </div>
  );
}

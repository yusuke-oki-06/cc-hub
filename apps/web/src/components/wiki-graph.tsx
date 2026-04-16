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

// Obsidian-style physics parameters. User can adjust live.
interface GraphSettings {
  /** ノード間の反発力 (負の値が強い反発)。Obsidian の "Repel force" 相当 */
  repel: number;
  /** リンクの自然長。Obsidian の "Link force" 相当 */
  linkDistance: number;
  /** 中心への求心力 (0 = なし)。Obsidian の "Center force" 相当 */
  centerStrength: number;
  /** ノード半径スケール */
  nodeSize: number;
  /** ラベル表示の感度 (ズーム閾値) */
  labelZoomThreshold: number;
}

const DEFAULT_SETTINGS: GraphSettings = {
  repel: -120,
  linkDistance: 60,
  centerStrength: 0.05,
  nodeSize: 1.0,
  labelZoomThreshold: 1.1,
};

const STORAGE_KEY = 'cc-hub-wiki-graph-settings';

export function WikiGraph({ nodes, links, onNodeClick, selectedId }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<unknown>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 520 });
  const [settings, setSettings] = useState<GraphSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch { /* noop */ }
    return DEFAULT_SETTINGS;
  });
  const [panelOpen, setPanelOpen] = useState(false);

  // 設定を localStorage に永続化
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch { /* noop */ }
  }, [settings]);

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

  // settings が変わるたびに d3-force パラメータを更新して再シミュレーション
  useEffect(() => {
    const fg = fgRef.current as {
      d3Force?: (name: string) => { strength?: (v: number) => void; distance?: (v: number) => void } | undefined;
      d3ReheatSimulation?: () => void;
    } | null;
    if (!fg || !fg.d3Force) return;
    const charge = fg.d3Force('charge');
    if (charge && charge.strength) charge.strength(settings.repel);
    const link = fg.d3Force('link');
    if (link && link.distance) link.distance(settings.linkDistance);
    const center = fg.d3Force('center');
    if (center && center.strength) center.strength(settings.centerStrength);
    if (fg.d3ReheatSimulation) fg.d3ReheatSimulation();
  }, [settings.repel, settings.linkDistance, settings.centerStrength]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden rounded-card" style={{ backgroundColor: '#1e1e20' }}>
      {/* 物理パラメータ調整パネル */}
      <SettingsPanel
        open={panelOpen}
        onToggle={() => setPanelOpen((v) => !v)}
        settings={settings}
        onChange={setSettings}
        onReset={() => setSettings(DEFAULT_SETTINGS)}
      />

      {size.w > 0 && size.h > 0 && (
        <ForceGraph2D
          ref={fgRef as never}
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
            const base = Math.min(10, 3 + deg * 0.8) * settings.nodeSize;
            const radius = isSelected ? base + 2 : base;
            const color = colorFor(n.folder);

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

            if (globalScale > settings.labelZoomThreshold || isSelected || deg >= 3) {
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
            const radius = Math.min(10, 3 + deg * 0.8) * settings.nodeSize + 3;
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

function SettingsPanel({
  open,
  onToggle,
  settings,
  onChange,
  onReset,
}: {
  open: boolean;
  onToggle: () => void;
  settings: GraphSettings;
  onChange: (s: GraphSettings) => void;
  onReset: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 font-sans text-[12px] text-white/80 backdrop-blur-sm hover:bg-black/60"
        aria-label="グラフ設定"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span>{open ? '閉じる' : '設定'}</span>
      </button>

      {open && (
        <div className="absolute right-3 top-14 z-10 w-72 space-y-4 rounded-card border border-white/10 bg-[#26262a]/95 p-4 text-white/85 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <h4 className="font-sans text-[12px] font-medium uppercase tracking-[0.5px] text-white/60">
              グラフの物理
            </h4>
            <button
              type="button"
              onClick={onReset}
              className="font-sans text-[11px] text-white/50 hover:text-white"
            >
              リセット
            </button>
          </div>

          <Slider
            label="反発力"
            hint="ノード同士の離れ具合"
            value={-settings.repel}
            min={0}
            max={500}
            step={10}
            onChange={(v) => onChange({ ...settings, repel: -v })}
          />
          <Slider
            label="リンク距離"
            hint="リンクの自然な長さ"
            value={settings.linkDistance}
            min={10}
            max={300}
            step={5}
            onChange={(v) => onChange({ ...settings, linkDistance: v })}
          />
          <Slider
            label="中心への求心力"
            hint="ノードが中心に寄る強さ"
            value={settings.centerStrength}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onChange({ ...settings, centerStrength: v })}
          />
          <Slider
            label="ノードサイズ"
            hint="円の大きさ倍率"
            value={settings.nodeSize}
            min={0.5}
            max={2.5}
            step={0.1}
            onChange={(v) => onChange({ ...settings, nodeSize: v })}
          />
          <Slider
            label="ラベル表示の閾値"
            hint="小さいとラベルが見える"
            value={settings.labelZoomThreshold}
            min={0}
            max={3}
            step={0.1}
            onChange={(v) => onChange({ ...settings, labelZoomThreshold: v })}
          />
        </div>
      )}
    </>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-sans text-[12px] text-white/80">{label}</span>
        <span className="font-mono text-[11px] text-white/50">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#c96442]"
      />
      {hint && <div className="mt-0.5 font-sans text-[10px] text-white/40">{hint}</div>}
    </label>
  );
}

'use client';
import { useEffect, useRef } from 'react';
import type { SseEvent } from '@cc-hub/shared';

let Terminal: typeof import('@xterm/xterm').Terminal | null = null;
let FitAddon: typeof import('@xterm/addon-fit').FitAddon | null = null;

async function loadXterm() {
  if (Terminal) return;
  const [xtermMod, fitMod] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ]);
  Terminal = xtermMod.Terminal;
  FitAddon = fitMod.FitAddon;
}

interface Props {
  events: SseEvent[];
  className?: string;
}

export function TerminalView({ events, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<InstanceType<typeof import('@xterm/xterm').Terminal> | null>(null);
  const fitRef = useRef<InstanceType<typeof import('@xterm/addon-fit').FitAddon> | null>(null);
  const writtenSeqRef = useRef(0);

  useEffect(() => {
    let alive = true;
    void loadXterm().then(() => {
      if (!alive || !containerRef.current || !Terminal || !FitAddon) return;
      if (termRef.current) return;

      const fit = new FitAddon();
      const term = new Terminal({
        cursorBlink: false,
        disableStdin: true,
        fontSize: 14,
        fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
        lineHeight: 1.4,
        scrollback: 10000,
        convertEol: true,
        theme: {
          background: '#faf5ed',
          foreground: '#3d3225',
          cursor: '#c96442',
          selectionBackground: 'rgba(201, 100, 66, 0.3)',
          black: '#3d3225',
          red: '#c96442',
          green: '#7a9a3a',
          yellow: '#d4a017',
          blue: '#2f6fbf',
          magenta: '#a06090',
          cyan: '#4a8a8a',
          white: '#f5f0e6',
          brightBlack: '#8a7f6a',
          brightRed: '#e07050',
          brightGreen: '#8ab050',
          brightYellow: '#e0b84c',
          brightBlue: '#4a8adf',
          brightMagenta: '#c080b0',
          brightCyan: '#60a0a0',
          brightWhite: '#faf5ed',
        },
      });
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();
      termRef.current = term;
      fitRef.current = fit;
    });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver(() => fitRef.current?.fit());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    for (const ev of events) {
      if (ev.seq <= writtenSeqRef.current) continue;
      writtenSeqRef.current = ev.seq;
      if (ev.type === 'terminal.data') {
        const payload = ev.payload as { data?: string } | null;
        if (typeof payload?.data === 'string') {
          const bytes = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0));
          term.write(bytes);
        }
      }
    }
  }, [events]);

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@6.0.0/css/xterm.min.css" />
      <div ref={containerRef} className={className ?? 'h-full w-full'} />
    </>
  );
}

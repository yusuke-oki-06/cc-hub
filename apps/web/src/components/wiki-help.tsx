'use client';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'cc-hub-wiki-help-open';

export function WikiHelp() {
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      setOpen(v === null ? true : v === '1');
    } catch {
      setOpen(true);
    }
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // noop
    }
  };

  if (open === null) return null;

  return (
    <div className="rounded-[16px] border border-border-cream bg-ivory">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="font-sans text-[13px] font-medium text-near">
          Wiki の使い方
        </span>
        <span className="font-sans text-[11px] text-stone">{open ? '隠す ▾' : '開く ▸'}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border-cream px-4 py-3 font-sans text-[13px] leading-[1.6] text-charcoal">
          <p>
            ここは <b>Obsidian vault</b> を直接 bind-mount した LLM Wiki です。vault は同じ
            フォルダを Obsidian アプリでも開けるので、Wiki 側の編集と手動編集が共存します。
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <Step
              title="1. Source を置く"
              body="Obsidian Web Clipper で記事を clip すると raw/ にファイルが増えます。手動で raw/*.md を置いてもOK。"
            />
            <Step
              title="2. 初期化 (初回のみ)"
              body="空 vault なら下の「初期化」ボタンで CLAUDE.md / index.md / log.md / skills をシードします。既に入っていればスキップ。"
            />
            <Step
              title="3. raw を取り込む"
              body="「raw を取り込む」で wiki-ingest skill を起動。Claude が要点抽出 → concepts/ entities/ に structured page を書き、index と log を更新します。"
            />
            <Step
              title="4. 質問・lint"
              body="「質問する」で index から citation 付き回答。「lint」で broken link / orphan / 矛盾をレポート。"
            />
          </div>
          <p className="text-[12px] text-stone">
            実行すると Claude セッションが起動し、タスク画面に遷移して進行をリアルタイムに見られます。
            完了後にこの画面に戻ると、グラフとファイルツリーが増えているはずです。
          </p>
        </div>
      )}
    </div>
  );
}

function Step({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-border-cream bg-parchment/40 px-3 py-2">
      <div className="font-sans text-[12px] font-medium text-near">{title}</div>
      <div className="mt-1 font-sans text-[12px] text-olive leading-[1.55]">{body}</div>
    </div>
  );
}

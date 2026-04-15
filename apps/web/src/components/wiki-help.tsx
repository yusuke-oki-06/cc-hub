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
            あなた専用の Wiki です。気になる資料を放り込むと、Claude が要点を抜き出して整理し、
            関連する話題を自動でリンクしてくれます。後から「あの話どこだっけ」と探す手間が減ります。
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <Step
              title="1. 生データを集める"
              body="Obsidian Web Clipper で記事を保存すると自動で溜まります。手元の PDF やメモを raw/ に直接置いても OK。"
            />
            <Step
              title="2. 準備する (初回だけ)"
              body="「準備する」ボタンで Claude が使う整理用の枠組みを作ります。すでにあれば何もしません。"
            />
            <Step
              title="3. 生データを整理"
              body="「生データを整理」で Claude が集めた生データを読み、人物・概念・話題ごとのページに要点を整理します。"
            />
            <Step
              title="4. 質問する"
              body="「質問する」で Wiki の内容について自然文で問い合わせ。出典ページ付きで回答します。"
            />
            <Step
              title="5. 点検する"
              body="「点検する」で、どこからも参照されていないページ / リンク切れ / 古くなった情報 / 矛盾候補を一覧レポート (変更はしません)。"
            />
            <Step
              title="6. 矛盾を修復"
              body="「矛盾を修復」で、食い違うページを Claude が比較し、新しい出典を優先して自動で書き直します。差分は log.md に残るので、何が変わったか後から確認・巻き戻しできます。"
            />
          </div>
          <p className="text-[12px] text-stone">
            ボタンを押すと Claude のチャット画面に移動し、作業をリアルタイムに見られます。
            終わってこの画面に戻ると、ページとグラフが増えています。
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

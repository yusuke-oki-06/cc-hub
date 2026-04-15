'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, withTimeout } from '@/lib/api';
import { Button } from '@/components/ui/button';

const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000100';

interface Props {
  disabled?: boolean;
}

const PRESETS: Array<{ label: string; title: string; prompt: string }> = [
  {
    label: '準備する',
    title: '空のフォルダに Claude が整理するための枠組みをシード (初回のみ)',
    prompt:
      '/workspace/wiki/ を見てください。空ならば CLAUDE.md / index.md / log.md / concepts/ / entities/ / queries/ の骨組みを作ってください。既にあればスキップして、その旨を報告してください。',
  },
  {
    label: '生データを整理',
    title: 'raw/ の未取り込みファイルを読んで人物・概念・話題ごとにページ化',
    prompt:
      '/workspace/wiki/CLAUDE.md を読んで運用ルールを把握した上で、.claude/skills/wiki-ingest/SKILL.md に従い raw/ 以下で index.md に未登録のファイルを順に ingest してください。各 source につき concepts/ または entities/ を書き、index.md と log.md を更新してください。',
  },
  {
    label: '質問する',
    title: 'Wiki を参照して出典付きで回答。価値ある答えは queries/ に保存',
    prompt:
      '/workspace/wiki/CLAUDE.md を読んだ上で、.claude/skills/wiki-query/SKILL.md に従って次の質問に答えてください: ',
  },
  {
    label: '点検する',
    title: 'リンク切れ / 迷子ページ / 古い情報 / 矛盾候補をレポートのみ (変更しない)',
    prompt:
      '/workspace/wiki/ に対して .claude/skills/wiki-lint/SKILL.md の手順で lint を実行してください。ページは一切変更せず、レポートだけを log.md に追記してください。',
  },
  {
    label: '矛盾を修復',
    title: '食い違うページを自動で書き直し。差分は log.md に記録',
    prompt:
      '/workspace/wiki/CLAUDE.md の Lint ルールに沿って全ページをスキャンし、以下の矛盾を検出してください:\n- 同一 entity / concept で A と ¬A の記述が並存\n- frontmatter の sources / updated が食い違う\n\n検出したら:\n1. frontmatter の sources と log.md から**より新しい source** を特定\n2. 新しい側の記述を正として、古い側は「(YYYY-MM-DD 更新で置換)」を注記しつつ Edit で書き直す\n3. 両ページに updated フィールドを付与\n4. log.md に `## [YYYY-MM-DD] reconcile | <page>` エントリを追加 (何を何に置き換えたかを記録)\n\n自信がない (新旧が判断できない、情報が不足) 案件は**修復せず** log.md にレポートだけ残し、ユーザーに確認を促してください。',
  },
];

export function WikiComposer({ disabled }: Props) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (payload: string) => {
    setError(null);
    setBusy(true);
    try {
      const created = await api<{ sessionId: string; taskId: string }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          profileId: 'default',
          prompt: payload,
          projectId: DEFAULT_PROJECT_ID,
        }),
      });
      await withTimeout(
        api(`/api/sessions/${created.sessionId}/claude/start`, {
          method: 'POST',
          body: JSON.stringify({}),
        }),
        120_000,
        'Claude 起動',
      );
      router.push(`/tasks/${created.taskId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const sendFree = () => {
    const t = text.trim();
    if (!t) return;
    void submit(t);
  };

  const sendPreset = (preset: (typeof PRESETS)[number]) => {
    if (preset.label === '質問する') {
      const q = text.trim() || '(Wiki の大枠を要約してください)';
      void submit(preset.prompt + q);
    } else {
      void submit(preset.prompt);
    }
  };

  return (
    <div className="rounded-[20px] border border-border-warm bg-ivory shadow-whisper theme-airbnb-composer">
      <textarea
        rows={2}
        disabled={disabled || busy}
        className="block w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1 font-sans text-[14px] leading-[1.55] text-near placeholder:text-stone focus:outline-none"
        placeholder="Wiki に依頼 / 質問を入力… (プリセットだけで送ることもできます)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            sendFree();
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-cream bg-parchment/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              title={p.title}
              disabled={disabled || busy}
              onClick={() => sendPreset(p)}
              className="rounded-full border border-border-cream bg-white px-2.5 py-[3px] font-sans text-[12px] text-charcoal transition hover:bg-sand disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={sendFree} disabled={disabled || busy || !text.trim()}>
          {busy ? '送信中…' : '送信 (⌘Enter)'}
        </Button>
      </div>
      {error && (
        <div className="border-t border-[#e0a9a9] bg-[#fbeaea] px-3 py-2 font-sans text-[12px] text-error-crimson">
          {error}
        </div>
      )}
    </div>
  );
}

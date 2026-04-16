-- AskUserQuestion をデフォルトプロファイルの許可ツールに追加する。
-- Claude がこのツールを呼べるようになると、テキストで質問を書くのではなく
-- 構造化された選択肢 (cc-hub 側でモーダル UI になる) を使うようになる。

UPDATE profiles
SET config = jsonb_set(
  config,
  '{allowedTools}',
  (config->'allowedTools') || '["AskUserQuestion"]'::jsonb
)
WHERE id = 'default'
  AND NOT (config->'allowedTools' @> '"AskUserQuestion"'::jsonb);

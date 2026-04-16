-- AskUserQuestion + ToolSearch をデフォルトプロファイルの許可ツールに追加する。
-- ToolSearch がないと Claude は AskUserQuestion のスキーマを取得できず、
-- テキストで質問を書くフォールバックに入る。

UPDATE profiles
SET config = jsonb_set(
  config,
  '{allowedTools}',
  (config->'allowedTools') || '["AskUserQuestion","ToolSearch"]'::jsonb
)
WHERE id = 'default'
  AND NOT (config->'allowedTools' @> '"ToolSearch"'::jsonb);

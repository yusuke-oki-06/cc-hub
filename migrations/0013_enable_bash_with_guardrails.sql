-- Bash を開発用途で安全に許可する:
-- 1. allowedTools に Bash を追加
-- 2. bashAllowlist に安全なコマンドセットを設定
-- 3. denyPipes=true, denyRedirects=true は維持 (init migration で設定済み)
--
-- guardrails の checkBashCommand が pre-tool-use フックで以下をブロック:
--   - allowlist 外のコマンド (curl, wget, ssh, nc 等)
--   - 環境変数展開 ($VAR)
--   - シェルラッパー (sh, bash)
--   - コマンド置換 (`...`, $())
--   - base64 decode
--   - パイプ/チェーン (|, &&, ;)

-- Step 1: Bash を allowedTools に追加
UPDATE profiles
SET config = jsonb_set(
  config,
  '{allowedTools}',
  (config->'allowedTools') || '["Bash"]'::jsonb
)
WHERE id = 'default'
  AND NOT (config->'allowedTools' @> '"Bash"'::jsonb);

-- Step 2: bashAllowlist を開発向けの安全なコマンドセットに更新
UPDATE profiles
SET config = jsonb_set(
  config,
  '{bashAllowlist}',
  '["ls","find","wc","head","tail","diff","sort","uniq","grep","cat","echo","mkdir","cp","mv","rm","chmod","touch","git","node","npx","npm","pnpm","python","python3","pip","tsc","prettier","eslint"]'::jsonb
)
WHERE id = 'default';

# Log

時系列で Wiki に起きたことを追記していきます (ingest / query / lint)。エントリ先頭は `## [YYYY-MM-DD] <op> | <title>` の形式で書いてください (grep しやすくするため)。

## [{{INIT_DATE}}] init | Wiki 初期化

- `CLAUDE.md` (LLM Wiki 運用指示) をインストール
- `index.md` (空カタログ) を作成
- `log.md` (このファイル) を作成
- `raw/` `concepts/` `entities/` `queries/` フォルダを用意
- `.claude/skills/wiki-ingest` / `wiki-query` / `wiki-lint` を配置

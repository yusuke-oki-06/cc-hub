# ADR 0005: Repo ingestion = zip upload + Git URL の 2 系統

- **Date**: 2026-04-15
- **Status**: Accepted
- **Phase**: 1

## Context

想定利用者には非エンジニアも多い。エンジニアは Git URL 入力が自然だが、非エンジニアや
「特定バージョンのスナップショットを解析してほしい」ケースでは zip upload が直感的。

## Decision

両方サポート。WebUI から選択:

### 1. Zip / Tar Upload
- WebUI で drag-and-drop or ファイル選択
- サイズ上限 100MB (設定で変更可)
- 拡張子 allowlist: `.zip`, `.tar`, `.tar.gz`
- 受信は multer + in-memory stream、展開は sandbox container 内で実施
- `.git/` 含む zip ならそのまま git 履歴利用可、含まない場合はコンテナ内で `git init` + initial commit
- 解凍前に zip bomb 対策 (展開後サイズ上限、ファイル数上限 10,000, パス traversal 検出)

### 2. Git URL Clone
- HTTPS のみ許可 (ssh は Phase 2 で検討)
- Personal Access Token (PAT) を WebUI で optional 入力 (private repo 用)
- PAT は Runner メモリ内のみ、DB に保存しない。container 作成時に環境変数で注入、セッション終了で消える
- shallow clone (`--depth=1`) で転送量抑制 (将来オプションで履歴持込可)

## Consequences

### Positive
- 非エンジニアにも取っつきやすい UX
- 社内 GitHub Enterprise の private repo も PAT 入力で対応可
- ローカルに git 環境のない社員でも作業可

### Negative
- zip bomb / 大容量 / 不正パスのバリデーションが必要 (実装/テスト工数)
- PAT のライフサイクル管理 (DB 保存禁止、メモリのみ)
- Git URL の validation (ssh:// / file:// / git@ は reject)

## 実装

- `apps/runner/src/ingest/zip.ts` — multer receiver + zip 展開 + 検証
- `apps/runner/src/ingest/git.ts` — HTTPS URL 検証 + shallow clone in container
- `apps/web/app/tasks/new/page.tsx` — タブ切替 UI (zip / git)
- validation: `@cc-hub/shared/ingest.ts` に zod schema

## References

- 2026-04-15 ユーザー要件: 非エンジニア利用想定、ローカル端末暗号化のためアップロード方式に

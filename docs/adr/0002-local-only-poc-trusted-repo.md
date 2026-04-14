# ADR 0002: Phase 1 も container-sandboxed, zero-trust workspace で実行

- **Date**: 2026-04-15 (改訂、旧版「host-native / trusted repo only」を置換)
- **Status**: Accepted
- **Phase**: 1

## Context

当初 Phase 1 は「ホストで child_process + git worktree、trusted repo のみ」と設計していたが、以下の制約が判明:

1. 社内端末はローカルファイルが暗号化されるため、ホスト上に作業ファイルを置けない
2. 利用者は非エンジニアも多く、ローカルリポジトリを git clone して用意できない
3. Codex 指摘: host-native runner は「隔離」ではなく「作業ディレクトリ分離」に過ぎない

## Decision

**Phase 1 から session = Docker container** で隔離する。ホスト上には作業ファイルを残さない。

- セッション作成時に新規コンテナを起動、終了時に破棄
- ユーザーの `~/.claude/.credentials.json` を container に read-only bind mount (サブスクリプション利用)
- repo の持ち込みは (a) WebUI からの zip/tar アップロード + (b) Git URL 入力の 2 系統
- workspace は container 内 `/workspace` のみ。host からは直接見えない
- Claude Code CLI は container 内で `claude -p --output-format=stream-json ...` として起動
- Runner は stdout/stderr を dockerode 経由で stream 受信

## Consequences

### Positive
- Linux kernel namespaces/cgroups による実効的な隔離 → untrusted repo も受け入れ可能
- ホスト端末の暗号化ポリシーに抵触しない (作業ファイルは container の tmpfs ボリューム)
- 社員非エンジニアが WebUI でドラッグ&ドロップするだけで使える UX
- Phase 2 の社内展開時もコンテナ設計を流用できる (スケジューラを K8s に替えるだけ)

### Negative
- Docker Desktop (Phase 1 は WSL2 backend) 必須 → 社内配布で Docker セットアップが追加タスクに
- コンテナ起動のコールドスタート (2〜5 秒)。UX 改善のため warm pool 化は将来課題
- Windows → Linux container の credentials mount 経路は Docker Desktop に依存
- Runner 実装が child_process → dockerode になり、若干複雑化

## 実装変更点

- `packages/guardrails/src/workspace-provider.ts` に `DockerWorkspaceProvider` を追加
- `apps/runner/src/claude/driver.ts` を dockerode ベースに置き換え
- `infra/sandbox/Dockerfile` を新規追加 (node:20-bookworm + `@anthropic-ai/claude-code` + git)
- `apps/runner/src/ingest/zip.ts` / `git.ts` を追加 (アップロード・クローン)
- ADR 0005 (repo ingestion), ADR 0006 (PoC egress policy) を別途

## References

- Codex レビュー (2026-04-14)
- 社内端末暗号化ポリシーの制約 (ユーザー要件 2026-04-15)

# ADR 0002: Phase 1 は localhost + trusted repo 限定

- **Date**: 2026-04-14
- **Status**: Accepted
- **Phase**: 1

## Context

Phase 1 の Runner は Windows ホスト上で `child_process` + `git worktree` でセッションを分離する設計。
しかしこれは「隔離」ではなく「作業ディレクトリ分離」に過ぎず、許可された Read/Bash/Write の組み合わせで:

- ホスト側の資格情報 (`~/.ssh`, `~/.aws`, `.claude/.credentials.json`)
- Git 設定 (`core.hooksPath`, `includeIf`, `.gitattributes` filter)
- 親プロセス環境変数
- junction/symlink 経由の外部パス参照
- PowerShell/cmd 迂回

などでガードレールを回避できる可能性がある。

## Decision

**Phase 1 では以下を前提とする**:

1. **Trusted repo only** — 自分のリポジトリ (自分が書いた/レビューした) のみを対象。untrusted OSS の解析等は対象外
2. **Localhost only** — 外部ネットワーク公開しない (Cloudflare Tunnel 等も使わない)
3. **Single user** — 本人のみ利用 (DB schema は multi-user でも、運用は単一)

untrusted コードを扱いたい / 他人に使わせたい場合は **Phase 2 で disposable container/VM 隔離に移行**する。
これを計画時点で明記することで、Phase 1 のガードレール実装をシンプルに保つ。

## Consequences

### Positive
- Phase 1 のガードレールは「悪意ある入力」への耐性より「自分のミス防止」「コスト暴走防止」「監査ログ」にフォーカスでき、スコープが明確
- 実装コストが下がる (sandbox や namespace 分離が不要)

### Negative
- Phase 2 で container/VM 化する際、WorkspaceProvider 抽象を通じて実装差し替えが必要 (ADR 0003 参照)
- 本 PoC の結果だけでは「社内配布しても安全か」の最終判断はできない → Phase 2 の移行 ADR で再評価

## References

- Codex レビュー指摘 (2026-04-14): "host-native runner は隔離ではなく作業ディレクトリ分離に過ぎない"
- ADR 0003 (WorkspaceProvider 抽象)

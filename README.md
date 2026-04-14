# CC Hub — Claude Code 社内配布プラットフォーム

**Status**: Phase 1 (一人 PoC / localhost only / trusted repo only)

Claude Agent SDK を中核に、WebUI から並列マルチタスクで Claude Code を駆動し、
ガードレール (ツール制限 / Bash allowlist / 監査ログ / コスト上限) と観測性 (Langfuse セルフホスト)
を事前検証するためのプラットフォーム。

## アーキテクチャ

```
WebUI (Next.js, :3000)  ─SSE─▶  Runner (Hono + Agent SDK, :4000)
        │                               │
        ▼                               ▼
  Runner DB (Postgres)         Langfuse (:3100, self-hosted)
```

## ドキュメント

- 計画書: `C:\Users\koori\.claude\plans\toasty-plotting-prism.md`
- ADR: `docs/adr/`
- Threat Model: `docs/THREAT-MODEL.md`
- Security notes: `docs/SECURITY.md`
- Phase 2 移行: `docs/PHASE2-MIGRATION.md`

## 設計原則 (Phase 1)

1. **Trusted repo only** — host-native runner は隔離ではない。untrusted コード実行は Phase 2 のコンテナ化前提
2. **Multi-user schema from day 1** — Phase 1 は単一ユーザーでも DB/API は multi-user 前提
3. **Event log first** — イベントは append-only で永続化、SSE は派生ビュー
4. **Workspace provider abstraction** — worktree 前提でなくインターフェース化、Phase 2 で差し替え
5. **Security foundation early** — ガードレールを UI より先に入れる (M3)

## ライセンス

Private / internal use only (Phase 1 の範囲では公開予定なし)

# ADR 0001: Runner 実装に Claude Code CLI ベースを採用 (Agent SDK は不採用)

- **Date**: 2026-04-14
- **Status**: **Superseded in part by ADR 0004 (2026-04-15)** — Phase 1 はサブスク利用のため `claude` CLI の subprocess 起動に切り替え
- **Phase**: 1

## Context

Claude Code を展開する際、バックエンドで Claude Code を駆動する「Runner」の選択肢は主に2つ:

1. **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) — Anthropic 公式、TypeScript/Python
2. **ericvtheg/claude-code-runner** — OSS の self-host runner (HTML ダッシュボード + Docker)

両者は「Claude Code をプログラムから駆動する」という点で同じカテゴリだが、
コントロール面 (権限・承認・監査・並列) で大きく異なる。

## Decision

**Claude Code CLI (`claude -p --output-format=stream-json`) を subprocess として起動する方式を採用**し、
Hono で HTTP サーバを自前実装する。claude-code-runner のコードは採用せず、credentials マウントの
アイデアと UI/UX のみ参考にする。

Claude Agent SDK (TypeScript) は Phase 1 では **不採用**。理由:
- Agent SDK は公式には API キー前提 (ANTHROPIC_API_KEY / Bedrock / Vertex / Azure)
- 本人の既存 Claude Max サブスクを流用するためには CLI 直接起動が必要
- 詳細は ADR 0004 を参照

Phase 2 で API キー経路に戻す際は、同じ stream-json イベントモデルの上で SDK に差し替え可能な
抽象 (`ClaudeDriver` インターフェース) を `apps/runner/src/claude/` に置く。

## 比較

| 観点 | Claude Agent SDK | claude-code-runner |
|---|---|---|
| ストリーム忠実性 | `query()` が全イベント (tool_use, permission_request, AskUserQuestion, parent_tool_use_id) を async iterable で返す | HTTP ログ tail ベース、permission/AskUserQuestion を構造化して伝える設計なし |
| 権限制御 | `allowedTools` / `disallowedTools` / `canUseTool` / hooks (Pre/Post/UserPrompt/Session) | profile 制御なし |
| 監査フック | hooks で直接 emit 可 | ダッシュボードログ止まり |
| 認証モデル | API キー (Anthropic/Bedrock/Vertex/Azure Foundry) | Claude Code サブスクセッション流用 + JSON auth、社内配布 RBAC と相性悪 |
| 並列セッション | session ID + resume + subagent 折り畳み | コンテナ単位、複数ホスト運用はスコープ外 |
| MCP | `mcpServers` option で統合 | `.mcp.json` をリポ側で参照のみ |
| 想定 | プロダクション自動化・カスタム UI | 個人/小規模ホビー |

## Consequences

### Positive
- 「承認 UI 忠実表示」「ツール allowlist」「監査ログ」「多人数運用」の全要件を SDK が直接サポート
- TypeScript で WebUI と型共有可能 (`packages/shared` で zod schema)
- Phase 2 の Bedrock/Vertex 切替も環境変数のみ

### Negative
- HTTP サーバ・セッション管理・並列制御は自前実装が必要 (claude-code-runner のダッシュボードは使えない)
- Anthropic Console の API キー請求経路に依存 (Bedrock 等で分散可)

## References

- https://docs.claude.com/en/docs/agent-sdk/overview
- https://github.com/ericvtheg/claude-code-runner
- 計画書 `C:\Users\koori\.claude\plans\toasty-plotting-prism.md`

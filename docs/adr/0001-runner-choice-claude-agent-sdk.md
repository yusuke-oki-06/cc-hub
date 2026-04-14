# ADR 0001: Runner に Claude Agent SDK を採用

- **Date**: 2026-04-14
- **Status**: Accepted
- **Phase**: 1

## Context

Claude Code を社内配布する際、バックエンドで Claude Code を駆動する「Runner」の選択肢は主に2つ:

1. **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) — Anthropic 公式、TypeScript/Python
2. **ericvtheg/claude-code-runner** — OSS の self-host runner (HTML ダッシュボード + Docker)

両者は「Claude Code をプログラムから駆動する」という点で同じカテゴリだが、
コントロール面 (権限・承認・監査・並列) で大きく異なる。

## Decision

**Claude Agent SDK (TypeScript) を採用**し、Hono で HTTP サーバを自前実装する。
claude-code-runner のコードは採用せず、UI/UX のアイデアのみ参考にする。

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

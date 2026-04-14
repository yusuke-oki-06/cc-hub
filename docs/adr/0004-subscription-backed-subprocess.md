# ADR 0004: Claude Code CLI を subprocess で起動し、サブスクリプション認証を流用

- **Date**: 2026-04-15
- **Status**: Accepted (ADR 0001 を部分的に差し替え)
- **Phase**: 1

## Context

Phase 1 は本人 1 人で動かす PoC。Anthropic API キーで per-token 課金するより、既にある
**Claude Max サブスクリプション** の範囲で動かしたい。

Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) は内部で Claude Code CLI を spawn するが、
公式ドキュメントは `ANTHROPIC_API_KEY` / Bedrock / Vertex / Azure Foundry を前提としており、
サブスクリプション認証 (`~/.claude/.credentials.json`) の利用は明示サポートされていない。

一方、`claude` CLI 自体は `claude login` でサブスクリプション認証を行い、
`claude -p --output-format=stream-json --input-format=stream-json` で Agent SDK と
等価なイベントストリームを標準入出力経由で得られる。

## Decision

**Runner は `@anthropic-ai/claude-agent-sdk` を使わず、`claude` CLI を直接 subprocess として起動する。**

- 起動: `spawn('claude', ['-p', '--output-format=stream-json', '--input-format=stream-json', ...])`
- 認証: ホストの `~/.claude/.credentials.json` を使用 (ユーザーが `claude login` 済み)
- イベント取得: stdout を 1 行 1 JSON でパース → event bus に publish
- 応答送信: stdin に JSON 行を書く (permission response, ユーザー追加プロンプト)
- ガードレール: 対象 worktree ごとに `.claude/settings.json` を生成し、Runner が提供する
  hook エンドポイント (localhost) を `PreToolUse` / `PostToolUse` で呼ぶ
- 権限承認: stream-json の `permission_request` イベントを WebUI に転送 → 承認 → stdin で回答

## Trade-offs

### Gain
- **per-token 課金ゼロ** (Claude Max のレート枠内で使う限り)
- 既存 `~/.claude/skills`, `.claude/settings.json`, MCP 設定がそのまま使える
- Bedrock/Vertex 依存の切替不要

### Lose
- 型安全性は自前 (zod schema を `packages/shared/src/claude-events.ts` に用意)
- Agent SDK の `canUseTool` callback は使えない → stream-json + stdin で自前実装
- **Phase 2 の 100 人規模では非現実的** (サブスクは個人/小規模用、商用配布は ToS 違反の可能性)。
  Phase 2 移行時は API キー + Bedrock/Vertex 方式に戻す前提 → `PHASE2-MIGRATION.md` に記載
- Claude Code CLI のバージョン/出力フォーマット変更に引きずられる
- Anthropic ToS: 社内利用は OK、外部プロダクト提供は NG (Phase 2 で要再評価)

## Consequences

### `apps/runner` の変更
- `@anthropic-ai/claude-agent-sdk` を package.json から削除
- `src/claude/driver.ts` に subprocess 起動・stdin/stdout 管理
- `src/claude/stream-parser.ts` に stream-json パーサ (zod 検証)
- `src/claude/permission-bridge.ts` に permission_request → HITL 橋渡し
- `src/claude/settings-injector.ts` に `.claude/settings.json` 自動生成

### ガードレールの配置
- `packages/guardrails` のロジックは変わらず
- Runner 内に `localhost:<port>/internal/hooks/pre-tool-use` 等のエンドポイントを立て、
  worktree 側 `.claude/settings.json` がこれを curl で呼ぶ
- hook が exit 1 or stdout に `{ "permissionDecision": "deny" }` を返せば Claude 側は block

### 認証情報の扱い
- `~/.claude/.credentials.json` は Runner プロセス起動時に**環境変数や引数に流さない**
  (子プロセスが自力で読む)
- secret-redactor に Claude credentials 検出パターンを追加

## References

- Claude Code CLI: `claude --help` / `claude -p --help`
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Anthropic Commercial Terms: subscription の社内利用可否
- ericvtheg/claude-code-runner: credentials マウント方式の先行事例 (コードは不採用、アイデアのみ参考)

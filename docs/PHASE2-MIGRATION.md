# Phase 2 Migration Plan (社内配布)

**Status**: Draft (Phase 1 完了後に具体化)
**Target**: 〜100 人規模の社内配布

Phase 1 で実証した設計をベースに、以下を段階的に導入する。

---

## ルート原則

1. **Phase 1 で決めた抽象境界を壊さない** — `WorkspaceProvider` / `ClaudeDriver` / `EventBus` / `GuardrailHook` はインターフェースのまま実装差し替え
2. **段階リリース** — まず 5 人 → 20 人 → 100 人
3. **Phase 1 の 10 残余リスク (docs/SECURITY.md) を全て解消してから本番** 開始

---

## 1. 認証 / アイデンティティ

| Phase 1 | Phase 2 |
|---|---|
| 固定 Bearer token | Auth.js + Google Workspace / Entra ID SSO |
| 単一ユーザー | multi-user (DB schema は Phase 1 から対応済み) |
| 管理 UI 無 RBAC | `users.role in ('admin','member')` を middleware で enforce |

### 実装
- `apps/web/app/(auth)/login` に Auth.js provider 追加
- `apps/runner/src/auth.ts` を JWT 検証に差し替え、`userId` context に claim から設定
- `profiles` / `integrations` / `budgets` 編集に admin 判定 middleware

---

## 2. Claude バックエンド (サブスク → API キー)

Phase 1 は `claude` CLI + サブスクリプション credentials mount。100 人規模ではサブスクは ToS・レート的に不可。

| Phase 1 | Phase 2 |
|---|---|
| `claude -p ...` subprocess in container | 同上 but credentials は Anthropic Console の API キー (per-container token) |
| subscription rate limit | per-project budget (Console + Langfuse 両輪) |

### 実装
- `apps/runner/src/claude/docker-driver.ts` で `extraEnv.ANTHROPIC_API_KEY = <per-user or per-org key>` を injection
- credentials mount は optional に (Bedrock/Vertex 対応: `CLAUDE_CODE_USE_BEDROCK=1` を env で渡す)
- Phase 2 の ADR で Bedrock / Vertex / Console の選択を確定 (セキュリティ / データ越境)

---

## 3. サンドボックス隔離の強化

| Phase 1 | Phase 2 |
|---|---|
| Docker Desktop (Windows) | Linux host (Kubernetes or Nomad) |
| CapDrop ALL + no-new-privileges | + seccomp default profile + AppArmor/SELinux profile |
| egress 無制限 | egress allowlist proxy (squid / Envoy) |
| tmpfs 256MB | 500MB+ per session、`overlay2` + diskQuota |
| credentials bind mount (Windows best-effort) | Linux native read-only mount + 短寿命 token injection |

### 実装
- `infra/kubernetes/` に Job / Deployment マニフェスト作成
- sandbox image を Harbor / GitLab Registry に push (署名付き)
- egress allowlist: `api.anthropic.com`, `api.github.com`, `registry.npmjs.org`, `files.pythonhosted.org`, 自社 langfuse, 選定 SaaS MCP endpoints

---

## 4. Langfuse 本番化

| Phase 1 | Phase 2 |
|---|---|
| `docker-compose up` 単体 | 専用 Namespace / Helm chart |
| 認証情報 default | Vault / Sealed Secrets |
| data retention なし | 90 日 (ClickHouse TTL), 監査は S3 に長期 |
| SSO なし | Langfuse Enterprise Edition か OIDC |

---

## 5. Observability / SIEM

- audit_log → Splunk / Datadog / Elastic への転送 (Phase 2)
- 異常検知: guardrail.blocked の連続発生、budget.exceeded、不審な session 生成レート
- Langfuse とアラート連携 (Slack / PagerDuty)

---

## 6. UX / WebUI

- Phase 1 の Next.js dev server → Vercel or 自社 Kubernetes (同一オリジン配信で CSRF 対策簡素化)
- 非エンジニア向けプロンプトテンプレート CMS
- ファイルビューアの拡張: SheetJS, pdf.js, LibreOffice プレビュー画像化 (Runner 内で完結)
- ペルソナ別 profile / プロンプトテンプレート (NW 担当 / 経理 / CS 等)
- ダッシュボードに GIF recording

---

## 7. MCP 統合の本番化

| Phase 1 | Phase 2 |
|---|---|
| 平文 env in DB | AWS Secrets Manager / Vault + transit encryption |
| 単発設定 | OAuth 2.0 flow (PAT は最終手段) |
| admin が一括管理 | user 個別に自分の SaaS 接続を持てる (個人 token) |

---

## 8. 展開手順 (段階)

### Stage A — 5 人パイロット (1 週間)
- Phase 1 の環境にユーザー 5 人を SSO で追加
- R6/R7/R10 を先行で潰す
- 毎日 Langfuse dashboard と `/admin/audit` をレビュー

### Stage B — 20 人 (2-3 週間)
- Kubernetes 化
- egress allowlist 投入
- Bash allowlist のサブコマンド拡張

### Stage C — 100 人 (1-2 ヶ月)
- SIEM 連携
- OIDC で SaaS MCP OAuth
- SLO: Runner 可用性 99.5%, セッション起動 p95 < 10s
- 料金最適化: Langfuse alert + per-team budget

---

## 9. Phase 1 から変更しない前提

- 設計原則 (docs/adr/)
- `packages/guardrails` 公開 API
- `packages/shared` の zod schema (SseEvent, ToolProfile)
- `events` append-only + Last-Event-ID replay プロトコル
- profile / budget / audit の DB schema (必要に応じて追加 column のみ)

---

## 10. 移行チェックリスト (Phase 2 開始前)

- [ ] docs/SECURITY.md の R1〜R10 全てに対処
- [ ] レッドチーム テスト 20 ケース全てが自動 block
- [ ] Langfuse 3 ヶ月 retention / 障害復旧 runbook
- [ ] SSO 統合 E2E
- [ ] Phase 2 構成で 5 人パイロット + 1 週間無事故
- [ ] 外部セキュリティレビュー (任意)
- [ ] ユーザー向け「禁止事項」ドキュメント公開

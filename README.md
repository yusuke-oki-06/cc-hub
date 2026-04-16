# CC Hub — Claude Code HUB

Claude Code を WebUI 経由で複数ユーザーに配布する仕組みを個人的に検証した PoC です。

> **注意**: 本リポジトリは個人検証の成果物です。プロダクション利用を想定したものではなく、「こういったことが技術的に可能である」というイメージを残す目的で作成しました。

---

## 画面イメージ

### Landing (チャット開始画面)

![Landing](docs/demo/01-landing.png)

- モデル選択 (Opus 4.6 / Sonnet 4.6 / Haiku 4.5)
- モード切替 (通常 / プランモード / 編集を承認)
- プロジェクト選択 (+ ボタンから)
- `/` でスキル呼び出し
- ドラッグ&ドロップでファイル添付

### セッションチャット

![Task View](docs/demo/05-task-view.png)

- Claude Code CLI の出力を WebUI で描画 (stream-json ベース)
- ツール実行の折りたたみ表示 (Read / Write / Edit / Bash / Grep 等)
- Slack / Jira の MCP ツール呼び出しにブランドカード表示
- AskUserQuestion: Claude からの質問をボトムシートモーダルで選択肢表示
- Thinking (拡張思考) の折りたたみ表示
- タスクリスト (TodoWrite) のチェックリスト表示
- プランモード承認 (ExitPlanMode) の承認/却下カード
- 入力欄は下部固定、Enter で送信、Shift+Enter で改行

### サイドバー

![Sidebar](docs/demo/04-landing-sidebar.png)

- Chat / Monitor タブ切替
- ツール (Wiki / Skills / ルーティン) / 管理 (プロファイル / 監査ログ / 利用状況)
- プロジェクト一覧 + 最近のセッション
- セッション行: 3 点メニュー (名前変更 / プロジェクト移動 / 削除)

### Skills マーケットプレイス

![Skills](docs/demo/06-skills.png)

- テキスト検索 + カテゴリカード (汎用 / 執筆・編集 / 分析 / 連携 / ワークフロー)
- 人気ランキング Top 10 (金銀銅メダル)
- お気に入り (★) + インストール数
- 公式スキル (Anthropic) に「公式」バッジ
- ソート切替 (人気順 / お気に入り多い順 / 最新順)

### Skills レビュー (管理者)

![Skills Review](docs/demo/07-skills-review.png)

### 利用状況ダッシュボード

![Insights](docs/demo/08-insights.png)

- 今月の稼働削減時間 / Claude 利用料 (¥ 換算)
- 1 時間削減あたり利用料 / 年間予測
- MAU / ユーザー当たり削減時間 / タスク成功率
- 6 ヶ月トレンド (削減時間 vs 利用料)
- Top ユーザー / モデル別利用回数 (Langfuse 連携)

<details>
<summary>利用状況 (フルページ)</summary>

![Insights Full](docs/demo/09-insights-full.png)

</details>

### Wiki (LLM ナレッジベース)

![Wiki Graph](docs/demo/02-wiki-graph.png)

- Obsidian 風のグラフビュー (react-force-graph-2d)
- ファイルツリー + リーディングビュー
- Ingest / Query / Lint のスキル連携

### テーマ

| Warm Sand (デフォルト) | Coral White |
|---|---|
| ![Warm Sand](docs/demo/01-landing.png) | ![Coral White](docs/demo/airbnb-01-landing.png) |

---

## 主要機能一覧

| カテゴリ | 機能 | 概要 |
|---|---|---|
| **セッション管理** | マルチセッション | 最大 3 セッション並列実行 (Docker コンテナ分離) |
| | モデル選択 | Opus 4.6 / Sonnet 4.6 / Haiku 4.5 を GUI で切替 |
| | プランモード | 実装せず計画のみ返す (承認/却下 UI 付き) |
| | フォローアップ | セッション継続、`--resume` で会話文脈維持 |
| **MCP 連携** | Slack | チャンネル検索、メッセージ読み書き |
| | Jira / Confluence | Issue 検索・作成、ページ閲覧 |
| | 認証 | credentials.json 経由 (claude.ai OAuth) |
| **ガードレール** | Bash allowlist | 許可コマンドのみ実行 (curl/ssh 等はブロック) |
| | 環境変数保護 | `$VAR` 展開、コマンド置換をブロック |
| | パスガード | /workspace 外への Read/Write をブロック |
| | 監査ログ | 全ツール呼び出しを DB 記録 |
| | コスト上限 | 日次 / 月次の API コスト上限 |
| **Skills** | マーケットプレイス | 検索 / カテゴリ / ランキング / お気に入り |
| | 公式スキル | PDF / Excel / Word / PowerPoint / MCP Builder 等 |
| | `/` スラッシュコマンド | チャット入力欄から呼び出し |
| **Insights** | 稼働削減時間 | タスク実行時間 + 出力量から自動推定 |
| | Claude 利用料 | USD → ¥ 換算、為替レート設定可 |
| | Top ユーザー | 削減時間ランキング |
| | モデル別利用回数 | Langfuse トレースから集計 |
| **その他** | ルーティン | cron 式で定期実行 (node-cron) |
| | Wiki | Obsidian vault の LLM ナレッジベース |
| | トースト通知 | 操作成功/失敗をトースト表示 |
| | テーマ | Warm Sand / Coral White の 2 テーマ |

---

## アーキテクチャ

```mermaid
graph TB
    Browser["WebUI<br/>(Next.js 15, :3000)"]
    Runner["Runner<br/>(Hono, :4000)"]
    DB["PostgreSQL<br/>(events, tasks,<br/>profiles, skills)"]
    Langfuse["Langfuse<br/>(self-hosted, :3100)"]
    
    subgraph Docker
        Sandbox1["Sandbox A<br/>Claude Code CLI<br/>/workspace"]
        Sandbox2["Sandbox B<br/>Claude Code CLI<br/>/workspace"]
    end
    
    subgraph MCP["MCP Servers"]
        Slack["Slack"]
        Jira["Jira / Confluence"]
    end
    
    Browser -->|SSE + REST| Runner
    Runner -->|Docker API| Sandbox1
    Runner -->|Docker API| Sandbox2
    Runner -->|SQL| DB
    Runner -->|trace| Langfuse
    Sandbox1 -->|stream-json| Runner
    Sandbox1 -.->|OAuth| Slack
    Sandbox1 -.->|OAuth| Jira
    
    style Browser fill:#faf5ed,stroke:#c96442,color:#3d3225
    style Runner fill:#f5f0e6,stroke:#c96442,color:#3d3225
    style DB fill:#e8f0fa,stroke:#2f6fbf,color:#1a1a2e
    style Langfuse fill:#eef5df,stroke:#7a9a3a,color:#3f5a24
```

### データフロー

```
ユーザー入力 → WebUI → Runner API → Docker exec (claude -p --output-format=stream-json)
                                         ↓
                                    stream-json イベント
                                         ↓
                              Runner が SSE + DB に publish
                                         ↓
                              WebUI が SSE で受信 → timeline 描画
```

### サンドボックスのセキュリティ

| 設定 | 値 |
|---|---|
| Linux capabilities | `CapDrop: ALL` |
| 特権昇格 | `no-new-privileges: true` |
| メモリ上限 | 設定値 (MB) |
| プロセス上限 | `PidsLimit: 512` |
| /tmp | `noexec, nosuid, 256MB` |
| ホスト FS | アクセス不可 (credentials.json のみ `ro` マウント) |
| ネットワーク | `host.docker.internal` 経由で Runner API にアクセス可 |

### Guardrail Hooks

Claude Code CLI の `hooks` 機構を利用。各ツール実行前に Runner の `pre-tool-use` エンドポイントが呼ばれ、以下を検査:

- **Bash**: allowlist 外コマンド / パイプ / リダイレクト / 環境変数展開をブロック
- **Read / Edit / Write**: `/workspace` 外へのパス逸脱をブロック
- **Git**: force push / branch -D 等の破壊的操作をブロック
- **MCP ツール**: `mcp__*` は自動許可 (MCP サーバ自体が管理者設定)
- ブロック時は `guardrail.blocked` イベントとしてチャットに表示 + 監査ログ記録

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| Frontend | Next.js 15, React 19 RC, Tailwind CSS, react-force-graph-2d |
| Backend | Hono, dockerode, node-cron, postgres.js |
| DB | PostgreSQL |
| 観測 | Langfuse (self-hosted Docker Compose) |
| CLI | Claude Code (`-p` + `--output-format=stream-json` + `--dangerously-skip-permissions`) |
| MCP | Slack (`mcp.slack.com`), Atlassian (`claude.ai` OAuth) |
| パッケージ | pnpm monorepo (`apps/web`, `apps/runner`, `packages/shared`, `packages/guardrails`) |

---

## 検証を通じて見えた課題・改善余地

| 領域 | 課題 | 備考 |
|---|---|---|
| **認証** | per-user MCP OAuth | 現状はホスト上の credentials.json を共有。本番では各ユーザーが個別に Slack/Jira 認証すべき |
| **権限管理** | RBAC / 部署別プロファイル | 現状は単一 default プロファイル |
| **プロバイダ** | AI Foundry (Azure) 対応 | claude.ai OAuth → Azure AD + API Key への切替 |
| **永続化** | 成果物の保存 | コンテナ内 /workspace は揮発。Git push or Object Storage が必要 |
| **スケーリング** | Docker Swarm / K8s | 現状は単一ホスト。MAX_PARALLEL_SESSIONS=3 |
| **TUI 再現** | CLI interactive mode | headless (`-p`) では TUI 装飾なし。interactive mode は OAuth 再認証が障壁 |
| **MCP Apps** | iframe 埋め込み | MCP Apps 仕様は存在するが、対応 MCP サーバが未普及 (2026-04 時点) |

---

## 検証過程での設計判断

- [ADR-0001: Runner に Claude Agent SDK を選んだ理由](docs/adr/0001-runner-choice-claude-agent-sdk.md)
- [ADR-0002: PoC は信頼リポジトリ前提のローカル限定](docs/adr/0002-local-only-poc-trusted-repo.md)
- [ADR-0003: イベントログ優先の設計](docs/adr/0003-event-log-first.md)
- [脅威モデル](docs/THREAT-MODEL.md)

### Stream-json vs xterm.js

CLI の TUI (スパークルアニメ、色付き表示) をそのまま Web に出したく、xterm.js + PTY モードを検証。結果:

- `Tty: true` で ANSI 出力は取得できるが、interactive mode では **OAuth 再認証** (ブラウザフロー) が発生し Docker コンテナ内では完了できない
- `-p` (print) mode は安定するが TUI 装飾が出ない
- **結論**: stream-json ベースで構造化データを React で描画する方式 (C-2) を採用

---

## ローカルセットアップ

### 前提条件

- Node.js 20+
- pnpm 9+
- Docker Desktop
- PostgreSQL (Docker Compose で起動可)
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code` or Homebrew)
- Claude サブスクリプション (CLI の認証に必要)

### 1. リポジトリクローン

```bash
git clone https://github.com/yusuke-oki-06/cc-hub.git
cd cc-hub
pnpm install
```

### 2. インフラ起動 (PostgreSQL + Langfuse)

```bash
docker compose -f infra/runner-db/docker-compose.yml up -d
docker compose -f infra/langfuse/docker-compose.yml up -d
```

### 3. 環境変数設定

```bash
cp .env.example apps/runner/.env.local
# .env.local を編集:
#   RUNNER_API_TOKEN: ランダムな 64 文字トークン
#   RUNNER_DATABASE_URL: postgres://cchub:cchub@localhost:5433/cchub
#   ANTHROPIC_API_KEY: sk-ant-... (不要の場合あり — CLI が OAuth で認証するため)
#   LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY: Langfuse の API キー
```

### 4. サンドボックス Docker イメージビルド

```bash
docker build -t cc-hub-sandbox:0.1.0 infra/sandbox/
```

### 5. DB マイグレーション

```bash
cd apps/runner
pnpm run migrate
```

### 6. Claude Code CLI 認証

```bash
claude auth login
# ブラウザで Claude アカウントにログイン
```

### 7. 起動

```bash
# ターミナル 1: Runner
cd apps/runner
node --env-file=.env.local node_modules/tsx/dist/cli.mjs watch src/server.ts

# ターミナル 2: Web
cd apps/web
pnpm dev
```

### 8. ブラウザアクセス

- Web UI: http://localhost:3000
- Langfuse: http://localhost:3100

初回アクセス時に API トークン (`.env.local` の `RUNNER_API_TOKEN`) の入力が求められます。

---

## ライセンス

Private / internal use only

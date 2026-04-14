# ADR 0003: Durable Event Log を一次ソースに、SSE は派生ビュー

- **Date**: 2026-04-14
- **Status**: Accepted
- **Phase**: 1

## Context

WebUI と Runner の通信に SSE を使うが、以下の課題がある:

- SSE 接続断 (タブ切替、スリープ、ネットワーク断) でイベントが失われる
- Phase 2 で Vercel/Fly.io に分散した場合、複数フロントからの再接続で順序保証が難しい
- 監査ログとストリーム表示で「何が送られたか」の真実が二重管理になる

## Decision

**Runner 側で `events` テーブルを append-only の一次ソース**とし、SSE はその派生ビューとする。

### events テーブル (概要)

```sql
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id),
  seq INTEGER NOT NULL,              -- session 内連番
  event_type TEXT NOT NULL,          -- system.init / assistant / tool_use / permission_request / ...
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, seq)
);
CREATE INDEX ON events (session_id, seq);
```

### SSE プロトコル

- クライアントは `Last-Event-ID` ヘッダ (または初回接続時のクエリ) で `(session_id, seq)` を送る
- Runner は該当 seq より大きいイベントを DB から replay 後、リアルタイムストリームに切り替え
- 各 SSE メッセージは `id: <seq>\nevent: <type>\ndata: <json>\n\n` の形式

## Consequences

### Positive
- 接続断に耐性、再接続で欠落イベントを自動補完
- 監査ログは events テーブルを view するだけ (重複管理なし)
- Phase 2 で複数 Runner ノード間の永続性に拡張しやすい (共有 DB)

### Negative
- 書込オーバーヘッドが増える (ただし Postgres append-only は高速、実測で問題なければ許容)
- 巨大 payload (Read 結果等) は size limit + 外部 BLOB ストアに追い出す必要あり (M3 の output size limit)

## References

- Codex レビュー指摘: "長時間接続・再接続・順序保証・バックプレッシャ・横断再配信の設計が不足"
- HTML5 EventSource spec の Last-Event-ID

---
name: wiki-query
description: Wiki に対して質問し、関連 page を引いて citation 付きで回答する。価値ある回答は queries/ に保存し知識を累積させる。
allowed-tools: Read, Write, Edit, Glob, Grep
---

# wiki-query

Wiki の既存知識に基づいて質問に答える。

## 手順

1. **index.md を読む** — 全 page の catalog を把握
2. **関連 page を特定** — index のキーワード + `Grep` で本文も検索
3. **該当 page を Read** — 1-5 枚程度に絞る
4. **citation 付きで回答**: 本文で `[[page-slug]]` を使い、どの page の情報か明示
5. **価値判定**: 回答が将来も参照価値がある (ユーザーが「これ保存して」と言う or あなたが有用と判断) なら保存に進む
6. **queries/<YYYY-MM-DD>-<topic-slug>.md に保存**:
   ```yaml
   ---
   title: <質問タイトル>
   type: query
   asked: YYYY-MM-DD
   related: [[slug1]], [[slug2]]
   tags: [...]
   ---
   ```
   本文に質問 / 回答 / 根拠 page への link を記録
7. **log.md 追記**:
   ```
   ## [YYYY-MM-DD] query | <topic>
   - related: [[slug1]], [[slug2]]
   - saved: queries/YYYY-MM-DD-<slug>.md  # 保存した場合のみ
   ```

## 回答形式

状況に応じて選ぶ:
- markdown page (既定)
- 比較表 (`| col1 | col2 |` の Markdown table)
- 箇条書きの ToC
- matplotlib チャート or mermaid diagram (必要なら)
- Marp slide (プレゼン用途)

## 注意

- index に無い情報を聞かれたら「Wiki にまだ情報がない、raw/ に source を追加して ingest を」と返す
- 憶測で page を作らない — source なしで concept/entity を捏造しない
- 既存 page の情報が古そうなら `stale: true` を frontmatter に付ける提案をする

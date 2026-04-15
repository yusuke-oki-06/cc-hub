---
name: wiki-ingest
description: Obsidian vault の raw/ に置かれた source (記事 / Web Clipper 出力 / メモ) を読み、concepts/ や entities/ に構造化 page として統合する。index.md と log.md も更新する。
allowed-tools: Read, Write, Edit, Glob, Grep
---

# wiki-ingest

`raw/` の新しいソースを Wiki に取り込む。

## 手順

1. **対象の特定**: ユーザーから raw ファイル名を受け取る。指定がなければ `raw/` を `Glob` で listing、`index.md` に未登録のもの (最新 mtime) を選ぶ
2. **読む**: `Read` で本文を取得
3. **要点抽出**: 要点 / キーエンティティ / 関連概念を整理 (ユーザーと対話しながら方向性確認)
4. **page 作成 or 更新**:
   - concept (抽象概念、方法論等) → `concepts/<slug>.md`
   - entity (人物、組織、製品等) → `entities/<slug>.md`
   - 既存 page があれば `Edit` で統合、無ければ `Write` で新規
5. **frontmatter 必須項目**:
   ```yaml
   ---
   title: <日本語タイトル>
   type: concept | entity
   sources: [raw/<original-file>.md]
   tags: [関連タグ]
   updated: YYYY-MM-DD
   ---
   ```
6. **[[wikilink]] を埋める**: 本文内で他 page に言及したら必ず `[[slug]]` で参照
7. **backlink**: 新 page を作ったら、関連する既存 page にも `[[new-slug]]` を追記 (orphan 防止)
8. **index.md 更新**: 該当カテゴリに `- [[slug]] — 1 行サマリ` を挿入 (slug 順)
9. **log.md 追記**:
   ```
   ## [YYYY-MM-DD] ingest | <title>
   - source: raw/<file>.md
   - new: [[slug1]], [[slug2]]
   - updated: [[existing1]]
   ```

## 注意

- `raw/` のファイルは**絶対に書き換えない** (immutable)
- 1 source で触る page は 5-15 枚が目安
- 矛盾を見つけたら `<!-- CONFLICT: ... -->` コメントで両論併記
- 情報が薄いうちに長文 page を作らない — 短い page を多数のほうが良い

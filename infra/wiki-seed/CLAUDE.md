# LLM Wiki — あなた (Claude) への指示

この vault は LLM Wiki です。あなたは「wiki maintainer」としてここを増分更新します。

本ドキュメントは karpathy の LLM Wiki パターン (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) をそのまま指示文として採用したものです。以下のルールに従ってください。

---

## 基本思想

一般的な RAG は「質問のたびに raw sources を再検索・再統合する」モデルで、**知識が累積しない**。

この Wiki は違います。**Wiki は持続的に成長するアーティファクト**です:

- 新しい source を追加する → あなたは読み、要点抽出し、既存の Wiki に**統合**する
- entity page / concept page を更新し、古い情報と矛盾があれば flag する
- cross-reference を張る
- synthesis (総合) を改訂する

**ユーザーは Wiki を書きません。あなたが全て書き、維持します。** ユーザーは source を curate し、質問を投げ、方向性を示すだけ。あなたは要約・cross-reference・filing・bookkeeping という「面倒な作業」を全部担います。

---

## 3 層アーキテクチャ

| 層 | 役割 | 編集権 |
|---|---|---|
| **raw/** | 元ドキュメント (記事、論文、Obsidian Web Clipper 出力) | **immutable** — 読むだけ。書き換えない |
| **Wiki 本体** (`concepts/`, `entities/`, `queries/`, `index.md`, `log.md`) | あなたが生成・更新する markdown 集合 | **あなたが所有** |
| **このファイル (CLAUDE.md)** | Wiki の schema・運用ルール | ユーザーと協議して更新 |

---

## 3 つの操作

### Ingest (取り込み)

ユーザーが `raw/` にファイルを置いて「ingest して」と言ったら:

1. 対象ファイルを **Read** で読む
2. 要点を抽出する (ユーザーと会話しながら方向性確認)
3. `concepts/<slug>.md` もしくは `entities/<slug>.md` を新規作成 or 更新 — frontmatter + 本文
4. 本文内で他 page を `[[wikilink]]` で参照する (Obsidian 形式)
5. `index.md` に 1 行追記 (カテゴリ別にソート)
6. 関連する既存 page を更新 (新情報を反映)
7. `log.md` に `## [YYYY-MM-DD] ingest | <title>` エントリを append
8. 1 つの source から typically **10-15 page を touch** する (cross-reference 張り直し含む)

Frontmatter の例:
```yaml
---
title: <ページタイトル>
type: concept | entity | query
sources: [raw/foo.md, raw/bar.md]
tags: [tag1, tag2]
updated: 2026-04-15
---
```

### Query (質問)

ユーザーが Wiki に質問したら:

1. まず `index.md` を読む (全 page の catalog)
2. 関連 page を特定し Read で読む
3. Citation 付きで回答する (どの page の情報か示す)
4. **回答に価値があれば** `queries/<YYYY-MM-DD>-<topic-slug>.md` に保存する — 将来の自分が参照できるように
5. `log.md` に `## [YYYY-MM-DD] query | <topic>` append

回答の形式は markdown page / 比較表 / チャート / キャンバス、何でも OK。

### Lint (健全性チェック)

定期的に「lint して」と言われたら:

1. 全 `[[wikilink]]` 参照の整合性 (broken link 検出)
2. orphan page (どこからも参照されない) を洗い出す
3. 矛盾する記述がないか (A page では X、B page では ¬X と書いてある等)
4. stale な claim — 新しい source で superseded されたもの
5. frontmatter に `stale: true` がついたままのもの
6. 重要概念なのに独立 page が無いもの
7. データが欠けていて web 検索で補完できそうなもの

レポートを `log.md` に記録し、問題があれば修正。

---

## 2 つの特殊ファイル

### `index.md` — 内容指向カタログ

- 全 page を listing、1 行サマリ付き
- カテゴリ別に整理 (entities / concepts / sources / queries 等)
- 毎 ingest で更新する

フォーマット例:
```markdown
# Index

## Concepts
- [[rag-vs-wiki]] — RAG と Wiki 型の違い
- [[memex]] — Vannevar Bush の Memex と本 Wiki の関係

## Entities
- [[karpathy]] — Andrej Karpathy

## Sources
- [[raw/llm-wiki-gist]] (2026-04-15)
```

### `log.md` — 時系列ログ

- append-only
- エントリ先頭は `## [YYYY-MM-DD] <op> | <title>` (grep 可能な形式)
- 最近の動きをあなた自身が確認する入口にもなる

---

## 書き方のルール

- **Obsidian 互換**: `[[target]]` / `[[target|alias]]` / frontmatter YAML / folder 構造はすべて Obsidian 標準に従う
- **ファイル名**: slug は小文字 + ハイフン (`my-concept.md`)。title は frontmatter に (`title: 私のコンセプト`)
- **backlink**: 新 page を作ったら既存 page にも `[[new-page]]` を仕込む (orphan 防止)
- **citation**: 要点を書くときは必ず source を明示 (本文脚注 or frontmatter `sources:`)
- **簡潔さ**: 長文は避ける。要点 + [[link]] で十分
- **画像**: Obsidian の attachment 設定で `raw/assets/` に保存。markdown 内は `![](raw/assets/foo.png)` で参照

---

## 進め方 (運用ヒント)

- ingest は 1 件ずつ、ユーザーと対話しながらが推奨
- batch ingest もできる (「raw/ 以下全部 ingest して」) が、その場合監督は弱くなる
- Wiki はただの git repo なので、変更は commit で差分確認可能
- cc-hub WebUI (`/wiki`) でグラフ表示できる — 構造の俯瞰に便利

---

## なぜこれが機能するか

知識ベースを維持する「面倒な部分」は読むことや考えることではなく、**bookkeeping** です。
cross-reference 更新、整合性保持、古い記述の書き直し — 人間は飽きて放棄する。
あなた (LLM) は飽きないし、1 パスで 15 ファイル触れる。
**維持コストがゼロ近似なので、Wiki は使えば使うほど豊かになる**。

あなたの仕事: 要約・cross-reference・filing・bookkeeping。
ユーザーの仕事: curation・direction・質問・意味付け。

---

## 参考

- 元ドキュメント: karpathy, "LLM Wiki" (2026): https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- 関連: Vannevar Bush "Memex" (1945) — 個人キュレートされたコネクテッド知識ベースの原型

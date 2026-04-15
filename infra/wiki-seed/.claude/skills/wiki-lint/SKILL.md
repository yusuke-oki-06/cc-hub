---
name: wiki-lint
description: Wiki の健全性チェック。broken link / orphan page / 矛盾 / stale claim / frontmatter 抜け等を検出してレポートする。
allowed-tools: Read, Glob, Grep
---

# wiki-lint

Wiki の品質を定期的に確認する。

## チェック項目

1. **Broken `[[wikilink]]`**: 全 `.md` を `Grep` で `\[\[([^|\]]+)` を走査、参照先 slug が `Glob` で見つからないもの
2. **Orphan page**: 作成済みだが、どこからも `[[slug]]` で参照されていない page
3. **Stale frontmatter**: `stale: true` がついたまま放置されている page
4. **矛盾**: 同じ entity を論じる 2 page で対立する記述 (人手確認が必要、候補を列挙)
5. **Undocumented concept**: ある page で `[[foo]]` と参照されているが `foo.md` が無い (wiki-ingest で補完すべき)
6. **Missing frontmatter**: `title` / `type` / `sources` / `updated` のいずれかが欠ける page
7. **Data gap**: 重要 entity に concept との cross-reference が少ない (2 つ未満)

## レポート形式

### Obsidian vault 内に `log.md` 追記:
```
## [YYYY-MM-DD] lint | report

### Broken links (N 件)
- [[concepts/foo]] references [[nonexistent]]

### Orphans (N 件)
- [[entities/unused]]

### Stale (N 件)
- [[concepts/outdated]] (updated: 2025-01-01)

### Missing frontmatter (N 件)
- [[concepts/bar]] is missing `type`

### Undocumented concepts (N 件)
- [[foo]] referenced in [[concepts/baz]] but foo.md doesn't exist

### 改善提案
- [[entities/alice]] と [[concepts/distributed-systems]] の間に cross-reference を足すと良さそう
```

## 注意

- lint は**レポートのみ、自動修正しない**。破壊的変更はユーザー承認後
- 確実に迷わない修正 (typo 等) はユーザーに提案して承認を取る
- 週次 or 月次の cadence を推奨 (page 数が増えてきたら頻度を上げる)

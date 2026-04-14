#!/usr/bin/env bash
set -euo pipefail

# --- tmpfs でない /workspace が空なら、tar/zip が container 内に cp されるのを待つ ---
# Runner 側が docker cp で /workspace に配置してから実際の起動コマンドを exec する想定。

umask 077

# Claude credentials の再帰的権限矯正 (Windows bind mount で perm が乱れる対策)
if [ -f "/home/app/.claude/.credentials.json" ]; then
  chmod 0400 /home/app/.claude/.credentials.json 2>/dev/null || true
fi

exec "$@"

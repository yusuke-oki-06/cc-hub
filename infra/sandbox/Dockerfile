# CC Hub sandbox image — Claude Code + business-file analysis toolchain
# Design: 全部入れ主義。業務ファイル (pcap/xlsx/pptx/pdf/doc/csv/md) と SaaS MCP を
# Claude Code が Bash + MCP で全て処理できるよう、解析ツールチェーンを予め同梱する。
FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    CLAUDE_HOME=/home/app/.claude \
    HOME=/home/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# --- base utilities -----------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget git unzip tar gnupg jq less procps locales \
      ripgrep fd-find \
      tshark tcpdump \
      poppler-utils \
      pandoc \
      libreoffice-core libreoffice-calc libreoffice-impress libreoffice-writer \
      python3 python3-pip python3-venv \
      build-essential && \
    ln -sf /usr/bin/fdfind /usr/local/bin/fd && \
    sed -i -e 's/# \(en_US.UTF-8\)/\1/' -e 's/# \(ja_JP.UTF-8\)/\1/' /etc/locale.gen && \
    locale-gen && \
    rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# --- python analysis stack ----------------------------------------------
# 管理者が必要なら追加ライブラリを子イメージでレイヤ重ねできるよう、ここは基本のみ。
RUN python3 -m pip install --break-system-packages \
      pandas==2.2.3 \
      openpyxl==3.1.5 \
      xlsxwriter==3.2.0 \
      python-pptx==1.0.2 \
      python-docx==1.1.2 \
      pdfplumber==0.11.4 \
      scapy==2.6.1 \
      pyshark==0.6 \
      chardet==5.2.0 \
      markdown==3.7

# --- app user -----------------------------------------------------------
RUN useradd -m -s /bin/bash -u 1001 app && \
    mkdir -p /workspace /workspace/output /home/app/.claude && \
    chown -R app:app /workspace /home/app

# --- Claude Code CLI ----------------------------------------------------
RUN npm install -g @anthropic-ai/claude-code@latest --ignore-scripts && \
    npm cache clean --force

# --- cc-hub hook proxy (PreToolUse/PostToolUse/UserPromptSubmit) --------
COPY --chmod=0755 cc-hub-hook.mjs /usr/local/lib/cc-hub-hook.mjs
COPY --chmod=0755 entrypoint.sh /usr/local/bin/entrypoint.sh

USER app
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["claude", "--help"]

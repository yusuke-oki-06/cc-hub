export interface BashCheckContext {
  allowlist: string[];
  denyPipes: boolean;
  denyRedirects: boolean;
}

export interface BashCheckResult {
  ok: boolean;
  reason?: string;
  normalizedCommand?: string;
}

const PIPE_CHAIN_RE = /[|;&\n\r]|\|\||&&/;
const REDIRECT_RE = /(^|\s)(>{1,2}|<{1,2}|&>|\d?>&\d?)(\s|$)/;
const BACKTICK_SUBSHELL_RE = /`[^`]+`|\$\(/;
const BASE64_DECODE_RE = /base64\s+(?:-d|--decode|-D)/i;
const ENV_EXPANSION_RE = /\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*|%[A-Z_]+%/;

const SHELL_WRAPPERS = /^\s*(?:powershell(?:\.exe)?|pwsh|cmd(?:\.exe)?|wsl(?:\.exe)?|bash|sh|zsh|fish|env)\b/i;

export function checkBashCommand(command: string, ctx: BashCheckContext): BashCheckResult {
  const trimmed = command.trim();
  if (!trimmed) return { ok: false, reason: 'empty command' };

  if (SHELL_WRAPPERS.test(trimmed)) {
    return { ok: false, reason: 'shell wrapper (powershell/cmd/wsl/sh/env) is not allowed' };
  }

  if (BACKTICK_SUBSHELL_RE.test(trimmed)) {
    return { ok: false, reason: 'command substitution (backtick / $()) is not allowed' };
  }

  if (BASE64_DECODE_RE.test(trimmed)) {
    return { ok: false, reason: 'base64 decode pipeline is not allowed (hidden payload risk)' };
  }

  if (ctx.denyPipes && PIPE_CHAIN_RE.test(trimmed)) {
    return { ok: false, reason: 'pipes / chained commands (| ; && &) are not allowed' };
  }

  if (ctx.denyRedirects && REDIRECT_RE.test(trimmed)) {
    return { ok: false, reason: 'IO redirects (> < &>) are not allowed' };
  }

  if (ENV_EXPANSION_RE.test(trimmed)) {
    return { ok: false, reason: 'environment variable expansion is not allowed' };
  }

  const head = trimmed.split(/\s+/)[0]?.toLowerCase();
  if (!head) return { ok: false, reason: 'could not parse command head' };

  const bin = head.replace(/^\.\//, '').split('/').pop() ?? head;

  if (ctx.allowlist.length === 0) {
    return { ok: false, reason: 'bash allowlist is empty' };
  }

  if (!ctx.allowlist.includes(bin)) {
    return { ok: false, reason: `command "${bin}" is not in allowlist: [${ctx.allowlist.join(', ')}]` };
  }

  return { ok: true, normalizedCommand: trimmed };
}

export interface PushCheckResult {
  ok: boolean;
  reason?: string;
}

const GIT_PUSH_RE = /^\s*git\s+(?:.*\s)?push\b/i;
const GIT_FORCE_RE = /\b(?:-f|--force(?:-with-lease(?:=[^\s]+)?)?)\b/i;
const GIT_REMOTE_SET_RE = /^\s*git\s+remote\s+(?:add|set-url)\b/i;
const GIT_CONFIG_HOOK_RE = /^\s*git\s+config\s+.*(?:core\.hooksPath|includeIf|alias\.)/i;

export function checkGitCommand(command: string): PushCheckResult {
  if (GIT_PUSH_RE.test(command)) {
    return { ok: false, reason: 'git push is blocked in Phase 1 (use PR flow externally)' };
  }
  if (GIT_FORCE_RE.test(command)) {
    return { ok: false, reason: 'git --force is blocked' };
  }
  if (GIT_REMOTE_SET_RE.test(command)) {
    return { ok: false, reason: 'git remote add/set-url is blocked (could point to attacker)' };
  }
  if (GIT_CONFIG_HOOK_RE.test(command)) {
    return { ok: false, reason: 'git config for hooksPath/includeIf/alias is blocked' };
  }
  return { ok: true };
}

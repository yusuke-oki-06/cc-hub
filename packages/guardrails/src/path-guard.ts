import { realpathSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const SECRET_PATH_PATTERNS: RegExp[] = [
  /(^|[\\/])\.env($|[\\/.])/i,
  /(^|[\\/])\.ssh([\\/]|$)/i,
  /(^|[\\/])\.aws([\\/]|$)/i,
  /(^|[\\/])\.gnupg([\\/]|$)/i,
  /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.pypirc$/i,
  /(^|[\\/])\.netrc$/i,
  /(^|[\\/])id_[rd]sa($|\.)/i,
  /(^|[\\/])credentials(\.json|\.yml|\.yaml)?$/i,
  /(^|[\\/])\.claude([\\/]\.credentials\.json)$/i,
];

export interface PathCheckContext {
  workspaceRoot: string;
  allowEscape?: boolean;
}

export interface PathCheckResult {
  ok: boolean;
  resolved?: string;
  reason?: string;
}

function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

export function checkPath(target: string, ctx: PathCheckContext): PathCheckResult {
  const resolved = safeRealpath(resolve(ctx.workspaceRoot, target));

  for (const re of SECRET_PATH_PATTERNS) {
    if (re.test(resolved)) {
      return { ok: false, resolved, reason: `path matches secret pattern: ${re}` };
    }
  }

  if (!ctx.allowEscape) {
    const root = safeRealpath(ctx.workspaceRoot);
    const rel = relative(root, resolved);
    if (rel.startsWith('..' + sep) || rel === '..' || resolved === root + sep + '..') {
      return { ok: false, resolved, reason: `path escapes workspace root (${rel})` };
    }
  }

  return { ok: true, resolved };
}

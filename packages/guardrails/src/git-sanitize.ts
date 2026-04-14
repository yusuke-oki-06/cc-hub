import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

export interface SanitizeOptions {
  worktreePath: string;
}

export function sanitizeGitConfig({ worktreePath }: SanitizeOptions): void {
  const gitDir = join(worktreePath, '.git');
  try {
    execFileSync('git', ['-C', worktreePath, 'config', '--local', 'core.hooksPath', '/dev/null'], {
      stdio: 'ignore',
    });
    execFileSync('git', ['-C', worktreePath, 'config', '--local', 'core.fsmonitor', 'false'], {
      stdio: 'ignore',
    });
    execFileSync(
      'git',
      ['-C', worktreePath, 'config', '--local', 'protocol.file.allow', 'never'],
      { stdio: 'ignore' },
    );
  } catch {
    // best effort — worktree が DB でない場合などは無視
  }

  try {
    mkdirSync(join(gitDir, 'info'), { recursive: true });
    writeFileSync(join(gitDir, 'info', 'attributes'), '# sanitized by CC Hub\n* -filter -diff\n');
  } catch {
    // noop
  }
}

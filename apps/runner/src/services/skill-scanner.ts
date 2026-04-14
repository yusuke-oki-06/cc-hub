import { checkBashCommand, redactSecrets } from '@cc-hub/guardrails';

export interface SkillScanReport {
  passed: boolean;
  issues: Array<{
    kind: 'secret' | 'bash' | 'injection' | 'schema';
    severity: 'high' | 'medium' | 'low';
    message: string;
    context?: string;
  }>;
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?prior\s+instructions/i,
  /you\s+are\s+now\s+(an?\s+)?administrator/i,
  /全て\s*の\s*bash\s*を\s*許可/i,
  /sudo\s+-s/i,
];

const SKILL_FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---/;

export function scanSkillContent(skillMd: string): SkillScanReport {
  const issues: SkillScanReport['issues'] = [];

  // 1. Required frontmatter
  const fm = SKILL_FRONTMATTER_RE.exec(skillMd);
  if (!fm) {
    issues.push({
      kind: 'schema',
      severity: 'high',
      message: 'SKILL.md に frontmatter がありません (name / description 必須)',
    });
  } else {
    const body = fm[1] ?? '';
    if (!/^name:\s*\S+/m.test(body)) {
      issues.push({ kind: 'schema', severity: 'high', message: 'frontmatter に `name:` が必要' });
    }
    if (!/^description:\s*\S+/m.test(body)) {
      issues.push({
        kind: 'schema',
        severity: 'medium',
        message: 'frontmatter に `description:` を入れてください',
      });
    }
  }

  // 2. Secret detection via redactor
  const redacted = redactSecrets(skillMd, { entropy: false });
  for (const hit of redacted.hits) {
    issues.push({
      kind: 'secret',
      severity: 'high',
      message: `ハードコードされた secret (${hit.pattern}) が ${hit.count} 件検出されました`,
    });
  }

  // 3. Prompt injection pattern
  for (const re of INJECTION_PATTERNS) {
    if (re.test(skillMd)) {
      issues.push({
        kind: 'injection',
        severity: 'high',
        message: `疑わしい instruction override パターン: ${re}`,
      });
    }
  }

  // 4. Bash fences — check each command line against the default guardrail
  const bashFenceRe = /```bash\s*\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = bashFenceRe.exec(skillMd))) {
    const block = m[1] ?? '';
    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const r = checkBashCommand(trimmed, {
        allowlist: ['ls', 'cat', 'grep', 'head', 'tail', 'echo', 'python3', 'tshark', 'jq', 'pandoc', 'git'],
        denyPipes: true,
        denyRedirects: true,
      });
      if (!r.ok) {
        issues.push({
          kind: 'bash',
          severity: 'medium',
          message: `bash サンプルが guardrail に引っかかる: ${r.reason}`,
          context: trimmed.slice(0, 200),
        });
      }
    }
  }

  return {
    passed: !issues.some((i) => i.severity === 'high'),
    issues,
  };
}

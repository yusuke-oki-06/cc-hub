const PATTERNS: Array<{ name: string; re: RegExp; replace: string }> = [
  { name: 'anthropic-key', re: /sk-ant-[a-zA-Z0-9_-]{20,}/g, replace: '[REDACTED:anthropic-key]' },
  { name: 'openai-key', re: /sk-[a-zA-Z0-9]{32,}/g, replace: '[REDACTED:openai-key]' },
  { name: 'github-token', re: /gh[pousr]_[A-Za-z0-9_]{30,}/g, replace: '[REDACTED:github-token]' },
  { name: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/g, replace: '[REDACTED:aws-access-key]' },
  { name: 'aws-secret', re: /(?<=aws_secret_access_key\s*[=:]\s*)["']?[A-Za-z0-9/+]{40}["']?/gi, replace: '[REDACTED:aws-secret]' },
  { name: 'bearer', re: /Bearer\s+[A-Za-z0-9._-]{20,}/g, replace: 'Bearer [REDACTED]' },
  { name: 'basic-auth', re: /Basic\s+[A-Za-z0-9+/=]{12,}/g, replace: 'Basic [REDACTED]' },
  { name: 'jwt', re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replace: '[REDACTED:jwt]' },
  { name: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replace: '[REDACTED:private-key]' },
  { name: 'slack-token', re: /xox[aboprs]-[A-Za-z0-9-]{10,}/g, replace: '[REDACTED:slack-token]' },
];

const HIGH_ENTROPY_RE = /\b(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*\d)[A-Za-z0-9+/=_-]{32,}\b/g;

export interface RedactResult {
  redacted: string;
  hits: Array<{ pattern: string; count: number }>;
}

export function redactSecrets(input: string, opts: { entropy?: boolean } = {}): RedactResult {
  let out = input;
  const hits: Array<{ pattern: string; count: number }> = [];
  for (const p of PATTERNS) {
    const matches = out.match(p.re);
    if (matches && matches.length > 0) {
      hits.push({ pattern: p.name, count: matches.length });
      out = out.replace(p.re, p.replace);
    }
  }
  if (opts.entropy) {
    const matches = out.match(HIGH_ENTROPY_RE);
    if (matches && matches.length > 0) {
      hits.push({ pattern: 'high-entropy', count: matches.length });
      out = out.replace(HIGH_ENTROPY_RE, '[REDACTED:high-entropy]');
    }
  }
  return { redacted: out, hits };
}

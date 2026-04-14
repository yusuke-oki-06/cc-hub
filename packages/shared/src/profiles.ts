import { z } from 'zod';

export const ToolProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  allowedTools: z.array(z.string()),
  disallowedTools: z.array(z.string()).default([]),
  bashAllowlist: z.array(z.string()).default([]),
  denyPipes: z.boolean().default(true),
  denyRedirects: z.boolean().default(true),
  allowWebFetch: z.boolean().default(false),
  allowWebSearch: z.boolean().default(false),
  maxTurns: z.number().int().positive().default(50),
  timeLimitSeconds: z.number().int().positive().default(1800),
  toolResultMaxBytes: z.number().int().positive().default(524288),
});
export type ToolProfile = z.infer<typeof ToolProfileSchema>;

export const DEFAULT_PROFILE: ToolProfile = {
  id: 'default',
  name: 'Default (read-mostly)',
  description: 'Read/Glob/Grep は自由、Write/Edit は worktree 内のみ、Bash は空 allowlist',
  allowedTools: ['Read', 'Glob', 'Grep', 'Edit', 'Write'],
  disallowedTools: ['WebFetch', 'WebSearch'],
  bashAllowlist: [],
  denyPipes: true,
  denyRedirects: true,
  allowWebFetch: false,
  allowWebSearch: false,
  maxTurns: 50,
  timeLimitSeconds: 1800,
  toolResultMaxBytes: 524288,
};

import { z } from 'zod';

const Env = z.object({
  RUNNER_PORT: z.coerce.number().int().positive().default(4000),
  RUNNER_WORKSPACE_ROOT: z.string().default('./.runner-workspaces'),
  RUNNER_API_TOKEN: z.string().min(16),
  RUNNER_DATABASE_URL: z.string(),
  ANTHROPIC_API_KEY: z.string().min(1),
  DAILY_BUDGET_USD: z.coerce.number().positive().default(20),
  MONTHLY_BUDGET_USD: z.coerce.number().positive().default(300),
  MAX_PARALLEL_SESSIONS: z.coerce.number().int().positive().default(3),
  MAX_TURNS_PER_SESSION: z.coerce.number().int().positive().default(50),
  SESSION_TIME_LIMIT_SECONDS: z.coerce.number().int().positive().default(1800),
  TOOL_RESULT_MAX_BYTES: z.coerce.number().int().positive().default(524288),
  SSE_EVENT_MAX_BYTES: z.coerce.number().int().positive().default(262144),
  LANGFUSE_HOST: z.string().url().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
});

export const config = Env.parse(process.env);
export type AppConfig = typeof config;

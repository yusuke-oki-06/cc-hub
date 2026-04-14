import { z } from 'zod';

export const CreateTaskRequestSchema = z.object({
  profileId: z.string(),
  repoPath: z.string(),
  prompt: z.string().min(1),
  resumeSessionId: z.string().uuid().optional(),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

export const CreateTaskResponseSchema = z.object({
  taskId: z.string().uuid(),
  sessionId: z.string().uuid(),
  workspacePath: z.string(),
});
export type CreateTaskResponse = z.infer<typeof CreateTaskResponseSchema>;

export const PermissionDecisionSchema = z.enum(['allow', 'allow_once', 'deny']);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

export const ResolvePermissionRequestSchema = z.object({
  requestId: z.string().uuid(),
  decision: PermissionDecisionSchema,
  editedInput: z.unknown().optional(),
});
export type ResolvePermissionRequest = z.infer<typeof ResolvePermissionRequestSchema>;

export const AnswerQuestionRequestSchema = z.object({
  requestId: z.string().uuid(),
  answer: z.string(),
});
export type AnswerQuestionRequest = z.infer<typeof AnswerQuestionRequestSchema>;

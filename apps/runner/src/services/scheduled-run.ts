import { createTask } from './tasks.js';
import { markScheduleFired, type Schedule } from './scheduler.js';

/**
 * Fire a scheduled prompt: create a task row so it shows up in the sidebar,
 * then let the normal session flow take over. A cron tick intentionally
 * does NOT auto-spawn a sandbox container — that would chew through
 * sessions silently. Instead, the user opens the created task from the
 * sidebar and clicks 実行 to run it.
 *
 * This keeps schedules in "queued" state and gives the user explicit
 * control over sandbox spawning while still making the prompt discoverable.
 */
export async function fireScheduledRun(s: Schedule): Promise<string> {
  const task = await createTask({
    userId: s.userId,
    profileId: s.profileId,
    prompt: s.prompt,
    projectId: s.projectId ?? undefined,
  });
  await markScheduleFired(s.id, task.id);
  console.log(`[scheduler] fired schedule ${s.id} → task ${task.id}`);
  return task.id;
}

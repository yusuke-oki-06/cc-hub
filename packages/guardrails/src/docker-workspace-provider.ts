import type { Workspace, WorkspaceProvider } from './workspace-provider.js';

/**
 * DockerWorkspaceProvider は docker-driver.createSandbox() を呼び出すラッパ。
 * 実体は apps/runner 側に置くが、interface は guardrails から参照できるよう
 * ここで再 export する。具体実装は apps/runner で provide() される。
 */
export interface DockerSandbox {
  containerId: string;
  stop(): Promise<void>;
  remove(): Promise<void>;
}

export interface DockerWorkspaceFactoryInput {
  sessionId: string;
  sourceRepo: string;
  branch?: string;
}

export type DockerWorkspaceFactory = (input: DockerWorkspaceFactoryInput) => Promise<{
  workspace: Workspace;
  sandbox: DockerSandbox;
}>;

/**
 * A WorkspaceProvider 実装。apps/runner 側から factory を注入する形にすることで、
 * packages/guardrails は dockerode に依存しない。
 */
export function createDockerWorkspaceProvider(factory: DockerWorkspaceFactory): WorkspaceProvider {
  const active = new Map<string, { workspace: Workspace; sandbox: DockerSandbox }>();

  return {
    create: async (opts) => {
      const { workspace, sandbox } = await factory(opts);
      active.set(workspace.id, { workspace, sandbox });
      return workspace;
    },
    destroy: async (workspaceId) => {
      const entry = active.get(workspaceId);
      if (!entry) return;
      try {
        await entry.sandbox.stop();
      } finally {
        await entry.sandbox.remove();
        active.delete(workspaceId);
      }
    },
    list: async () => Array.from(active.values()).map((e) => e.workspace),
  };
}

export interface Workspace {
  readonly id: string;
  readonly root: string;
  readonly sessionId: string;
}

export interface WorkspaceProvider {
  create(opts: { sessionId: string; sourceRepo: string; branch?: string }): Promise<Workspace>;
  destroy(workspaceId: string): Promise<void>;
  list(): Promise<Workspace[]>;
}

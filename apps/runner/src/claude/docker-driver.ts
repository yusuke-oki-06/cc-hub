import Docker from 'dockerode';
import { PassThrough } from 'node:stream';
import { join } from 'node:path';
import { StreamJsonParser } from './stream-parser.js';
import type { ClaudeStreamEvent, ClaudeStdinMessage } from '@cc-hub/shared';

const docker = new Docker();

export interface CreateSandboxInput {
  sessionId: string;
  profileId: string;
  image: string;                     // e.g. 'cc-hub-sandbox:0.1.0'
  credentialsHostPath: string;       // e.g. 'C:\\Users\\koori\\.claude\\.credentials.json'
  hookUrl: string;                   // e.g. 'http://host.docker.internal:4000'
  hookToken: string;
  memoryMb: number;                  // e.g. 4096
  cpuCount: number;                  // e.g. 2
  diskSizeMb: number;                // not enforced on Linux kernel level without --storage-opt, best-effort
  extraEnv?: Record<string, string>;
  extraBinds?: string[];             // additional bind mounts ('host:container[:ro]')
}

export interface SandboxHandle {
  containerId: string;
  stop(): Promise<void>;
  remove(): Promise<void>;
  cpToWorkspace(archiveTarStream: NodeJS.ReadableStream): Promise<void>;
  cpFromWorkspace(path: string): Promise<NodeJS.ReadableStream>;
  execClaude(input: ClaudeExecInput): Promise<ClaudeExecHandle>;
}

export interface ClaudeExecInput {
  prompt: string;
  allowedTools: string[];
  disallowedTools: string[];
  resumeSessionId?: string;
  maxTurns: number;
  timeLimitSeconds: number;
  /** Short model alias (opus/sonnet/haiku) or full Anthropic model ID. */
  model?: string;
  /** Claude CLI permission mode. 'bypassPermissions' is intentionally unsupported here. */
  permissionMode?: 'default' | 'plan' | 'acceptEdits';
  /** MCP servers config (JSON object passed to --mcp-config). */
  mcpConfig?: Record<string, unknown>;
}

export interface ClaudeExecHandle {
  execId: string;
  abort(reason?: string): Promise<void>;
  send(msg: ClaudeStdinMessage): void;
  /** PTY stdin に raw テキストを送信 (ターミナル入力) */
  writeStdin?(text: string): void;
  onEvent(cb: (ev: ClaudeStreamEvent) => void): void;
  onExit(cb: (code: number | null) => void): void;
  onError(cb: (err: Error) => void): void;
}

export async function createSandbox(input: CreateSandboxInput): Promise<SandboxHandle> {
  const labels = {
    'com.cc-hub.session-id': input.sessionId,
    'com.cc-hub.profile-id': input.profileId,
    'com.cc-hub.role': 'sandbox',
  };

  const env = [
    `CC_HUB_HOOK_URL=${input.hookUrl}`,
    `CC_HUB_HOOK_TOKEN=${input.hookToken}`,
    `CC_HUB_SESSION_ID=${input.sessionId}`,
    `CC_HUB_PROFILE_ID=${input.profileId}`,
    ...Object.entries(input.extraEnv ?? {}).map(([k, v]) => `${k}=${v}`),
  ];

  const binds = [
    `${input.credentialsHostPath}:/home/app/.claude/.credentials.json:ro`,
    ...(input.extraBinds ?? []),
  ];

  const container = await docker.createContainer({
    Image: input.image,
    Labels: labels,
    Env: env,
    WorkingDir: '/workspace',
    Tty: false,
    OpenStdin: false,
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    Cmd: ['sleep', 'infinity'],
    HostConfig: {
      AutoRemove: false,
      Binds: binds,
      Memory: input.memoryMb * 1024 * 1024,
      MemorySwap: input.memoryMb * 1024 * 1024,
      NanoCpus: input.cpuCount * 1_000_000_000,
      PidsLimit: 512,
      SecurityOpt: ['no-new-privileges:true'],
      CapDrop: ['ALL'],
      CapAdd: ['CHOWN', 'DAC_OVERRIDE', 'SETUID', 'SETGID'],
      ReadonlyRootfs: false,
      Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=256m' },
      ExtraHosts: ['host.docker.internal:host-gateway'],
    },
  });

  await container.start();

  // stream-json mode (-p) ではオンボーディングは出ないため init exec 不要。

  return {
    containerId: container.id,
    stop: async () => {
      try {
        await container.stop({ t: 5 });
      } catch {
        // noop
      }
    },
    remove: async () => {
      try {
        await container.remove({ force: true });
      } catch {
        // noop
      }
    },
    cpToWorkspace: async (archive) => {
      await container.putArchive(archive as unknown as NodeJS.ReadableStream, { path: '/workspace' });
    },
    cpFromWorkspace: async (path) => {
      const fullPath = join('/workspace', path).replaceAll('\\', '/');
      const res = await container.getArchive({ path: fullPath });
      return res as unknown as NodeJS.ReadableStream;
    },
    execClaude: async (ec) => {
      return startClaudeExec(container, ec);
    },
  };
}

async function startClaudeExec(
  container: Docker.Container,
  input: ClaudeExecInput,
): Promise<ClaudeExecHandle> {
  // -p + --output-format=stream-json: 構造化 JSON イベントを stdout に出力。
  // thinking / tool_use / task_list 等の構造化データを React で描画する。
  const args = [
    '-p',
    input.prompt,
    '--output-format=stream-json',
    '--verbose',
    '--include-partial-messages',
    `--max-turns=${input.maxTurns}`,
  ];
  if (input.allowedTools.length > 0) args.push('--allowedTools', input.allowedTools.join(' '));
  if (input.disallowedTools.length > 0)
    args.push('--disallowedTools', input.disallowedTools.join(' '));
  if (input.resumeSessionId) args.push('--resume', input.resumeSessionId);
  if (input.model) args.push('--model', input.model);
  if (input.permissionMode && input.permissionMode !== 'default') {
    args.push('--permission-mode', input.permissionMode);
  }

  // MCP サーバ設定 — credentials.json に OAuth が入っている MCP サーバを
  // CLI に認識させる。Slack / Notion 等はホスト上で一度 OAuth 完了していれば
  // そのまま使える。
  // MCP サーバは credentials.json から自動検出。不要なコネクタは
  // server.ts 側の disallowedTools パターンでブロック。

  const exec = await container.exec({
    Cmd: ['claude', ...args],
    AttachStdin: false,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    WorkingDir: '/workspace',
  });

  const duplex = (await exec.start({ hijack: true, stdin: false })) as NodeJS.ReadWriteStream;

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  container.modem.demuxStream(duplex, stdout, stderr);

  const parser = new StreamJsonParser();
  const eventListeners = new Set<(ev: ClaudeStreamEvent) => void>();
  const exitListeners = new Set<(code: number | null) => void>();
  const errorListeners = new Set<(err: Error) => void>();

  stdout.setEncoding('utf8');
  stdout.on('data', (chunk: string) => {
    for (const ev of parser.push(chunk)) for (const cb of eventListeners) cb(ev);
  });

  stderr.setEncoding('utf8');
  stderr.on('data', (chunk: string) => {
    for (const cb of eventListeners) cb({ type: 'runner.stderr', text: chunk });
  });

  duplex.on('error', (err) => {
    for (const cb of errorListeners) cb(err);
  });

  // onExit must fire exactly once. 'end' and 'close' can both arrive (or only
  // one may, depending on dockerode multiplexed stream behavior), so guard
  // with an idempotent flag. If exec.inspect() rejects or returns null, we
  // fall back to code = -1 so downstream always sees a terminal state.
  let exited = false;
  // Declared up-front so fireExit can safely clearTimeout even if the stream
  // signals termination before the watchdog is scheduled (temporal-dead-zone
  // safety).
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let timeLimit: ReturnType<typeof setTimeout> | undefined;
  async function fireExit(reason: string): Promise<void> {
    if (exited) return;
    exited = true;
    if (watchdog) clearTimeout(watchdog);
    if (timeLimit) clearTimeout(timeLimit);
    for (const ev of parser.flush()) for (const cb of eventListeners) cb(ev);
    let code: number | null = null;
    try {
      const info = await exec.inspect();
      code = info?.ExitCode ?? null;
    } catch {
      code = -1;
    }
    if (code === null && reason !== 'end') code = -1;
    for (const cb of exitListeners) cb(code);
  }

  duplex.on('end', () => {
    void fireExit('end');
  });
  duplex.on('close', () => {
    void fireExit('close');
  });

  timeLimit = setTimeout(
    () => {
      // Only surface the time-limit error if the exec hasn't already
      // exited cleanly. Without this guard the timer fires 1800s after a
      // normal exit and spams `session_time_limit_exceeded` into the
      // event bus of a session that has long since ended.
      if (exited) return;
      for (const cb of errorListeners) cb(new Error('session_time_limit_exceeded'));
      try {
        duplex.end();
      } catch {
        // noop
      }
    },
    input.timeLimitSeconds * 1000,
  );
  timeLimit.unref();

  watchdog = setTimeout(
    () => {
      if (!exited) {
        console.error(
          `[docker-driver] watchdog firing for exec ${exec.id} after ${input.timeLimitSeconds + 30}s`,
        );
        void fireExit('watchdog');
      }
    },
    (input.timeLimitSeconds + 30) * 1000,
  );
  watchdog.unref();

  return {
    execId: exec.id,
    abort: async (reason?: string) => {
      for (const cb of eventListeners) cb({ type: 'runner.aborted', reason: reason ?? 'manual' });
      try {
        duplex.end();
      } catch {
        // noop
      }
    },
    send: (msg) => {
      if ((duplex as unknown as { writable?: boolean }).writable !== false) {
        duplex.write(JSON.stringify(msg) + '\n');
      }
    },
    /** PTY stdin に raw テキストを送信 (ユーザーのキーボード入力など)。 */
    writeStdin: (text: string) => {
      if ((duplex as unknown as { writable?: boolean }).writable !== false) {
        duplex.write(text);
      }
    },
    onEvent: (cb) => {
      eventListeners.add(cb);
    },
    onExit: (cb) => {
      exitListeners.add(cb);
    },
    onError: (cb) => {
      errorListeners.add(cb);
    },
  };
}

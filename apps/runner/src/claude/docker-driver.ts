import Docker from 'dockerode';
import { join } from 'node:path';
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

  // CLI の初回セットアップ (テーマ選択 / オンボーディング) をスキップするため
  // settings.json を事前配置する。これが無いと対話モードで TUI セットアップ
  // ウィザードが出てしまう。
  try {
    const setupExec = await container.exec({
      Cmd: [
        'sh',
        '-c',
        'mkdir -p /home/app/.claude && echo \'{"theme":"dark","hasCompletedOnboarding":true}\' > /home/app/.claude/settings.json',
      ],
      AttachStdout: false,
      AttachStderr: false,
    });
    await setupExec.start({});
  } catch (err) {
    console.warn('[docker-driver] failed to inject claude settings', err);
  }

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
  // 注意: `--input-format=stream-json` を指定すると Claude は stdin から JSON メッセージを待つ。
  // Phase 1 は初回プロンプトを `-p <prompt>` で渡し、追加メッセージは別 exec で流す方式に
  // する (send() は互換のため残すが stdin 経由での追送信は本節では未使用)。
  // 対話モード (--print なし) で起動し、stdin 経由で prompt を送信する。
  // これにより CLI の完全な TUI (スパークル、色分け、タスクリスト等) が
  // ANSI エスケープとして出力される。
  const args: string[] = [
    `--max-turns=${input.maxTurns}`,
    '--settings', JSON.stringify({ theme: 'dark', preferredNotifChannel: 'terminal' }),
  ];
  if (input.allowedTools.length > 0) args.push('--allowedTools', input.allowedTools.join(' '));
  if (input.disallowedTools.length > 0)
    args.push('--disallowedTools', input.disallowedTools.join(' '));
  if (input.resumeSessionId) args.push('--resume', input.resumeSessionId);
  if (input.model) args.push('--model', input.model);
  if (input.permissionMode && input.permissionMode !== 'default') {
    args.push('--permission-mode', input.permissionMode);
  }

  // Tty: true にすることで CLI に「ターミナルに繋がっている」と認識させ、
  // スパークルアニメ・色分け・タスクリストなど CLI 本来の描画を ANSI エスケ
  // ープとして出力させる。stream-json ではなく生の ANSI 出力を転送し、
  // Web 側で xterm.js に feed する。
  const exec = await container.exec({
    Cmd: ['claude', ...args],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    WorkingDir: '/workspace',
  });

  const duplex = (await exec.start({ hijack: true, stdin: true, Tty: true })) as NodeJS.ReadWriteStream;

  const writeIfOpen = (text: string) => {
    if ((duplex as unknown as { writable?: boolean }).writable !== false) {
      duplex.write(text);
    }
  };
  // CLI がプロンプト入力待ちになる頃にプロンプトを送信。
  // --settings フラグでテーマを事前設定しているのでオンボーディングは出ない想定。
  setTimeout(() => writeIfOpen(input.prompt + '\n'), 2000);

  // Tty モードでは Docker は stdout/stderr を multiplex しない (単一ストリーム)。
  // 全出力をそのまま terminal.data イベントとして転送する。
  const eventListeners = new Set<(ev: ClaudeStreamEvent) => void>();
  const exitListeners = new Set<(code: number | null) => void>();
  const errorListeners = new Set<(err: Error) => void>();

  duplex.on('data', (chunk: Buffer) => {
    const b64 = chunk.toString('base64');
    for (const cb of eventListeners) cb({ type: 'terminal.data', data: b64 });
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
    // Tty モードでは stream-json パーサーを使わないため flush 不要
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

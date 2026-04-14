import type { SandboxHandle } from '../claude/docker-driver.js';
import type { GitCloneInput } from './validation.js';
import Docker from 'dockerode';

const docker = new Docker();

export async function gitCloneIntoSandbox(
  sandbox: SandboxHandle,
  input: GitCloneInput,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const container = docker.getContainer(sandbox.containerId);

  const safeUrl = new URL(input.url);
  if (input.pat) {
    safeUrl.username = 'x-access-token';
    safeUrl.password = input.pat;
  }

  const args = ['clone', '--depth', String(input.depth)];
  if (input.branch) {
    args.push('--branch', input.branch, '--single-branch');
  }
  args.push(safeUrl.toString(), '/workspace');

  const exec = await container.exec({
    Cmd: ['git', ...args],
    AttachStdout: true,
    AttachStderr: true,
    Env: ['GIT_TERMINAL_PROMPT=0', 'GIT_CONFIG_NOSYSTEM=1', 'GIT_ASKPASS=/bin/true'],
    WorkingDir: '/home/app',
    User: 'app',
  });
  const stream = (await exec.start({ hijack: true, stdin: false })) as NodeJS.ReadableStream;

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const { PassThrough } = require('node:stream') as typeof import('node:stream');
    const out = new PassThrough();
    const err = new PassThrough();
    container.modem.demuxStream(stream, out, err);
    out.on('data', (c: Buffer) => stdoutChunks.push(c));
    err.on('data', (c: Buffer) => stderrChunks.push(c));
    stream.on('end', () => resolve());
    stream.on('error', (e: unknown) => reject(e));
  });

  const info = await exec.inspect();
  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');
  const exitCode = info.ExitCode ?? -1;
  return { stdout, stderr, exitCode };
}

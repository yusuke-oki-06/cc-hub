import { describe, it, expect } from 'vitest';
import { toFriendly, buildTimeline } from '../friendly';
import type { SseEvent } from '@cc-hub/shared';

function ev(seq: number, type: string, payload: unknown): SseEvent {
  return {
    sessionId: '00000000-0000-0000-0000-000000000000',
    seq,
    type: type as SseEvent['type'],
    payload,
    createdAt: '2026-04-15T12:00:00.000Z',
  };
}

describe('toFriendly', () => {
  it('assistant text message', () => {
    const r = toFriendly(
      ev(1, 'assistant.message', { message: { content: [{ type: 'text', text: 'こんにちは' }] } }),
    );
    expect(r.kind).toBe('assistant');
    expect(r.body).toBe('こんにちは');
  });

  it('rate_limit_event (unknown status) surfaces as system line', () => {
    const r = toFriendly(ev(2, 'assistant.message', { type: 'rate_limit_event' }));
    // Only status==="allowed" is hidden as noise. Non-allowed surfaces as system.
    expect(r.kind).toBe('system');
  });

  it('tool_use Bash summary', () => {
    const r = toFriendly(ev(3, 'tool_use', { name: 'Bash', input: { command: 'ls /workspace' } }));
    expect(r.kind).toBe('tool.running');
    expect(r.title).toContain('ls /workspace');
  });

  it('tool_use Read summary shortens path', () => {
    const r = toFriendly(
      ev(4, 'tool_use', { name: 'Read', input: { file_path: '/workspace/sub/dir/file.pcap' } }),
    );
    expect(r.title).toContain('dir/file.pcap');
  });

  it('tool_use MCP Jira formatting', () => {
    const r = toFriendly(
      ev(5, 'tool_use', { name: 'mcp__claude_ai_Atlassian__getJiraIssue', input: {} }),
    );
    expect(r.title).toMatch(/claude_ai_atlassian/i);
  });

  it('tool_result success summary', () => {
    const r = toFriendly(
      ev(6, 'tool_result', {
        tool_use_id: 't1',
        content: [{ type: 'text', text: 'hello' }],
      }),
    );
    expect(r.kind).toBe('tool.finished');
    expect(r.meta).toBe('hello');
  });

  it('tool_result error summary', () => {
    const r = toFriendly(ev(7, 'tool_result', { is_error: true, content: [] }));
    expect(r.kind).toBe('tool.finished');
    expect(r.title).toContain('エラー');
  });

  it('permission_request', () => {
    const r = toFriendly(
      ev(8, 'permission_request', { toolName: 'Bash', requestId: 'x', input: { command: 'rm' } }),
    );
    expect(r.kind).toBe('permission');
    expect(r.title).toContain('Bash');
  });

  it('result exitCode 0 ok', () => {
    const r = toFriendly(ev(9, 'result', { exitCode: 0 }));
    expect(r.kind).toBe('result.success');
    expect(r.title).toContain('完了');
  });

  it('no emoji in any FriendlyItem title/body', () => {
    const samples = [
      ev(1, 'assistant.message', { message: { content: [{ type: 'text', text: 'hi' }] } }),
      ev(2, 'tool_use', { name: 'Read', input: { file_path: '/a/b.txt' } }),
      ev(3, 'tool_use', { name: 'Bash', input: { command: 'ls' } }),
      ev(4, 'tool_result', { tool_use_id: 't', content: [{ type: 'text', text: 'ok' }] }),
      ev(5, 'tool_result', { is_error: true, content: [] }),
      ev(6, 'result', { exitCode: 0 }),
      ev(7, 'result', { exitCode: 2 }),
      ev(8, 'guardrail.blocked', { toolName: 'Bash', reason: 'x' }),
      ev(9, 'budget.exceeded', { kind: 'daily' }),
      ev(10, 'saas_link', { provider: 'Jira', url: 'https://x/browse/A-1' }),
      ev(11, 'system.init', { taskId: 't' }),
      ev(12, 'system.init', { model: 'claude-opus-4-6' }),
      ev(13, 'error', { message: 'boom' }),
    ];
    const emojiRe = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}]/u;
    for (const e of samples) {
      const r = toFriendly(e);
      expect(r.title, `title has emoji: ${r.title}`).not.toMatch(emojiRe);
      if (r.body) expect(r.body, `body has emoji: ${r.body}`).not.toMatch(emojiRe);
    }
  });

  it('result exitCode 2 failure', () => {
    const r = toFriendly(ev(10, 'result', { exitCode: 2 }));
    expect(r.kind).toBe('result.failure');
  });

  it('result final text', () => {
    const r = toFriendly(ev(11, 'result', { result: '最終回答です' }));
    expect(r.kind).toBe('result.success');
    expect(r.body).toBe('最終回答です');
  });

  it('guardrail.blocked is shown', () => {
    const r = toFriendly(
      ev(12, 'guardrail.blocked', { toolName: 'Bash', reason: 'empty allowlist' }),
    );
    expect(r.kind).toBe('guardrail');
    expect(r.body).toBe('empty allowlist');
  });

  it('budget.exceeded is shown', () => {
    const r = toFriendly(ev(13, 'budget.exceeded', { kind: 'daily' }));
    expect(r.kind).toBe('budget');
  });

  it('system.init hub (session setup) becomes progress', () => {
    const r = toFriendly(ev(14, 'system.init', { taskId: 't', profileId: 'p' }));
    expect(r.kind).toBe('progress');
    expect(r.title).toContain('準備中');
  });

  it('system.init from claude shows model + MCP', () => {
    const r = toFriendly(
      ev(15, 'system.init', {
        model: 'claude-opus-4-6',
        mcp_servers: [
          { name: 'Slack', status: 'connected' },
          { name: 'Jira', status: 'connected' },
          { name: 'Failed', status: 'failed' },
        ],
      }),
    );
    expect(r.kind).toBe('progress');
    expect(r.title).toContain('claude-opus-4-6');
    expect(r.title).toContain('MCP 2 件接続');
  });

  it('turn.started surfaces the user message', () => {
    const r = toFriendly(
      ev(20, 'turn.started', { role: 'user', text: 'hello claude', model: 'opus' }),
    );
    expect(r.kind).toBe('user');
    expect(r.body).toBe('hello claude');
    expect(r.meta).toContain('model: opus');
  });

  it('rate_limit_event allowed is hidden (noise)', () => {
    const r = toFriendly(
      ev(21, 'assistant.message', {
        type: 'rate_limit_event',
        rate_limit_info: { status: 'allowed' },
      }),
    );
    expect(r.kind).toBe('hidden');
  });

  it('error raw parse_error surfaces as system line (low-noise)', () => {
    const r = toFriendly(ev(16, 'error', { raw: '{"type":...' }));
    expect(r.kind).toBe('system');
  });

  it('error with message is shown', () => {
    const r = toFriendly(ev(17, 'error', { message: 'connection lost' }));
    expect(r.kind).toBe('result.failure');
    expect(r.body).toBe('connection lost');
  });

  it('saas_link extracted', () => {
    const r = toFriendly(
      ev(18, 'saas_link', { provider: 'Jira', url: 'https://x.atlassian.net/browse/ABC-1' }),
    );
    expect(r.kind).toBe('saas_link');
    expect(r.title).toContain('Jira');
  });

  it('unknown event type is hidden', () => {
    const r = toFriendly(ev(19, 'something_unknown' as SseEvent['type'], {}));
    expect(r.kind).toBe('hidden');
  });
});

describe('buildTimeline', () => {
  it('merges tool.running + tool.finished into one row (finished)', () => {
    const items = buildTimeline([
      ev(1, 'tool_use', { id: 't1', name: 'Read', input: { file_path: '/a.txt' } }),
      ev(2, 'tool_result', { tool_use_id: 't1', content: [{ type: 'text', text: 'ok' }] }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('tool.finished');
  });

  it('keeps parse_error as subdued system line, plus progress and assistant', () => {
    const items = buildTimeline([
      ev(1, 'error', { raw: '{"type":...' }), // subdued system line
      ev(2, 'system.init', { taskId: 't' }),  // progress
      ev(3, 'assistant.message', {
        message: { content: [{ type: 'text', text: 'hi' }] },
      }),
    ]);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.kind)).toEqual(['system', 'progress', 'assistant']);
  });

  it('preserves assistant, tool.finished, result ordering', () => {
    const items = buildTimeline([
      ev(1, 'assistant.message', { message: { content: [{ type: 'text', text: 'thinking' }] } }),
      ev(2, 'tool_use', { id: 't1', name: 'Read', input: { file_path: '/f' } }),
      ev(3, 'tool_result', { tool_use_id: 't1', content: [{ type: 'text', text: 'done' }] }),
      ev(4, 'result', { exitCode: 0 }),
    ]);
    expect(items.map((i) => i.kind)).toEqual(['assistant', 'tool.finished', 'result.success']);
  });
});

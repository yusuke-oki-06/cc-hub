import { describe, expect, it } from 'vitest';
import { StreamJsonParser } from '../stream-parser.js';

describe('StreamJsonParser', () => {
  it('parses single-line json', () => {
    const p = new StreamJsonParser();
    const out = p.push('{"type":"assistant","session_id":"s1"}\n');
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe('assistant');
  });

  it('handles chunk splits across newline', () => {
    const p = new StreamJsonParser();
    expect(p.push('{"type":"t1"')).toHaveLength(0);
    expect(p.push('}\n{"type":"t2"}\n')).toHaveLength(2);
  });

  it('ignores empty lines', () => {
    const p = new StreamJsonParser();
    const out = p.push('\n\n{"type":"a"}\n\n');
    expect(out).toHaveLength(1);
  });

  it('emits parse_error for invalid json', () => {
    const p = new StreamJsonParser();
    const out = p.push('not json\n');
    expect(out[0]?.type).toBe('runner.parse_error');
  });

  it('caps line size to prevent DoS', () => {
    const p = new StreamJsonParser(128);
    const huge = '{"type":"big","payload":"' + 'x'.repeat(200) + '"}\n';
    const out = p.push(huge);
    expect(out[0]?.type).toBe('runner.error');
  });

  it('preserves unknown event types via passthrough', () => {
    const p = new StreamJsonParser();
    const out = p.push('{"type":"unheard_of","extra":"value"}\n');
    expect(out[0]?.type).toBe('unheard_of');
    expect((out[0] as { extra?: string }).extra).toBe('value');
  });
});

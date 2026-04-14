import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../secret-redactor.js';

describe('redactSecrets', () => {
  it('redacts anthropic key', () => {
    const r = redactSecrets('api key is sk-ant-api03-abcdef1234567890xxxxxxxxxxxxxxxx');
    expect(r.redacted).toContain('[REDACTED:anthropic-key]');
    expect(r.hits[0]?.pattern).toBe('anthropic-key');
  });
  it('redacts bearer', () => {
    const r = redactSecrets('Authorization: Bearer abc123def456ghi789jkl012');
    expect(r.redacted).toContain('Bearer [REDACTED]');
  });
  it('redacts github token', () => {
    const r = redactSecrets('token=ghp_abcdefghijklmnopqrstuvwxyz012345');
    expect(r.redacted).toContain('[REDACTED:github-token]');
  });
  it('redacts aws access key id', () => {
    const r = redactSecrets('aws key: AKIAIOSFODNN7EXAMPLE in config');
    expect(r.redacted).toContain('[REDACTED:aws-access-key]');
  });
  it('redacts jwt', () => {
    const r = redactSecrets('jwt: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdefghijklmn');
    expect(r.redacted).toContain('[REDACTED:jwt]');
  });
  it('redacts private key block', () => {
    const r = redactSecrets('-----BEGIN RSA PRIVATE KEY-----\nABCDEF\n-----END RSA PRIVATE KEY-----');
    expect(r.redacted).toContain('[REDACTED:private-key]');
  });
  it('does not redact innocuous text', () => {
    const r = redactSecrets('hello world this is normal text');
    expect(r.hits).toHaveLength(0);
    expect(r.redacted).toBe('hello world this is normal text');
  });
});

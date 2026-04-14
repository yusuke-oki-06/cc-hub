import { describe, expect, it } from 'vitest';
import {
  assertSafeArchiveEntry,
  assertAllowedExtension,
  GitCloneInputSchema,
} from '../validation.js';

describe('assertSafeArchiveEntry', () => {
  it('accepts normal path', () => {
    expect(assertSafeArchiveEntry('src/app.ts').ok).toBe(true);
  });
  it('rejects absolute path', () => {
    expect(assertSafeArchiveEntry('/etc/passwd').ok).toBe(false);
  });
  it('rejects traversal', () => {
    expect(assertSafeArchiveEntry('../evil').ok).toBe(false);
  });
  it('rejects backslash traversal', () => {
    expect(assertSafeArchiveEntry('..\\evil').ok).toBe(false);
  });
  it('rejects null byte', () => {
    expect(assertSafeArchiveEntry('a\0b').ok).toBe(false);
  });
  it('rejects too long path', () => {
    expect(assertSafeArchiveEntry('a'.repeat(2000)).ok).toBe(false);
  });
});

describe('assertAllowedExtension', () => {
  it('allows pcap', () => expect(assertAllowedExtension('capture.pcap')).toBe(true));
  it('allows xlsx', () => expect(assertAllowedExtension('book.xlsx')).toBe(true));
  it('allows pptx', () => expect(assertAllowedExtension('deck.pptx')).toBe(true));
  it('allows pdf', () => expect(assertAllowedExtension('doc.pdf')).toBe(true));
  it('rejects exe', () => expect(assertAllowedExtension('virus.exe')).toBe(false));
  it('rejects sh', () => expect(assertAllowedExtension('evil.sh')).toBe(false));
});

describe('GitCloneInputSchema', () => {
  it('accepts https url', () => {
    const r = GitCloneInputSchema.safeParse({ url: 'https://github.com/foo/bar.git' });
    expect(r.success).toBe(true);
  });
  it('rejects ssh', () => {
    const r = GitCloneInputSchema.safeParse({ url: 'ssh://git@github.com/foo/bar.git' });
    expect(r.success).toBe(false);
  });
  it('rejects git://', () => {
    const r = GitCloneInputSchema.safeParse({ url: 'git://github.com/foo.git' });
    expect(r.success).toBe(false);
  });
  it('rejects file://', () => {
    const r = GitCloneInputSchema.safeParse({ url: 'file:///etc/passwd' });
    expect(r.success).toBe(false);
  });
  it('rejects url with ..', () => {
    const r = GitCloneInputSchema.safeParse({ url: 'https://example.com/../evil' });
    expect(r.success).toBe(false);
  });
});

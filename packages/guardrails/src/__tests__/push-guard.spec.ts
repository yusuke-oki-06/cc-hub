import { describe, expect, it } from 'vitest';
import { checkGitCommand } from '../push-guard.js';

describe('checkGitCommand', () => {
  it('blocks git push', () => {
    expect(checkGitCommand('git push origin main').ok).toBe(false);
  });
  it('blocks git push with options', () => {
    expect(checkGitCommand('git -C /repo push --tags').ok).toBe(false);
  });
  it('blocks git force', () => {
    expect(checkGitCommand('git push -f origin main').ok).toBe(false);
  });
  it('blocks git --force-with-lease', () => {
    expect(checkGitCommand('git push --force-with-lease=main').ok).toBe(false);
  });
  it('blocks git remote set-url', () => {
    expect(checkGitCommand('git remote set-url origin https://evil').ok).toBe(false);
  });
  it('blocks git config core.hooksPath', () => {
    expect(checkGitCommand('git config core.hooksPath /tmp/evil').ok).toBe(false);
  });
  it('blocks git config includeIf', () => {
    expect(checkGitCommand('git config includeIf.gitdir:/repo/.path /evil').ok).toBe(false);
  });
  it('allows git status', () => {
    expect(checkGitCommand('git status').ok).toBe(true);
  });
  it('allows git commit', () => {
    expect(checkGitCommand('git commit -m foo').ok).toBe(true);
  });
});

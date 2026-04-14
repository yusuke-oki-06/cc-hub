import { describe, it, expect } from 'vitest';
import { extractSaasLinks } from '../saas-extractor.js';

describe('extractSaasLinks', () => {
  it('extracts a Jira issue URL', () => {
    const r = extractSaasLinks({
      content: [{ type: 'text', text: 'See https://acme.atlassian.net/browse/ABC-123 for details.' }],
    });
    expect(r).toEqual([{ provider: 'Jira', url: 'https://acme.atlassian.net/browse/ABC-123' }]);
  });
  it('extracts a Slack permalink', () => {
    const r = extractSaasLinks('https://acme.slack.com/archives/C12345/p1700000000000001');
    expect(r[0]?.provider).toBe('Slack');
  });
  it('dedupes multiple occurrences', () => {
    const r = extractSaasLinks(
      'https://acme.atlassian.net/browse/X-1 and https://acme.atlassian.net/browse/X-1 again',
    );
    expect(r).toHaveLength(1);
  });
  it('ignores random URLs', () => {
    expect(extractSaasLinks('https://example.com/hello')).toHaveLength(0);
  });
  it('matches Confluence and GitHub simultaneously', () => {
    const r = extractSaasLinks(
      'https://acme.atlassian.net/wiki/spaces/PROJ/pages/42 and https://github.com/org/repo/issues/7',
    );
    expect(r.map((x) => x.provider)).toContain('Confluence');
    expect(r.map((x) => x.provider)).toContain('GitHub');
  });
  it('strips trailing punctuation', () => {
    const r = extractSaasLinks('See (https://acme.atlassian.net/browse/P-9).');
    expect(r[0]?.url).toBe('https://acme.atlassian.net/browse/P-9');
  });
});

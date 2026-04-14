/**
 * Extract SaaS (Slack/Jira/Confluence/GitHub/...) deep-link URLs from a
 * tool_result payload so the WebUI can show an iframe or link card.
 *
 * The scanner is deliberately conservative: it matches well-known URL shapes
 * and attaches a provider tag. Unknown URLs are ignored.
 */

export interface SaasLink {
  provider: 'Slack' | 'Jira' | 'Confluence' | 'GitHub' | 'Notion' | 'ServiceNow' | 'Datadog' | 'Other';
  url: string;
  title?: string;
}

const PROVIDER_PATTERNS: Array<{ provider: SaasLink['provider']; re: RegExp }> = [
  { provider: 'Slack', re: /https?:\/\/[a-z0-9-]+\.slack\.com\/(archives|messages)\/[A-Z0-9]+(?:\/p\d+)?/g },
  { provider: 'Jira', re: /https?:\/\/[a-z0-9-]+\.atlassian\.net\/browse\/[A-Z][A-Z0-9_]*-\d+/g },
  { provider: 'Confluence', re: /https?:\/\/[a-z0-9-]+\.atlassian\.net\/wiki\/[^\s"')]+/g },
  { provider: 'GitHub', re: /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\/(?:issues|pull)\/\d+)?/g },
  { provider: 'Notion', re: /https?:\/\/www\.notion\.so\/[\w-]+(?:\/[\w-]+)?-[0-9a-f]{32}/g },
  { provider: 'ServiceNow', re: /https?:\/\/[a-z0-9-]+\.service-now\.com\/[^\s"')]+/g },
  { provider: 'Datadog', re: /https?:\/\/app\.datadoghq\.(?:com|eu)\/[^\s"')]+/g },
];

export function extractSaasLinks(payload: unknown): SaasLink[] {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? '');
  const results: SaasLink[] = [];
  const seen = new Set<string>();
  for (const { provider, re } of PROVIDER_PATTERNS) {
    re.lastIndex = 0;
    const matches = text.match(re);
    if (!matches) continue;
    for (const url of matches) {
      const clean = url.replace(/[.,;:!?)\]"']+$/, '');
      if (seen.has(clean)) continue;
      seen.add(clean);
      results.push({ provider, url: clean });
    }
  }
  return results;
}

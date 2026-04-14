#!/usr/bin/env node
// Claude Code hook (PreToolUse/PostToolUse/UserPromptSubmit) that proxies
// stdin JSON to the Runner's guardrail HTTP endpoint via host.docker.internal.
// Installed into the sandbox image at build-time; per-session parameters are
// injected via environment variables so we can reuse the same image.

import { request } from 'node:http';
import { URL } from 'node:url';

const event = process.argv[2];
const base = process.env.CC_HUB_HOOK_URL;
const token = process.env.CC_HUB_HOOK_TOKEN;
const sessionId = process.env.CC_HUB_SESSION_ID;
const profileId = process.env.CC_HUB_PROFILE_ID ?? 'default';

if (!event || !base || !token || !sessionId) {
  process.stderr.write('cc-hub-hook: missing env (CC_HUB_HOOK_URL/TOKEN, CC_HUB_SESSION_ID)\n');
  process.exit(2);
}

let body = '';
for await (const chunk of process.stdin) body += chunk;

const url = new URL(base.replace(/\/$/, '') + '/internal/hooks/' + event);
const req = request(
  {
    hostname: url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      'X-CCHUB-Session': sessionId,
      'X-CCHUB-Profile': profileId,
    },
  },
  (res) => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (c) => (data += c));
    res.on('end', () => {
      if (data) process.stdout.write(data);
      process.exit(res.statusCode === 200 ? 0 : 2);
    });
  },
);
req.on('error', (err) => {
  process.stderr.write('cc-hub-hook: ' + err.message + '\n');
  process.exit(2);
});
req.end(body);

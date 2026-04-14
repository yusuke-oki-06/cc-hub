import type { MiddlewareHandler } from 'hono';
import { config } from './config.js';

const FIXED_USER_ID = '00000000-0000-0000-0000-000000000001';

export const requireToken: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header('Authorization');
  const expected = `Bearer ${config.RUNNER_API_TOKEN}`;
  if (!auth || auth.length !== expected.length) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  // timing-safe compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= auth.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return c.json({ error: 'unauthorized' }, 401);

  c.set('userId', FIXED_USER_ID);
  await next();
};

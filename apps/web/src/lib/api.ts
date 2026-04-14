const BASE = process.env.NEXT_PUBLIC_RUNNER_URL ?? 'http://localhost:4000';

function getToken(): string {
  // Phase 1: fixed token in localStorage. Phase 2 で Auth.js + JWT に置き換え
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('cc-hub-token') ?? '';
}

export async function api<T>(
  path: string,
  init: RequestInit & { noAuth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!init.noAuth) headers.set('Authorization', `Bearer ${getToken()}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body || res.statusText}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('application/json') ? await res.json() : (await res.text())) as T;
}

export const runnerBase = BASE;
export const getAuthHeader = () => `Bearer ${getToken()}`;

/** Wrap a promise so it rejects after `ms` with a labelled timeout error. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([p.finally(() => t && clearTimeout(t)), timeout]);
}

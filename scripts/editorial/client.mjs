// The same private API as the Desk. No direct D1 writes or public-bucket uploads.
export const TARGETS = {
  production: 'https://desk.fromthedumpsterfire.com',
  preview: 'https://fdf-desk-preview.r-bhuvanesh2007.workers.dev',
  local: 'http://127.0.0.1:8787',
};

export function deskOrigin(value) {
  const u = new URL(value);
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('FDF_DESK_URL must be an origin without credentials, path, query or fragment');
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error('The Desk requires HTTPS (HTTP is allowed only on localhost)');
  return u.origin;
}

export function apiPath(path) {
  // Reject URL tricks before URL normalisation. Credentials must never go to another origin.
  if (!/^\/api\/[A-Za-z0-9/_-]+(?:\?[^#\\\s]*)?$/.test(path) || path.includes('//')) throw new Error('Use an /api/ path; absolute URLs, escapes and traversal are refused');
  return path;
}

export class DeskError extends Error {
  constructor(message, status, body) { super(message); this.status = status; this.body = body; }
}

export function redact(value, credentials) {
  let text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  for (const secret of Object.values(credentials).filter((s) => typeof s === 'string' && s.length > 3)) text = text.split(secret).join('[redacted]');
  return text;
}

export function createClient({ origin, credentials = {}, timeout = 180_000, fetcher = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  origin = deskOrigin(origin);
  const local = new URL(origin).protocol === 'http:';
  const pair = Boolean(credentials.clientId && credentials.clientSecret);
  if (Boolean(credentials.clientId) !== Boolean(credentials.clientSecret)) throw new Error('Set both FDF_ACCESS_CLIENT_ID and FDF_ACCESS_CLIENT_SECRET');
  if (pair && credentials.token) throw new Error('Choose service credentials or an owner token, not both');
  if (!local && !pair && !credentials.token) throw new Error('No editorial credentials. Run login on this machine, or provide an Access service-token pair in the environment/config file. See docs/EDITORIAL.md');

  return {
    origin,
    async request(method, path, { data, form, confirmPublish = false, confirmDelete = false } = {}) {
      apiPath(path);
      method = method.toUpperCase();
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('Supported methods: GET, POST, PUT, PATCH, DELETE');
      const pathname = path.split('?')[0].replace(/\/+$/, '');
      if (pathname.endsWith('/publish') && !confirmPublish) throw new Error('Publishing needs --confirm-publish, after the editor approves this edition');
      if (method === 'DELETE' && !confirmDelete) throw new Error('Permanent removal needs --confirm-delete');
      if (data !== undefined && form) throw new Error('Use a JSON body or multipart form, not both');
      if (method === 'GET' && (data !== undefined || form)) throw new Error('GET cannot have a body');
      const headers = { accept: 'application/json', origin, 'x-desk': '1' };
      if (pair) {
        headers['CF-Access-Client-Id'] = credentials.clientId;
        headers['CF-Access-Client-Secret'] = credentials.clientSecret;
      } else if (credentials.token) headers.cookie = `CF_Authorization=${credentials.token}`;
      if (!form && method !== 'GET' && method !== 'DELETE') headers['content-type'] = 'application/json';
      // Only reads retry. A lost response to a write may already have committed.
      for (let attempt = 0; ; attempt++) {
        let res;
        try {
          res = await fetcher(origin + path, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(timeout), ...(form ? { body: form } : method !== 'GET' && method !== 'DELETE' ? { body: JSON.stringify(data ?? {}) } : {}) });
        } catch {
          if (method === 'GET' && attempt < 2) { await sleep(500 * 2 ** attempt); continue; }
          throw new Error(method === 'GET' ? 'Desk request failed or timed out' : 'Write response was lost or timed out. It may have completed. Read the item/Haul before retrying; this client did not resend it.');
        }
        if (method === 'GET' && [429, 502, 503, 504].includes(res.status) && attempt < 2) {
          await res.body?.cancel();
          await sleep(500 * 2 ** attempt);
          continue;
        }
        if ([301, 302, 303, 307, 308].includes(res.status)) {
          await res.body?.cancel();
          throw new DeskError('Access redirected this request. Renew owner login, or check the service token and the application Service Auth policy. No redirect was followed.', res.status);
        }
        // Never print an Access HTML login page, headers or raw network diagnostics.
        if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
          await res.body?.cancel();
          throw new DeskError(`Desk returned HTTP ${res.status} without JSON. Check FDF_DESK_URL, authentication and the deployed API version.`, res.status);
        }
        const reader = res.body.getReader();
        const chunks = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('Desk response exceeds 8 MB'); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        let body;
        try { body = JSON.parse(await new Blob(chunks).text()); }
        catch { throw new DeskError(`Desk returned invalid JSON (HTTP ${res.status})`, res.status); }
        if (!res.ok) throw new DeskError(`Desk refused the request (HTTP ${res.status})`, res.status, body);
        return body;
      }
    },
  };
}

export async function waitForItem(client, id, { seconds = 180, interval = 3000, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid item ID');
  const end = now() + seconds * 1000;
  while (true) {
    const detail = await client.request('GET', `/api/items/${id}`);
    const state = detail.item?.status;
    if (state === 'ready') return detail;
    if (['failed', 'paused'].includes(state)) throw new DeskError(`Item ${state}; inspect status_detail before retrying`, 422, detail);
    if (now() >= end) throw new DeskError('Item is still processing; capture is saved. Use item or wait to check later.', 408, { id, status: state });
    await sleep(Math.min(interval, end - now()));
  }
}

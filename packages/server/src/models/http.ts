// HTTP for provider APIs: one POST with a timeout, retries with backoff on 429 and 5xx (honouring
// Retry-After), and errors mapped to ProviderError. Keys travel only in request headers; nothing
// here logs headers, and error text is scrubbed of anything that looks like a key.

import { ModelError } from './types';

export class ProviderError extends ModelError {
  constructor(
    readonly provider: string,
    readonly status: number,
    message: string,
    /** Worth another try at the same model (429, 5xx, timeouts). */
    readonly retryable: boolean,
    /** Seconds the provider asked us to wait, when it said. */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export interface PostOptions {
  provider: string;
  timeoutMs?: number;
  /** Total tries, including the first. */
  attempts?: number;
  /** Longest Retry-After we will wait inside one call; longer waits fall through to the next model. */
  maxWaitS?: number;
  /** Test seam: the fetch to use and how to sleep. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export const PROVIDER_TIMEOUT_MS = 150_000;
const RETRY_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Test seam for the wait between retries. */
export const httpHooks = { sleep: defaultSleep };

/** Retry-After as seconds: either a number of seconds or an HTTP date. */
export function parseRetryAfter(v: string | null, now = Date.now()): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return n;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : Math.max(0, (t - now) / 1000);
}

/** Remove anything shaped like a credential from text we keep (error messages go to the ledger). */
export function scrub(s: string): string {
  return s
    .replace(/(key=|api[_-]?key["':\s]+|bearer\s+)[\w.\-]{8,}/gi, '$1[redacted]')
    .replace(/\b(sk|AIza|ant)[\w-]{16,}/g, '[redacted]');
}

function backoffMs(attempt: number): number {
  const base = 1000 * 2 ** attempt;
  return base + Math.floor(Math.random() * 250);
}

/** POST JSON and return the parsed JSON body, or throw ProviderError. */
export async function postJson(url: string, headers: Record<string, string>, body: unknown, opts: PostOptions): Promise<{ json: Record<string, unknown>; headers: Headers }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? httpHooks.sleep;
  const attempts = opts.attempts ?? 3;
  const maxWaitS = opts.maxWaitS ?? 20;
  const payload = JSON.stringify(body);
  let last: ProviderError | null = null;

  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      const wait = last?.retryAfter !== undefined ? last.retryAfter * 1000 : backoffMs(i - 1);
      await sleep(wait);
    }
    let res: Response;
    try {
      res = await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: payload, signal: AbortSignal.timeout(opts.timeoutMs ?? PROVIDER_TIMEOUT_MS) });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      last = new ProviderError(opts.provider, 0, timeout ? `${opts.provider} did not answer within ${Math.round((opts.timeoutMs ?? PROVIDER_TIMEOUT_MS) / 1000)} s` : `${opts.provider} unreachable: ${scrub(String(e))}`, true);
      continue;
    }
    const text = await res.text();
    if (res.ok) {
      // DeepSeek pads a long wait with blank lines before the JSON.
      const trimmed = text.trim();
      try {
        return { json: JSON.parse(trimmed) as Record<string, unknown>, headers: res.headers };
      } catch {
        throw new ProviderError(opts.provider, res.status, `${opts.provider} answered with something other than JSON: ${scrub(trimmed.slice(0, 200))}`, false);
      }
    }
    const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
    const retryable = RETRY_STATUS.has(res.status) && !isHardLimit(text);
    last = new ProviderError(opts.provider, res.status, `${opts.provider} ${res.status}: ${scrub(errorText(text))}`, retryable, retryAfter);
    if (!retryable) throw last;
    // A long wait is better spent on the next model in the chain.
    if (retryAfter !== undefined && retryAfter > maxWaitS) throw last;
  }
  throw last ?? new ProviderError(opts.provider, 0, `${opts.provider} failed`, true);
}

/** Spend caps and exhausted balances answer 429 but will not clear on retry. */
function isHardLimit(text: string): boolean {
  return /enforced_spend_limit_reached|insufficient[_ ]balance|quota.*exceeded.*(billing|plan)|"code":\s*"?1113/i.test(text);
}

/** The useful part of a provider's error body. */
function errorText(text: string): string {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const e = (Array.isArray(j) ? j[0]?.error : j.error) as Record<string, unknown> | string | undefined;
    if (typeof e === 'string') return e.slice(0, 300);
    const msg = e?.message ?? j.message ?? j.msg;
    const code = e?.type ?? e?.status ?? e?.code ?? j.code;
    if (msg) return `${code ? `${String(code)}: ` : ''}${String(msg)}`.slice(0, 300);
  } catch {
    /* not JSON */
  }
  return text.slice(0, 300);
}

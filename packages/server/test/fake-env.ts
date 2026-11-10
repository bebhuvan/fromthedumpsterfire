// A test Env: D1 on node:sqlite with the real migrations, in-memory R2 buckets, a Vectorize stand-in
// with cosine search, a queue that records messages, and an AI binding whose answers the test
// supplies. Lets the publish, plates, connections and audio paths run end to end without Cloudflare.

import type { Env } from '../src/env';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// Node built-ins, loaded untyped (this package type-checks against the Workers types only).
const sqlite: Any = await import('node:sqlite' as string);
const fs: Any = await import('node:fs' as string);
const path: Any = await import('node:path' as string);
const url: Any = await import('node:url' as string);

class Stmt {
  constructor(
    private db: Any,
    readonly sql: string,
    private params: unknown[] = [],
  ) {}
  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p)));
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    const plain = { ...row };
    return (col ? plain[col] : plain) as T;
  }
  async all<T>() {
    const rows = this.db.prepare(this.sql).all(...this.params) as Record<string, unknown>[];
    return { results: rows.map((r) => ({ ...r })) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
  runSync() {
    this.db.prepare(this.sql).run(...this.params);
  }
}

export class FakeD1 {
  db: Any;
  constructor() {
    this.db = new sqlite.DatabaseSync(':memory:');
    const dir = url.fileURLToPath(new URL('../../../migrations/', import.meta.url));
    for (const f of (fs.readdirSync(dir) as string[]).filter((x) => x.endsWith('.sql')).sort()) this.db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  prepare(sql: string) {
    return new Stmt(this.db, sql);
  }
  async batch(stmts: Stmt[]) {
    this.db.exec('BEGIN');
    try {
      for (const s of stmts) s.runSync();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return stmts.map(() => ({ success: true }));
  }
  async exec(sql: string) {
    this.db.exec(sql);
  }
}

async function toBytes(v: unknown): Promise<Uint8Array> {
  if (typeof v === 'string') return new TextEncoder().encode(v);
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (v && typeof (v as ReadableStream).getReader === 'function') return new Uint8Array(await new Response(v as ReadableStream).arrayBuffer());
  throw new Error('unsupported R2 body');
}

export class FakeR2 {
  objects = new Map<string, { bytes: Uint8Array; httpMetadata?: Record<string, string>; customMetadata?: Record<string, string> }>();
  writes: string[] = [];
  constructor(readonly name: string) {}
  async put(key: string, value: unknown, opts: { httpMetadata?: Record<string, string>; customMetadata?: Record<string, string> } = {}) {
    this.writes.push(key);
    this.objects.set(key, { bytes: await toBytes(value), httpMetadata: opts.httpMetadata, customMetadata: opts.customMetadata });
    return { key };
  }
  async get(key: string) {
    const o = this.objects.get(key);
    if (!o) return null;
    return {
      key,
      body: new Response(o.bytes).body,
      httpMetadata: o.httpMetadata ?? {},
      customMetadata: o.customMetadata ?? {},
      arrayBuffer: async () => o.bytes.slice().buffer,
      text: async () => new TextDecoder().decode(o.bytes),
      json: async () => JSON.parse(new TextDecoder().decode(o.bytes)),
    };
  }
  async list(opts: { prefix?: string; limit?: number } = {}) {
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(opts.prefix ?? '')).sort().slice(0, opts.limit ?? 1000);
    return { objects: keys.map((key) => ({ key })), truncated: false };
  }
  async head(key: string) {
    return this.objects.has(key) ? { key } : null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

export class FakeVectors {
  store = new Map<string, { values: number[]; metadata: Record<string, string> }>();
  async upsert(vs: Array<{ id: string; values: number[]; metadata?: Record<string, string> }>) {
    for (const v of vs) this.store.set(v.id, { values: v.values, metadata: v.metadata ?? {} });
    return { ids: vs.map((v) => v.id), count: vs.length };
  }
  async deleteByIds(ids: string[]) {
    for (const id of ids) this.store.delete(id);
    return { ids, count: ids.length };
  }
  async query(vector: number[], opts: { topK?: number; filter?: { itemId?: { $ne?: string } } } = {}) {
    const ne = opts.filter?.itemId?.$ne;
    const scored = [...this.store.entries()]
      .filter(([, v]) => !ne || v.metadata.itemId !== ne)
      .map(([id, v]) => ({ id, score: cosine(vector, v.values), metadata: v.metadata }))
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.topK ?? 5);
    return { matches: scored, count: scored.length };
  }
  async queryById(id: string, opts: Parameters<FakeVectors['query']>[1] = {}) {
    const v = this.store.get(id);
    return v ? this.query(v.values, opts) : { matches: [], count: 0 };
  }
}

export function cosine(a: number[], b: number[]): number {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export type AiHandler = (model: string, input: Record<string, Any>) => unknown | Promise<unknown>;

export type TestEnv = Env & {
  MEDIA: FakeR2 & R2Bucket;
  FILES: FakeR2 & R2Bucket;
  queue: unknown[];
  aiCalls: Array<{ model: string; input: Record<string, Any> }>;
};

export function makeEnv(ai: AiHandler = () => ({ response: '{}' }), over: Partial<Env> = {}): TestEnv {
  const queue: unknown[] = [];
  const aiCalls: Array<{ model: string; input: Record<string, Any> }> = [];
  const env = {
    DB: new FakeD1(),
    MEDIA: new FakeR2('media'),
    FILES: new FakeR2('files'),
    VECTORS: new FakeVectors(),
    AI: {
      run: async (model: string, input: Record<string, Any>) => {
        aiCalls.push({ model, input });
        return ai(model, input);
      },
    },
    INGEST_QUEUE: { send: async (m: unknown) => void queue.push(m) },
    ITEM_WORKFLOW: {},
    // The Desk's assets as the Worker sees them, for what tests need: the chart fonts.
    ASSETS: {
      fetch: async (req: Request) => {
        const name = /^\/fonts\/([\w.-]+\.ttf)$/.exec(new URL(req.url).pathname)?.[1];
        const fs: Any = await import('node:fs' as string);
        const path: Any = await import('node:path' as string);
        const url: Any = await import('node:url' as string);
        const file = name ? path.join(path.dirname(url.fileURLToPath(import.meta.url)), '../../../apps/desk/public/fonts', name) : '';
        return file && fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('Not found', { status: 404 });
      },
    },
    ENVIRONMENT: 'local',
    SPEND_WARN_USD: '1',
    SPEND_CEILING_USD: '2',
    FILES_BASE: 'https://files.example.org',
    SITE_BASE: 'https://fromthedumpsterfire.com',
    CF_ACCOUNT_ID: 'acct',
    AI_GATEWAY_ID: '',
    queue,
    aiCalls,
    ...over,
  };
  return env as unknown as TestEnv;
}

/** A chat-style Workers AI answer carrying a JSON object. */
export const answer = (obj: unknown, tokens = { in: 1000, out: 200 }) => ({ response: JSON.stringify(obj), usage: { prompt_tokens: tokens.in, completion_tokens: tokens.out } });

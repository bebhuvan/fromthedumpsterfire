// The model router. Every model call goes through Cloudflare AI Gateway: Workers AI through the AI
// binding's gateway option, external providers through the gateway's OpenAI-compatible endpoint.
// Tasks map to a chain of models in routes.json, so providers and models change by config.
// Outputs are JSON, validated against a zod schema; an invalid answer gets one repair attempt,
// then the next model in the chain is tried.

import { z } from 'zod';
import type { Env } from '../env';
import defaults from './routes.json';
import { assertBudget, recordCall } from '../spend';
import { errorMessage, FatalError } from '../util';

export type Provider = 'workers-ai' | 'google-ai-studio' | 'deepseek' | 'anthropic' | 'openai' | 'openrouter';
export type TaskName = 'read' | 'draft' | 'judge' | 'clean' | 'ocr' | 'haul' | 'plate' | 'connect' | 'thread';

export interface ModelConfig {
  provider: Provider;
  model: string;
  inUsdPerM: number;
  outUsdPerM: number;
  /** How to ask for JSON: a JSON schema, plain JSON-object mode, or only by prompt. */
  json: 'schema' | 'object' | 'prompt';
  vision?: boolean;
  /** Reasoning models: false asks the model not to think out loud (faster, and the output budget goes to the answer). */
  thinking?: boolean;
}

export interface TaskConfig {
  chain: string[];
  maxTokens: number;
  temperature: number;
  maxInputChars: number;
  vision?: boolean;
}

export interface RoutesConfig {
  byok: boolean;
  tasks: Record<TaskName, TaskConfig>;
  models: Record<string, ModelConfig>;
  transcribe: { model: string; usdPerAudioMinute: number };
  embed: { model: string; dimensions: number; usdPerMTokens: number; maxBatch: number };
}

const KEY_FOR: Record<Exclude<Provider, 'workers-ai'>, keyof Env> = {
  'google-ai-studio': 'GOOGLE_AI_STUDIO_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENAI_API_KEY',
};

export function loadRoutes(env: Pick<Env, 'MODEL_ROUTES'>): RoutesConfig {
  const base = defaults as unknown as RoutesConfig;
  if (!env.MODEL_ROUTES) return base;
  try {
    const o = JSON.parse(env.MODEL_ROUTES) as Partial<RoutesConfig>;
    return {
      byok: o.byok ?? base.byok,
      tasks: { ...base.tasks, ...(o.tasks ?? {}) },
      models: { ...base.models, ...(o.models ?? {}) },
      transcribe: { ...base.transcribe, ...(o.transcribe ?? {}) },
      embed: { ...base.embed, ...(o.embed ?? {}) },
    };
  } catch {
    return base;
  }
}

/** Whether a model can be called with the secrets this deployment has. */
export function modelAvailable(env: Env, routes: RoutesConfig, cfg: ModelConfig): boolean {
  if (cfg.provider === 'workers-ai') return true;
  if (routes.byok && env.CF_AIG_TOKEN) return true;
  return Boolean(env[KEY_FOR[cfg.provider]]);
}

export interface ImageInput {
  mime: string;
  base64: string;
}

export interface GenerateRequest<T> {
  task: TaskName;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  images?: ImageInput[];
  itemId?: string | null;
  /** Override the task's temperature, e.g. to vary a regeneration. */
  temperature?: number;
}

export interface GenerateResult<T> {
  data: T;
  modelKey: string;
  model: string;
  costUsd: number;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

interface RawAnswer {
  content: unknown;
  inputTokens: number;
  outputTokens: number;
}

export class ModelError extends Error {}

function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

async function callWorkersAi(env: Env, cfg: ModelConfig, messages: ChatMessage[], task: TaskConfig, temperature: number, schema: Record<string, unknown> | null): Promise<RawAnswer> {
  const input: Record<string, unknown> = { messages, max_tokens: task.maxTokens, temperature };
  if (cfg.thinking === false) input.chat_template_kwargs = { thinking: false, enable_thinking: false };
  if (schema && cfg.json === 'schema') input.response_format = { type: 'json_schema', json_schema: schema };
  else if (cfg.json !== 'prompt') input.response_format = { type: 'json_object' };
  const out = (await runWorkersAi(env, cfg.model, input, { skipCache: false })) as Record<string, unknown>;
  return parseAnswer(out);
}

/**
 * Whether the configured gateway was found missing in this isolate. Workers AI refuses a gateway id
 * that does not exist (error 2001); calls then go direct so the pipeline keeps running, the ledger
 * marks them, and the Desk's settings page says the gateway needs creating.
 */
export const gatewayState = { missing: false };

const isMissingGateway = (e: unknown) => /2001|configure AI Gateway/i.test(errorMessage(e));

/** A Workers AI call that never answers must fail (and be retried), not hang the step. */
export const AI_TIMEOUT_MS = 150_000;

function timed<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new ModelError(`${what} did not answer within ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

export async function runWorkersAi(env: Env, model: string, input: Record<string, unknown>, gw: Record<string, unknown> = {}): Promise<unknown> {
  return timed(runWorkersAiRaw(env, model, input, gw), AI_TIMEOUT_MS, model);
}

async function runWorkersAiRaw(env: Env, model: string, input: Record<string, unknown>, gw: Record<string, unknown> = {}): Promise<unknown> {
  if (env.AI_GATEWAY_ID && !gatewayState.missing) {
    try {
      return await env.AI.run(model as never, input as never, { gateway: { id: env.AI_GATEWAY_ID, ...gw } } as never);
    } catch (e) {
      if (!isMissingGateway(e)) throw e;
      gatewayState.missing = true;
      console.warn(JSON.stringify({ event: 'ai-gateway-missing', gateway: env.AI_GATEWAY_ID }));
    }
  }
  return env.AI.run(model as never, input as never);
}

const wai = () => (gatewayState.missing ? 'workers-ai-direct' : 'workers-ai');

async function callGateway(env: Env, routes: RoutesConfig, cfg: ModelConfig, messages: ChatMessage[], task: TaskConfig, temperature: number, schema: Record<string, unknown> | null): Promise<RawAnswer> {
  if (!env.CF_ACCOUNT_ID || !env.AI_GATEWAY_ID) throw new FatalError('CF_ACCOUNT_ID and AI_GATEWAY_ID must be set to reach external models');
  const url = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/compat/chat/completions`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (env.CF_AIG_TOKEN) headers['cf-aig-authorization'] = `Bearer ${env.CF_AIG_TOKEN}`;
  if (!(routes.byok && env.CF_AIG_TOKEN) && cfg.provider !== 'workers-ai') {
    const key = env[KEY_FOR[cfg.provider]];
    if (typeof key === 'string' && key) headers.authorization = `Bearer ${key}`;
  }
  const body: Record<string, unknown> = {
    model: `${cfg.provider}/${cfg.model}`,
    messages,
    max_tokens: task.maxTokens,
    temperature,
  };
  if (schema && cfg.json === 'schema') body.response_format = { type: 'json_schema', json_schema: { name: 'answer', schema, strict: false } };
  else if (cfg.json === 'object') body.response_format = { type: 'json_object' };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new ModelError(`${cfg.provider} ${res.status}: ${text.slice(0, 300)}`);
  return parseAnswer(JSON.parse(text) as Record<string, unknown>);
}

function parseAnswer(out: Record<string, unknown>): RawAnswer {
  const usage = (out.usage ?? {}) as Record<string, number>;
  let content: unknown = out.response;
  const choices = out.choices as Array<{ message?: { content?: unknown; reasoning_content?: unknown } }> | undefined;
  if (content === undefined && choices?.[0]?.message) content = choices[0].message.content ?? null;
  return {
    content,
    inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
  };
}

/** Pull a JSON value out of a model answer: an object, a string of JSON, or JSON inside fences or prose. */
export function extractJson(content: unknown): unknown {
  if (content && typeof content === 'object') return content;
  if (typeof content !== 'string') throw new ModelError('empty answer');
  const s = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new ModelError('answer was not JSON');
  }
}

function costOf(cfg: ModelConfig, a: RawAnswer): number {
  return (a.inputTokens * cfg.inUsdPerM + a.outputTokens * cfg.outUsdPerM) / 1_000_000;
}

export async function generateJson<T>(env: Env, req: GenerateRequest<T>): Promise<GenerateResult<T>> {
  const routes = loadRoutes(env);
  const task = routes.tasks[req.task];
  if (!task) throw new FatalError(`No route for task "${req.task}"`);
  const schema = jsonSchemaFor(req.schema);
  const temperature = req.temperature ?? task.temperature;
  const failures: string[] = [];

  for (const key of task.chain) {
    const cfg = routes.models[key];
    if (!cfg) continue;
    if (!modelAvailable(env, routes, cfg)) continue;
    if (req.images?.length && !cfg.vision) continue;

    const system = `${req.system}\n\nAnswer with one JSON object only, matching this JSON schema:\n${JSON.stringify(schema)}`;
    const userContent: ChatMessage['content'] = req.images?.length
      ? [{ type: 'text', text: req.prompt }, ...req.images.map((im) => ({ type: 'image_url' as const, image_url: { url: `data:${im.mime};base64,${im.base64}` } }))]
      : req.prompt;
    let messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ];

    for (let attempt = 0; attempt < 2; attempt++) {
      await assertBudget(env);
      const started = Date.now();
      let answer: RawAnswer | null = null;
      try {
        answer =
          cfg.provider === 'workers-ai'
            ? await callWorkersAi(env, cfg, messages, task, temperature, schema)
            : await callGateway(env, routes, cfg, messages, task, temperature, schema);
        const parsed = extractJson(answer.content);
        const result = req.schema.safeParse(parsed);
        const costUsd = costOf(cfg, answer);
        if (result.success) {
          await recordCall(env, { task: req.task, provider: cfg.provider === 'workers-ai' ? wai() : cfg.provider, model: cfg.model, itemId: req.itemId, inputTokens: answer.inputTokens, outputTokens: answer.outputTokens, costUsd, latencyMs: Date.now() - started, ok: true });
          return { data: result.data, modelKey: key, model: cfg.model, costUsd };
        }
        const problem = result.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
        await recordCall(env, { task: req.task, provider: cfg.provider === 'workers-ai' ? wai() : cfg.provider, model: cfg.model, itemId: req.itemId, inputTokens: answer.inputTokens, outputTokens: answer.outputTokens, costUsd, latencyMs: Date.now() - started, ok: false, error: `schema: ${problem}` });
        failures.push(`${key}: schema (${problem})`);
        // One repair attempt with the validation errors.
        messages = [
          ...messages,
          { role: 'assistant', content: typeof answer.content === 'string' ? answer.content : JSON.stringify(answer.content) },
          { role: 'user', content: `That JSON did not match the schema: ${problem}. Reply again with the corrected JSON object only.` },
        ];
      } catch (e) {
        if (e instanceof FatalError) throw e;
        const msg = errorMessage(e);
        await recordCall(env, {
          task: req.task,
          provider: cfg.provider === 'workers-ai' ? wai() : cfg.provider,
          model: cfg.model,
          itemId: req.itemId,
          inputTokens: answer?.inputTokens,
          outputTokens: answer?.outputTokens,
          costUsd: answer ? costOf(cfg, answer) : 0,
          latencyMs: Date.now() - started,
          ok: false,
          error: msg,
        });
        failures.push(`${key}: ${msg.slice(0, 200)}`);
        break; // transport or parse failure: move to the next model
      }
    }
  }
  throw new ModelError(`Every model for "${req.task}" failed. ${failures.join(' | ')}`);
}

export interface TranscriptSegment {
  /** Seconds from the start of the audio that was sent. */
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  text: string;
  seconds: number;
  costUsd: number;
  segments: TranscriptSegment[];
}

/** Speech to text with Workers AI Whisper (through the gateway), recorded in the ledger. Segments carry timestamps. */
export async function transcribeAudio(env: Env, audio: Uint8Array, opts: { itemId?: string | null; seconds?: number; language?: string; hints?: readonly string[] } = {}): Promise<Transcript> {
  const routes = loadRoutes(env);
  await assertBudget(env);
  const started = Date.now();
  const { toBase64 } = await import('../util');
  try {
    const out = (await runWorkersAi(env, routes.transcribe.model, {
      audio: toBase64(audio),
      task: 'transcribe',
      vad_filter: true,
      ...(opts.language ? { language: opts.language } : {}),
      // Whisper reads about 224 tokens of initial prompt; spelled-out names fix recurring garbles.
      ...(opts.hints?.length ? { initial_prompt: hintPrompt(opts.hints) } : {}),
    })) as { text?: string; transcription_info?: { duration?: number }; segments?: Array<{ start?: number; end?: number; text?: string }> };
    const segments: TranscriptSegment[] = (out.segments ?? [])
      .filter((s) => typeof s.text === 'string' && s.text.trim())
      .map((s) => ({ start: Number(s.start ?? 0), end: Number(s.end ?? s.start ?? 0), text: s.text!.trim() }));
    const seconds = out.transcription_info?.duration ?? segments.at(-1)?.end ?? opts.seconds ?? 0;
    const costUsd = (seconds / 60) * routes.transcribe.usdPerAudioMinute;
    await recordCall(env, { task: 'transcribe', provider: wai(), model: routes.transcribe.model, itemId: opts.itemId, audioSeconds: seconds, costUsd, latencyMs: Date.now() - started, ok: true });
    return { text: (out.text ?? '').trim(), seconds, costUsd, segments };
  } catch (e) {
    await recordCall(env, { task: 'transcribe', provider: wai(), model: routes.transcribe.model, itemId: opts.itemId, costUsd: 0, latencyMs: Date.now() - started, ok: false, error: errorMessage(e) });
    throw e;
  }
}

/** Proper nouns for Whisper's initial prompt, most useful first, kept well under its token window. */
export function hintPrompt(hints: readonly string[], maxChars = 600): string {
  let out = '';
  for (const h of hints) {
    const next = out ? `${out}, ${h}` : h;
    if (next.length > maxChars) break;
    out = next;
  }
  return out ? `${out}.` : '';
}

/** Rough token count for embedding cost: about four characters a token for English. */
const approxTokens = (s: string) => Math.ceil(s.length / 4);

/**
 * Embed texts with Workers AI (bge-m3 by default), in batches, through the gateway, recorded in the
 * ledger. Returns one vector per input, in order.
 */
export async function embedTexts(env: Env, texts: string[], opts: { itemId?: string | null } = {}): Promise<{ vectors: number[][]; model: string; costUsd: number }> {
  const routes = loadRoutes(env);
  const { model, maxBatch, usdPerMTokens, dimensions } = routes.embed;
  const vectors: number[][] = [];
  let costUsd = 0;
  for (let i = 0; i < texts.length; i += maxBatch) {
    const batch = texts.slice(i, i + maxBatch);
    await assertBudget(env);
    const started = Date.now();
    try {
      const out = (await runWorkersAi(env, model, { text: batch })) as { data?: number[][]; shape?: number[]; usage?: { prompt_tokens?: number } };
      const data = out.data ?? [];
      if (data.length !== batch.length || data.some((v) => v.length !== dimensions)) throw new ModelError(`embedding answer had ${data.length} vectors of ${data[0]?.length ?? 0} dims; expected ${batch.length} of ${dimensions}`);
      const tokens = out.usage?.prompt_tokens ?? batch.reduce((n, t) => n + approxTokens(t), 0);
      const cost = (tokens * usdPerMTokens) / 1_000_000;
      costUsd += cost;
      await recordCall(env, { task: 'embed', provider: wai(), model, itemId: opts.itemId, inputTokens: tokens, costUsd: cost, latencyMs: Date.now() - started, ok: true });
      vectors.push(...data);
    } catch (e) {
      await recordCall(env, { task: 'embed', provider: wai(), model, itemId: opts.itemId, costUsd: 0, latencyMs: Date.now() - started, ok: false, error: errorMessage(e) });
      throw e;
    }
  }
  return { vectors, model, costUsd };
}

/** For the settings screen: which models each task would use right now. Never exposes secrets. */
export function describeRoutes(env: Env) {
  const routes = loadRoutes(env);
  return {
    gatewayMissing: gatewayState.missing,
    byok: routes.byok,
    transcribe: routes.transcribe,
    embed: routes.embed,
    tasks: Object.fromEntries(
      Object.entries(routes.tasks).map(([name, t]) => [
        name,
        t.chain.map((key) => {
          const cfg = routes.models[key];
          return { key, provider: cfg?.provider ?? 'unknown', model: cfg?.model ?? 'unknown', available: cfg ? modelAvailable(env, routes, cfg) : false };
        }),
      ]),
    ),
  };
}

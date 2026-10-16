// The model router. Tasks map to a chain of models in routes.json, so providers and models change by
// config. Each provider has a native adapter in ./providers (Gemini generateContent, the Claude
// Messages API, DeepSeek and Z.ai chat completions, Workers AI through the AI binding), reached
// through Cloudflare AI Gateway's provider endpoints where the gateway supports the provider.
// Capabilities (vision, PDF, JSON schema, thinking, caching, limits) and prices are declared per
// model in routes.json. Outputs are JSON, validated against a zod schema; an invalid answer gets one
// repair turn, then the next model in the chain is tried. The spend ceiling is checked before every
// call against the worst case that call could cost.

import { z } from 'zod';
import type { Env } from '../env';
import defaults from './routes.json';
import { assertBudget, recordCall } from '../spend';
import { errorMessage, FatalError } from '../util';
import { costOf, worstCaseCost } from './cost';
import { gatewaySlug, gatewayState } from './gateway';
import { ProviderError } from './http';
import { callAnthropic } from './providers/anthropic';
import { callDeepseek } from './providers/deepseek';
import { callGemini } from './providers/gemini';
import { callWorkersAi, runWorkersAi, wai } from './providers/workers-ai';
import { callZai } from './providers/zai';
import { jsonSchemaFor } from './schema';
import {
  approxTokens,
  ModelError,
  type DocumentInput,
  type ImageInput,
  type ModelConfig,
  type Provider,
  type ProviderAnswer,
  type ProviderRequest,
  type RoutesConfig,
  type TaskName,
  type Usage,
} from './types';

export * from './types';
export { gatewayState } from './gateway';
export { runWorkersAi, AI_TIMEOUT_MS } from './providers/workers-ai';
export { costOf } from './cost';

const KEY_FOR: Record<Exclude<Provider, 'workers-ai'>, keyof Env> = {
  'google-ai-studio': 'GOOGLE_AI_STUDIO_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  zai: 'ZAI_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENAI_API_KEY',
};

type LegacyModel = Partial<ModelConfig> & { inUsdPerM?: number; outUsdPerM?: number };

/** Accept the older flat price fields in a MODEL_ROUTES override. */
function normaliseModel(m: LegacyModel): ModelConfig {
  const prices = m.prices ?? { in: m.inUsdPerM ?? 0, out: m.outUsdPerM ?? 0 };
  const { inUsdPerM: _i, outUsdPerM: _o, ...rest } = m;
  return { json: 'prompt', ...rest, prices } as ModelConfig;
}

export function loadRoutes(env: Pick<Env, 'MODEL_ROUTES'>): RoutesConfig {
  const base = defaults as unknown as RoutesConfig;
  if (!env.MODEL_ROUTES) return base;
  try {
    const o = JSON.parse(env.MODEL_ROUTES) as Partial<Omit<RoutesConfig, 'models'>> & { models?: Record<string, LegacyModel> };
    const models = { ...base.models };
    for (const [k, m] of Object.entries(o.models ?? {})) models[k] = normaliseModel({ ...(base.models[k] ?? {}), ...m });
    return {
      byok: o.byok ?? base.byok,
      gateway: { ...base.gateway, ...(o.gateway ?? {}) },
      tasks: { ...base.tasks, ...(o.tasks ?? {}) },
      models,
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
  if (env[KEY_FOR[cfg.provider]]) return true;
  // BYOK: the gateway holds the key, so it must be reachable through the gateway.
  return Boolean(routes.byok && env.CF_AIG_TOKEN && env.AI_GATEWAY_ID && gatewaySlug(routes, cfg.provider));
}

export type { ImageInput, DocumentInput };

export interface GenerateRequest<T> {
  task: TaskName;
  system: string;
  /**
   * The long part of the prompt that repeats across calls (item header, source text). Sent before
   * `prompt` and marked for prompt caching where the provider supports it.
   */
  context?: string;
  prompt: string;
  schema: z.ZodType<T>;
  images?: ImageInput[];
  /** Source files (PDFs) for models that read them natively; others get only the text. */
  documents?: DocumentInput[];
  /** Skip models that cannot read the documents (OCR of a scanned PDF has no text to fall back on). */
  requireDocuments?: boolean;
  itemId?: string | null;
  /** Override the task's temperature, e.g. to vary a regeneration. */
  temperature?: number;
  /** Override the task's answer budget, e.g. for a many-page transcription. */
  maxTokens?: number;
}

export interface GenerateResult<T> {
  data: T;
  modelKey: string;
  model: string;
  costUsd: number;
}

export { ModelError };

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

function callModel(env: Env, routes: RoutesConfig, req: ProviderRequest): Promise<ProviderAnswer> {
  switch (req.cfg.provider) {
    case 'workers-ai':
      return callWorkersAi(env, req);
    case 'google-ai-studio':
      return callGemini(env, routes, req);
    case 'anthropic':
      return callAnthropic(env, routes, req);
    case 'deepseek':
      return callDeepseek(env, routes, req);
    case 'zai':
      return callZai(env, routes, req);
    default:
      throw new ModelError(`No adapter for provider "${req.cfg.provider}"`);
  }
}

/** Tokens a page or image may cost at most, for the pre-call spend check. */
const WORST_PAGE_TOKENS = 3500;
const WORST_IMAGE_TOKENS = 5000;

/** Output a call could spend: the answer's budget plus the largest thinking allowance any adapter adds. */
function worstOutputTokens(cfg: ModelConfig, maxTokens: number, thinking: string): number {
  if (cfg.thinking === 'none') return maxTokens;
  return maxTokens + (thinking === 'off' ? 3000 : 24000);
}

/** Documents a model may take for this task, or null when the model must be skipped. */
function documentsFor(cfg: ModelConfig, docs: DocumentInput[], wanted: boolean, required: boolean): DocumentInput[] | null {
  if (!docs.length || !wanted) return required ? null : [];
  const fits = cfg.pdf && docs.every((d) => d.pages <= (cfg.pdfMaxPages ?? 100));
  if (fits) return docs;
  return required ? null : [];
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
    const documents = documentsFor(cfg, req.documents ?? [], task.pdf !== false, Boolean(req.requireDocuments));
    if (!documents) continue;
    const provider = cfg.provider === 'workers-ai' ? wai() : cfg.provider;

    const base: ProviderRequest = {
      modelKey: key,
      cfg,
      task: req.task,
      itemId: req.itemId,
      system: req.system,
      context: req.context,
      prompt: req.prompt,
      images: req.images ?? [],
      documents,
      schema,
      maxTokens: req.maxTokens ?? task.maxTokens,
      temperature,
      thinking: task.thinking ?? 'off',
      mediaResolution: task.mediaResolution,
    };
    let preq = base;

    for (let attempt = 0; attempt < 2; attempt++) {
      const inTokens =
        approxTokens(preq.system + (preq.context ?? '') + preq.prompt + (preq.repair?.previous ?? '')) +
        approxTokens(JSON.stringify(schema)) +
        documents.reduce((n, d) => n + d.pages * WORST_PAGE_TOKENS, 0) +
        preq.images.length * WORST_IMAGE_TOKENS;
      await assertBudget(env, worstCaseCost(cfg.prices, inTokens, worstOutputTokens(cfg, base.maxTokens, base.thinking)), `${req.task} on ${key}`);
      const started = Date.now();
      let answer: ProviderAnswer | null = null;
      const record = (ok: boolean, usage: Usage | undefined, error?: string) =>
        recordCall(env, {
          task: req.task,
          provider,
          model: cfg.model,
          itemId: req.itemId,
          inputTokens: usage?.inputTokens,
          cachedInputTokens: usage?.cachedInputTokens,
          cacheWriteTokens: usage?.cacheWriteTokens,
          outputTokens: usage?.outputTokens,
          reasoningTokens: usage?.reasoningTokens,
          costUsd: usage ? costOf(cfg.prices, usage) : 0,
          latencyMs: Date.now() - started,
          ok,
          error,
        });
      try {
        answer = await callModel(env, routes, preq);
        if (answer.finish === 'length') throw new ModelError(`answer cut off at the output limit (${answer.usage.outputTokens} tokens, ${answer.usage.reasoningTokens} reasoning)`);
        if (answer.finish === 'filter' || answer.finish === 'refusal') throw new ModelError(`the model declined to answer (${answer.finish})`);
        const parsed = extractJson(answer.content);
        const result = req.schema.safeParse(parsed);
        const costUsd = costOf(cfg.prices, answer.usage);
        if (result.success) {
          await record(true, answer.usage);
          return { data: result.data, modelKey: key, model: cfg.model, costUsd };
        }
        const problem = result.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
        await record(false, answer.usage, `schema: ${problem}`);
        failures.push(`${key}: schema (${problem})`);
        // One repair turn with the validation errors; the stable prefix is unchanged, so it caches.
        preq = { ...base, repair: { previous: typeof answer.content === 'string' ? answer.content : JSON.stringify(answer.content), problem } };
      } catch (e) {
        if (e instanceof FatalError) throw e;
        const msg = errorMessage(e);
        await record(false, answer?.usage, msg);
        failures.push(`${key}: ${msg.slice(0, 200)}`);
        if (e instanceof ProviderError) console.warn(JSON.stringify({ event: 'model-call-failed', task: req.task, model: key, status: e.status, retryable: e.retryable }));
        break; // transport, refusal or parse failure: move to the next model
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
          return {
            key,
            provider: cfg?.provider ?? 'unknown',
            model: cfg?.model ?? 'unknown',
            available: cfg ? modelAvailable(env, routes, cfg) : false,
            viaGateway: cfg ? cfg.provider === 'workers-ai' || Boolean(env.AI_GATEWAY_ID && gatewaySlug(routes, cfg.provider)) : false,
            thinking: cfg && cfg.thinking !== 'none' ? (t.thinking ?? 'off') : 'none',
            prices: cfg?.prices,
          };
        }),
      ]),
    ),
  };
}

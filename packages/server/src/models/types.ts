// Types shared by the router and the provider adapters. Capabilities and prices are declared per
// model in routes.json; adapters read them, never hard-code them.

export type Provider = 'workers-ai' | 'google-ai-studio' | 'deepseek' | 'anthropic' | 'zai' | 'openai' | 'openrouter';
export type TaskName = 'read' | 'draft' | 'judge' | 'clean' | 'ocr' | 'haul' | 'plate' | 'connect' | 'thread' | 'bridge';

/** How hard a model may think. 'off' asks for no reasoning where the model allows it. */
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';
export type MediaResolution = 'low' | 'medium' | 'high';

export class ModelError extends Error {}

export interface Prices {
  /** USD per million uncached input tokens. */
  in: number;
  /** USD per million input tokens read from a cache (defaults to `in`). */
  cachedIn?: number;
  /** USD per million input tokens written to a cache (Anthropic charges extra; defaults to `in`). */
  cacheWrite?: number;
  /** USD per million output tokens. */
  out: number;
  /** USD per million reasoning tokens, when they are priced apart from output (defaults to `out`). */
  reasoning?: number;
  /** Prices for long prompts, from this many input tokens on (Claude Haiku above 100k, for one). */
  longAbove?: number;
  long?: Omit<Prices, 'longAbove' | 'long'>;
}

export interface ModelConfig {
  provider: Provider;
  model: string;
  prices: Prices;
  /** How to ask for JSON: a JSON schema enforced by the provider, JSON-object mode, or only by prompt. */
  json: 'schema' | 'object' | 'prompt';
  vision?: boolean;
  /** Native PDF input. */
  pdf?: boolean;
  /** Most PDF pages we will send inline; longer PDFs go as extracted text only. */
  pdfMaxPages?: number;
  /** Whether the model reasons: 'none', 'optional' (can be turned off) or 'always'. */
  thinking?: 'none' | 'optional' | 'always';
  /** Prompt caching: 'auto' (provider caches shared prefixes), 'explicit' (we mark blocks), or 'none'. */
  caching?: 'auto' | 'explicit' | 'none';
  /** Fewest tokens a cache entry can hold; shorter prefixes are not marked. */
  minCacheTokens?: number;
  /** Context window and output ceiling, in tokens. */
  maxContext?: number;
  maxOutput?: number;
  /** Whether the API accepts a temperature (Claude 5 models refuse non-default values). */
  temperature?: boolean;
}

export interface TaskConfig {
  chain: string[];
  /** Tokens for the answer itself; any thinking budget is added on top. */
  maxTokens: number;
  temperature: number;
  maxInputChars: number;
  vision?: boolean;
  thinking?: ThinkingLevel;
  /** Attach the source PDF when the item has one and the model reads PDFs. */
  pdf?: boolean;
  /** Detail at which providers that offer a choice should look at images and PDF pages. */
  mediaResolution?: MediaResolution;
}

export interface RoutesConfig {
  byok: boolean;
  /** Gateway route per provider: a built-in provider slug, a custom provider ("custom-zai"), or null to call it directly. */
  gateway: Partial<Record<Provider, string | null>>;
  tasks: Record<TaskName, TaskConfig>;
  models: Record<string, ModelConfig>;
  transcribe: { model: string; usdPerAudioMinute: number };
  embed: { model: string; dimensions: number; usdPerMTokens: number; maxBatch: number };
}

export interface ImageInput {
  mime: string;
  base64: string;
}

/** Largest PDF sent inline: Gemini caps a whole request at 20 MB and base64 adds a third. */
export const MAX_INLINE_PDF_BYTES = 14 * 1024 * 1024;

export interface DocumentInput {
  mime: 'application/pdf';
  base64: string;
  pages: number;
  /** Shown to models that cannot take the file. */
  name?: string;
}

/** What every adapter is given. Stable parts first, so prefix caches hit on the second call. */
export interface ProviderRequest {
  modelKey: string;
  cfg: ModelConfig;
  task: string;
  itemId?: string | null;
  /** System prompt plus the schema instructions; stable across calls for a task. */
  system: string;
  /** Long block that repeats across calls (the source, the item header); cached where the provider allows. */
  context?: string;
  /** The part that changes between calls. */
  prompt: string;
  images: ImageInput[];
  documents: DocumentInput[];
  /** JSON schema of the answer, before any provider-specific trimming. */
  schema: Record<string, unknown>;
  maxTokens: number;
  temperature: number;
  thinking: ThinkingLevel;
  mediaResolution?: MediaResolution;
  /** A previous answer that failed validation, and why, for one repair turn. */
  repair?: { previous: string; problem: string };
}

export interface Usage {
  /** All input tokens, cached or not. */
  inputTokens: number;
  /** Of those, read from a cache. */
  cachedInputTokens: number;
  /** Of those, written to a cache (billed at the cache-write price). */
  cacheWriteTokens: number;
  /** All output tokens, reasoning included. */
  outputTokens: number;
  /** Of those, spent reasoning. */
  reasoningTokens: number;
}

export interface ProviderAnswer {
  /** The answer: JSON text, or an already-parsed value. */
  content: unknown;
  usage: Usage;
  /** Normalised finish reason: stop, length, refusal, filter, or the provider's own word. */
  finish: string;
}

export const emptyUsage = (): Usage => ({ inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 });

/** About four characters a token for English; used only to decide whether caching is worth marking. */
export const approxTokens = (s: string) => Math.ceil(s.length / 4);

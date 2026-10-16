// Claude through the Messages API (docs: platform.claude.com/docs, checked 2026-10-16; see docs/MODELS.md).
// JSON comes from structured outputs (output_config.format, GA). The system prompt and the long
// stable context carry cache_control breakpoints, so a redraft or repair that resends the same
// source reads it from the cache at a tenth of the input price. PDFs and images go as document and
// image blocks. Claude 5 models refuse a non-default temperature, so none is sent when the model
// config says so. Thinking is adaptive with an effort level; 'off' disables it.

import type { Env } from '../../env';
import { callProvider } from '../gateway';
import { ANTHROPIC_SCHEMA, trimSchema } from '../schema';
import { approxTokens, ModelError, type ProviderAnswer, type ProviderRequest, type RoutesConfig, type ThinkingLevel } from '../types';

export const ANTHROPIC_BASE = 'https://api.anthropic.com';
export const ANTHROPIC_VERSION = '2023-06-01';

/** Output tokens set aside for adaptive thinking, on top of the answer's own budget. */
const THINKING_ALLOWANCE: Record<ThinkingLevel, number> = { off: 0, low: 4000, medium: 8000, high: 16000 };

type Block = Record<string, unknown>;
const ephemeral = { type: 'ephemeral' } as const;

export function anthropicBody(req: ProviderRequest): Record<string, unknown> {
  const { cfg } = req;
  const cacheable = cfg.caching === 'explicit';
  const minCache = cfg.minCacheTokens ?? 1024;

  const system: Block[] = [{ type: 'text', text: req.system }];
  if (cacheable && approxTokens(req.system) >= minCache) system[0]!.cache_control = ephemeral;

  const content: Block[] = [];
  for (const d of req.documents) content.push({ type: 'document', source: { type: 'base64', media_type: d.mime, data: d.base64 } });
  for (const im of req.images) content.push({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.base64 } });
  if (req.context) {
    const block: Block = { type: 'text', text: req.context };
    // One breakpoint after everything stable (system, files, context): the prefix up to here is cached.
    if (cacheable && approxTokens(req.system + req.context) + req.documents.length * 1500 >= minCache) block.cache_control = ephemeral;
    content.push(block);
  } else if (cacheable && req.documents.length) {
    // Files with no context block: cache through the last file.
    (content[req.documents.length - 1] as Block).cache_control = ephemeral;
  }
  content.push({ type: 'text', text: req.prompt });

  const messages: Array<{ role: 'user' | 'assistant'; content: Block[] | string }> = [{ role: 'user', content }];
  if (req.repair) {
    messages.push({ role: 'assistant', content: req.repair.previous });
    messages.push({ role: 'user', content: `That JSON did not match the schema: ${req.repair.problem}. Reply again with the corrected JSON object only.` });
  }

  const thinks = cfg.thinking !== 'none';
  const level = thinks ? req.thinking : 'off';
  const allowance = THINKING_ALLOWANCE[level === 'off' && cfg.thinking === 'always' ? 'low' : level];
  const maxTokens = Math.min(req.maxTokens + allowance, cfg.maxOutput ?? 64_000);

  const outputConfig: Record<string, unknown> = {};
  if (cfg.json === 'schema') outputConfig.format = { type: 'json_schema', schema: trimSchema(req.schema, ANTHROPIC_SCHEMA) };
  const body: Record<string, unknown> = { model: cfg.model, max_tokens: maxTokens, system, messages };
  if (thinks) {
    // Sonnet 5.5 refuses thinking: disabled; such models get adaptive thinking at low effort.
    if (level === 'off' && cfg.thinking === 'optional') body.thinking = { type: 'disabled' };
    else {
      body.thinking = { type: 'adaptive' };
      outputConfig.effort = level === 'off' ? 'low' : level;
    }
  }
  if (Object.keys(outputConfig).length) body.output_config = outputConfig;
  if (cfg.temperature !== false) body.temperature = req.temperature;
  return body;
}

export function parseAnthropic(json: Record<string, unknown>): ProviderAnswer {
  const blocks = (json.content ?? []) as Array<{ type: string; text?: string }>;
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  const u = (json.usage ?? {}) as Record<string, number>;
  const read = u.cache_read_input_tokens ?? 0;
  const written = u.cache_creation_input_tokens ?? 0;
  // input_tokens counts only what came after the last cache breakpoint.
  const inputTokens = (u.input_tokens ?? 0) + read + written;
  const stop = String(json.stop_reason ?? '');
  const finish = stop === 'end_turn' || stop === 'stop_sequence' ? 'stop' : stop === 'max_tokens' || stop === 'model_context_window_exceeded' ? 'length' : stop;
  return {
    content: text,
    // Thinking is billed inside output_tokens; Claude does not report it apart.
    usage: { inputTokens, cachedInputTokens: read, cacheWriteTokens: written, outputTokens: u.output_tokens ?? 0, reasoningTokens: 0 },
    finish,
  };
}

export async function callAnthropic(env: Env, routes: RoutesConfig, req: ProviderRequest): Promise<ProviderAnswer> {
  const headers: Record<string, string> = { 'anthropic-version': ANTHROPIC_VERSION };
  if (env.ANTHROPIC_API_KEY) headers['x-api-key'] = env.ANTHROPIC_API_KEY;
  const json = await callProvider(env, routes, { provider: 'anthropic', directBase: ANTHROPIC_BASE, path: '/v1/messages', headers, body: anthropicBody(req), task: req.task, itemId: req.itemId });
  if (json.type === 'error') throw new ModelError(`anthropic: ${JSON.stringify(json.error).slice(0, 300)}`);
  return parseAnthropic(json);
}

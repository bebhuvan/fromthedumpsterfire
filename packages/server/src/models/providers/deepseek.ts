// DeepSeek through its chat-completions API (docs: api-docs.deepseek.com, checked 2026-10-16; see
// docs/MODELS.md). JSON-object mode (no JSON schema; the schema is in the prompt and zod checks the
// answer). Thinking is a request parameter, on by default, so 'off' must be sent explicitly; its
// reasoning_content is dropped, never sent back. Disk caching is automatic: usage reports
// prompt_cache_hit_tokens. deepseek-flash takes images; no model takes PDFs.

import type { Env } from '../../env';
import { callProvider } from '../gateway';
import type { ProviderAnswer, ProviderRequest, RoutesConfig, ThinkingLevel } from '../types';
import { chatContent, chatMessages } from './openai-chat';

export const DEEPSEEK_BASE = 'https://api.deepseek.com';

const EFFORT: Record<Exclude<ThinkingLevel, 'off'>, string> = { low: 'low', medium: 'high', high: 'high' };
/** max_tokens covers reasoning too, so the answer gets this on top. */
const THINKING_ALLOWANCE: Record<ThinkingLevel, number> = { off: 0, low: 6000, medium: 12000, high: 24000 };

export function deepseekBody(req: ProviderRequest): Record<string, unknown> {
  const { cfg } = req;
  const thinks = cfg.thinking !== 'none';
  const level = thinks ? req.thinking : 'off';
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: chatMessages(req, { schemaInPrompt: true }),
    max_tokens: Math.min(req.maxTokens + THINKING_ALLOWANCE[level], cfg.maxOutput ?? 384_000),
    stream: false,
  };
  if (cfg.json !== 'prompt') body.response_format = { type: 'json_object' };
  if (thinks) {
    if (level === 'off') body.thinking = { type: 'disabled' };
    else {
      body.thinking = { type: 'enabled' };
      body.reasoning_effort = EFFORT[level];
    }
  }
  // Temperature is ignored in thinking mode; send it only when the model is not thinking.
  if (level === 'off' && cfg.temperature !== false) body.temperature = req.temperature;
  return body;
}

export function parseDeepseek(json: Record<string, unknown>): ProviderAnswer {
  const { content, finish } = chatContent(json, 'deepseek');
  const u = (json.usage ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' ? v : 0);
  const details = (u.completion_tokens_details ?? {}) as Record<string, unknown>;
  const promptDetails = (u.prompt_tokens_details ?? {}) as Record<string, unknown>;
  return {
    content,
    usage: {
      inputTokens: n(u.prompt_tokens),
      cachedInputTokens: n(u.prompt_cache_hit_tokens) || n(promptDetails.cached_tokens),
      cacheWriteTokens: 0,
      outputTokens: n(u.completion_tokens),
      reasoningTokens: n(details.reasoning_tokens),
    },
    finish,
  };
}

export async function callDeepseek(env: Env, routes: RoutesConfig, req: ProviderRequest): Promise<ProviderAnswer> {
  const headers: Record<string, string> = {};
  if (env.DEEPSEEK_API_KEY) headers.authorization = `Bearer ${env.DEEPSEEK_API_KEY}`;
  const json = await callProvider(env, routes, { provider: 'deepseek', directBase: DEEPSEEK_BASE, path: '/chat/completions', headers, body: deepseekBody(req), task: req.task, itemId: req.itemId });
  return parseDeepseek(json);
}

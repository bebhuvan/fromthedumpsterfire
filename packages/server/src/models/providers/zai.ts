// Z.ai GLM through its chat-completions API (docs: docs.z.ai, checked 2026-10-16; see
// docs/MODELS.md). AI Gateway has no built-in Z.ai provider, so calls go straight to
// api.z.ai unless routes.json names a gateway custom provider (e.g. "custom-zai", created in the
// dashboard with base URL https://api.z.ai). JSON-object mode with the schema in the prompt.
// Thinking is `thinking: {type}`; GLM-5.3 models cannot disable it, so 'off' asks for the lowest
// reasoning effort instead. Caching is automatic and reported as prompt_tokens_details.cached_tokens.

import type { Env } from '../../env';
import { callProvider } from '../gateway';
import type { ProviderAnswer, ProviderRequest, RoutesConfig, ThinkingLevel } from '../types';
import { chatContent, chatMessages } from './openai-chat';

export const ZAI_BASE = 'https://api.z.ai';
export const ZAI_PATH = '/api/paas/v4/chat/completions';

const EFFORT: Record<ThinkingLevel, string> = { off: 'low', low: 'low', medium: 'high', high: 'high' };
const THINKING_ALLOWANCE: Record<ThinkingLevel, number> = { off: 3000, low: 6000, medium: 12000, high: 24000 };

export function zaiBody(req: ProviderRequest): Record<string, unknown> {
  const { cfg } = req;
  const level = cfg.thinking === 'none' ? 'off' : req.thinking;
  const always = cfg.thinking === 'always';
  const body: Record<string, unknown> = {
    model: cfg.model,
    // GLM takes a file block or images, not both in one request.
    messages: chatMessages(req, { schemaInPrompt: true, files: Boolean(cfg.pdf && !req.images.length) }),
    stream: false,
  };
  const allowance = always ? THINKING_ALLOWANCE[level] : level === 'off' ? 0 : THINKING_ALLOWANCE[level];
  body.max_tokens = Math.min(req.maxTokens + allowance, cfg.maxOutput ?? 131_072);
  if (cfg.json !== 'prompt') body.response_format = { type: 'json_object' };
  if (cfg.thinking === 'optional') body.thinking = { type: level === 'off' ? 'disabled' : 'enabled' };
  if (always) body.reasoning_effort = EFFORT[level];
  if (cfg.temperature !== false) body.temperature = req.temperature;
  return body;
}

export function parseZai(json: Record<string, unknown>): ProviderAnswer {
  const { content, finish } = chatContent(json, 'zai');
  const u = (json.usage ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' ? v : 0);
  const promptDetails = (u.prompt_tokens_details ?? {}) as Record<string, unknown>;
  const completionDetails = (u.completion_tokens_details ?? {}) as Record<string, unknown>;
  return {
    content,
    usage: {
      inputTokens: n(u.prompt_tokens),
      cachedInputTokens: n(promptDetails.cached_tokens),
      cacheWriteTokens: 0,
      outputTokens: n(u.completion_tokens),
      // Not documented; read if present.
      reasoningTokens: n(completionDetails.reasoning_tokens),
    },
    finish,
  };
}

export async function callZai(env: Env, routes: RoutesConfig, req: ProviderRequest): Promise<ProviderAnswer> {
  const headers: Record<string, string> = {};
  if (env.ZAI_API_KEY) headers.authorization = `Bearer ${env.ZAI_API_KEY}`;
  const json = await callProvider(env, routes, { provider: 'zai', directBase: ZAI_BASE, path: ZAI_PATH, headers, body: zaiBody(req), task: req.task, itemId: req.itemId });
  return parseZai(json);
}

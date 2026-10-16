// Gemini through generateContent on v1beta (docs: ai.google.dev/gemini-api/docs/generate-content,
// checked 2026-10-16; see docs/MODELS.md). JSON comes from responseMimeType + responseJsonSchema.
// The docs' response_format object belongs to the Interactions API: generateContent refused its
// mime_type in the 2026-10-16 smoke test, so it is not used here. Thinking is set with thinkingLevel (Gemini 3 Flash
// cannot turn it off, so 'off' asks for 'low'). PDFs and images go as inline_data parts. Gemini
// 3.6 Flash and newer ignore temperature and will reject it later, so none is sent when the model
// config says so. Caching is implicit: the stable prefix (system, files, context) comes first, so
// repeat calls hit Google's automatic cache; explicit cachedContents are not used (see MODELS.md).

import type { Env } from '../../env';
import { callProvider } from '../gateway';
import { trimSchema } from '../schema';
import type { ProviderAnswer, ProviderRequest, RoutesConfig, ThinkingLevel } from '../types';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

const LEVEL: Record<ThinkingLevel, string> = { off: 'low', low: 'low', medium: 'medium', high: 'high' };
/** maxOutputTokens includes thinking, so the answer's budget gets this on top. */
const THINKING_ALLOWANCE: Record<ThinkingLevel, number> = { off: 2000, low: 4000, medium: 8000, high: 16000 };
/** A non-streaming call returns at most this many tokens. */
const NON_STREAMING_MAX = 32_768;

const GEMINI_SCHEMA = { drop: ['default', '$schema', 'minLength', 'maxLength', 'pattern'] } as const;

export function geminiBody(req: ProviderRequest): Record<string, unknown> {
  const { cfg } = req;
  const parts: Array<Record<string, unknown>> = [];
  for (const d of req.documents) parts.push({ inline_data: { mime_type: d.mime, data: d.base64 } });
  for (const im of req.images) parts.push({ inline_data: { mime_type: im.mime, data: im.base64 } });
  if (req.context) parts.push({ text: req.context });
  parts.push({ text: req.prompt });

  const contents: Array<Record<string, unknown>> = [{ role: 'user', parts }];
  if (req.repair) {
    contents.push({ role: 'model', parts: [{ text: req.repair.previous }] });
    contents.push({ role: 'user', parts: [{ text: `That JSON did not match the schema: ${req.repair.problem}. Reply again with the corrected JSON object only.` }] });
  }

  const thinks = cfg.thinking !== 'none';
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: Math.min(req.maxTokens + (thinks ? THINKING_ALLOWANCE[req.thinking] : 0), cfg.maxOutput ?? NON_STREAMING_MAX, NON_STREAMING_MAX),
  };
  if (thinks) generationConfig.thinkingConfig = { thinkingLevel: LEVEL[req.thinking] };
  if (cfg.temperature !== false) generationConfig.temperature = req.temperature;
  if (req.mediaResolution && (req.documents.length || req.images.length)) generationConfig.mediaResolution = `MEDIA_RESOLUTION_${req.mediaResolution.toUpperCase()}`;
  if (cfg.json === 'schema') {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseJsonSchema = trimSchema(req.schema, { drop: GEMINI_SCHEMA.drop });
  } else if (cfg.json === 'object') generationConfig.responseMimeType = 'application/json';

  return { systemInstruction: { parts: [{ text: req.system }] }, contents, generationConfig };
}

export function parseGemini(json: Record<string, unknown>): ProviderAnswer {
  const feedback = json.promptFeedback as { blockReason?: string } | undefined;
  const cands = (json.candidates ?? []) as Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>;
  const c = cands[0];
  const text = (c?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  const u = (json.usageMetadata ?? {}) as Record<string, number>;
  const thoughts = u.thoughtsTokenCount ?? 0;
  const reason = feedback?.blockReason ? 'filter' : String(c?.finishReason ?? '');
  const finish = reason === 'STOP' ? 'stop' : reason === 'MAX_TOKENS' ? 'length' : /SAFETY|BLOCKLIST|PROHIBITED|SPII|RECITATION/.test(reason) ? 'filter' : reason.toLowerCase();
  return {
    content: text,
    usage: {
      inputTokens: (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0),
      cachedInputTokens: u.cachedContentTokenCount ?? 0,
      cacheWriteTokens: 0,
      // candidatesTokenCount leaves out thoughts; both are billed as output.
      outputTokens: (u.candidatesTokenCount ?? 0) + thoughts,
      reasoningTokens: thoughts,
    },
    finish,
  };
}

export async function callGemini(env: Env, routes: RoutesConfig, req: ProviderRequest): Promise<ProviderAnswer> {
  const headers: Record<string, string> = {};
  // Header, never ?key=, so the key cannot end up in a logged URL.
  if (env.GOOGLE_AI_STUDIO_API_KEY) headers['x-goog-api-key'] = env.GOOGLE_AI_STUDIO_API_KEY;
  const path = `/v1beta/models/${encodeURIComponent(req.cfg.model)}:generateContent`;
  const json = await callProvider(env, routes, { provider: 'google-ai-studio', directBase: GEMINI_BASE, path, headers, body: geminiBody(req), task: req.task, itemId: req.itemId });
  return parseGemini(json);
}

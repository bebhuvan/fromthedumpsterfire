// Provider adapters: request shapes per provider, usage parsing (cached, cache-write and reasoning
// tokens), retries and error mapping, and the router's fallback down a chain with the ledger and
// spend ceiling. Responses are recorded shapes from each provider's docs (2026-10-16); no network.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { anthropicBody, parseAnthropic } from '../src/models/providers/anthropic';
import { geminiBody, parseGemini } from '../src/models/providers/gemini';
import { deepseekBody, parseDeepseek } from '../src/models/providers/deepseek';
import { parseZai, zaiBody } from '../src/models/providers/zai';
import { httpHooks, parseRetryAfter, postJson, ProviderError, scrub } from '../src/models/http';
import { costOf, worstCaseCost } from '../src/models/cost';
import { ANTHROPIC_SCHEMA, jsonSchemaFor, trimSchema } from '../src/models/schema';
import { generateJson, loadRoutes, type ModelConfig, type ProviderRequest } from '../src/models/router';
import { gatewayState } from '../src/models/gateway';
import { draftSchema } from '../src/prompts';
import { answer, makeEnv } from './fake-env';

const routes = loadRoutes({});
const schema = jsonSchemaFor(z.object({ items: z.array(z.string()).min(2).max(4), score: z.number().min(0).max(1) }));

function req(modelKey: string, over: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    modelKey,
    cfg: routes.models[modelKey]!,
    task: 'draft',
    itemId: 'it_1',
    system: 'S'.repeat(4000),
    context: 'C'.repeat(8000),
    prompt: 'Draft it.',
    images: [],
    documents: [],
    schema,
    maxTokens: 1000,
    temperature: 0.5,
    thinking: 'off',
    ...over,
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('schema trimming', () => {
  it('drops what Claude cannot enforce and closes every object', () => {
    const t = trimSchema(jsonSchemaFor(draftSchema), ANTHROPIC_SCHEMA);
    const text = JSON.stringify(t);
    expect(text).not.toMatch(/maxItems|minimum|maximum/);
    expect(text).not.toMatch(/"minItems":[2-9]/);
    const titles = (t.properties as Record<string, { items: Record<string, unknown> }>).titles!;
    expect(titles.items.additionalProperties).toBe(false);
    expect(titles).toMatchObject({ minItems: 1 });
  });
  it('treats property names as data, not keywords', () => {
    const t = trimSchema({ type: 'object', properties: { maximum: { type: 'number', maximum: 3 } } }, ANTHROPIC_SCHEMA);
    expect(t).toEqual({ type: 'object', properties: { maximum: { type: 'number' } }, additionalProperties: false });
  });
});

describe('costs', () => {
  const haiku = routes.models.haiku!.prices;
  it('prices cached reads, cache writes and plain input apart', () => {
    const c = costOf(haiku, { inputTokens: 10_000, cachedInputTokens: 6_000, cacheWriteTokens: 2_000, outputTokens: 1_000, reasoningTokens: 0 });
    expect(c).toBeCloseTo((2_000 * 0.1 + 6_000 * 0.01 + 2_000 * 0.125 + 1_000 * 0.5) / 1e6, 12);
  });
  it('moves the whole call to the long-prompt tier past 100k tokens', () => {
    const c = costOf(haiku, { inputTokens: 120_000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 });
    expect(c).toBeCloseTo((120_000 * 0.5) / 1e6, 12);
  });
  it('prices reasoning at its own rate when given, else as output', () => {
    const u = { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 3_000, reasoningTokens: 2_000 };
    expect(costOf({ in: 1, out: 2 }, u)).toBeCloseTo(6_000 / 1e6, 12);
    expect(costOf({ in: 1, out: 2, reasoning: 1 }, u)).toBeCloseTo((1_000 * 2 + 2_000 * 1) / 1e6, 12);
  });
  it('takes the dearer of cache write and plain input for the worst case', () => {
    expect(worstCaseCost(haiku, 50_000, 0)).toBeCloseTo((50_000 * 0.125) / 1e6, 12);
    expect(worstCaseCost(haiku, 200_000, 0)).toBeCloseTo((200_000 * 0.625) / 1e6, 12);
  });
});

describe('Claude (Messages API)', () => {
  it('asks for a JSON schema, caches system and context, sends no temperature', () => {
    const b = anthropicBody(req('haiku')) as Record<string, any>;
    expect(b.model).toBe('claude-haiku-5-5');
    expect(b.temperature).toBeUndefined();
    expect(b.output_config.format.type).toBe('json_schema');
    expect(JSON.stringify(b.output_config.format.schema)).not.toMatch(/maxItems|minimum/);
    expect(b.system[0].cache_control).toEqual({ type: 'ephemeral' });
    const content = b.messages[0].content;
    expect(content.at(-2)).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } });
    expect(content.at(-1)).toEqual({ type: 'text', text: 'Draft it.' });
    expect(b.thinking).toEqual({ type: 'disabled' });
    expect(b.max_tokens).toBe(1000);
  });
  it('turns on adaptive thinking with an effort level, budget on top of the answer', () => {
    const b = anthropicBody(req('haiku', { thinking: 'medium' })) as Record<string, any>;
    expect(b.thinking).toEqual({ type: 'adaptive' });
    expect(b.output_config.effort).toBe('medium');
    expect(b.max_tokens).toBe(9000);
  });
  it('never disables thinking on a model that refuses it', () => {
    const b = anthropicBody(req('claude-sonnet')) as Record<string, any>;
    expect(b.thinking).toEqual({ type: 'adaptive' });
    expect(b.output_config.effort).toBe('low');
  });
  it('sends PDFs and images as blocks and skips cache marks below the minimum', () => {
    const b = anthropicBody(req('haiku', { system: 'short', context: undefined, documents: [{ mime: 'application/pdf', base64: 'JVBE', pages: 2 }], images: [{ mime: 'image/png', base64: 'iVBO' }] })) as Record<string, any>;
    expect(b.system[0].cache_control).toBeUndefined();
    expect(b.messages[0].content[0]).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBE' }, cache_control: { type: 'ephemeral' } });
    expect(b.messages[0].content[1]).toMatchObject({ type: 'image', source: { media_type: 'image/png' } });
  });
  it('adds a repair turn after the original', () => {
    const b = anthropicBody(req('haiku', { repair: { previous: '{"x":1}', problem: 'items: required' } })) as Record<string, any>;
    expect(b.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(b.messages[2].content).toMatch(/items: required/);
  });
  it('counts cached and written tokens into the input total', () => {
    const a = parseAnthropic({
      content: [{ type: 'text', text: '{"a":1}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 50, cache_creation_input_tokens: 2000, cache_read_input_tokens: 7000, output_tokens: 300 },
    });
    expect(a.usage).toEqual({ inputTokens: 9050, cachedInputTokens: 7000, cacheWriteTokens: 2000, outputTokens: 300, reasoningTokens: 0 });
    expect(a.finish).toBe('stop');
    expect(parseAnthropic({ content: [], stop_reason: 'max_tokens', usage: {} }).finish).toBe('length');
    expect(parseAnthropic({ content: [], stop_reason: 'refusal', usage: {} }).finish).toBe('refusal');
  });
});

describe('Gemini (generateContent)', () => {
  it('asks for JSON with responseJsonSchema, thinks at the lowest level when off, no temperature', () => {
    const b = geminiBody(req('gemini-flash')) as Record<string, any>;
    expect(b.systemInstruction.parts[0].text).toMatch(/^S+$/);
    expect(b.generationConfig.responseMimeType).toBe('application/json');
    expect(b.generationConfig.responseJsonSchema.properties.items.maxItems).toBe(4);
    expect(b.generationConfig.responseFormat).toBeUndefined();
    expect(b.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
    expect(b.generationConfig.temperature).toBeUndefined();
    expect(b.generationConfig.maxOutputTokens).toBe(3000);
    // Stable prefix first: context before the prompt.
    expect(b.contents[0].parts.map((p: { text: string }) => p.text.slice(0, 1))).toEqual(['C', 'D']);
  });
  it('sends files inline with the task media resolution', () => {
    const b = geminiBody(req('gemini-flash', { documents: [{ mime: 'application/pdf', base64: 'JVBE', pages: 3 }], mediaResolution: 'high', thinking: 'medium' })) as Record<string, any>;
    expect(b.contents[0].parts[0]).toEqual({ inline_data: { mime_type: 'application/pdf', data: 'JVBE' } });
    expect(b.generationConfig.mediaResolution).toBe('MEDIA_RESOLUTION_HIGH');
    expect(b.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'medium' });
  });
  it('bills thoughts as output and reports them as reasoning; skips thought parts', () => {
    const a = parseGemini({
      candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"a":1}' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 9000, cachedContentTokenCount: 4096, candidatesTokenCount: 200, thoughtsTokenCount: 800, totalTokenCount: 10000 },
    });
    expect(a.content).toBe('{"a":1}');
    expect(a.usage).toEqual({ inputTokens: 9000, cachedInputTokens: 4096, cacheWriteTokens: 0, outputTokens: 1000, reasoningTokens: 800 });
    expect(parseGemini({ candidates: [{ finishReason: 'MAX_TOKENS' }] }).finish).toBe('length');
    expect(parseGemini({ promptFeedback: { blockReason: 'SAFETY' } }).finish).toBe('filter');
  });
});

describe('DeepSeek (chat completions)', () => {
  it('turns thinking off explicitly and sends temperature only then', () => {
    const b = deepseekBody(req('deepseek-flash')) as Record<string, any>;
    expect(b.thinking).toEqual({ type: 'disabled' });
    expect(b.temperature).toBe(0.5);
    expect(b.response_format).toEqual({ type: 'json_object' });
    expect(b.messages[0].content).toMatch(/JSON schema/);
    expect(b.messages[1].content).toMatch(/^C+\n\nDraft it\.$/);
    expect(b.max_tokens).toBe(1000);
  });
  it('thinks with an effort and room for reasoning', () => {
    const b = deepseekBody(req('deepseek-flash', { thinking: 'medium' })) as Record<string, any>;
    expect(b.thinking).toEqual({ type: 'enabled' });
    expect(b.reasoning_effort).toBe('high');
    expect(b.temperature).toBeUndefined();
    expect(b.max_tokens).toBe(13000);
  });
  it('reads cache hits and reasoning tokens, drops reasoning text', () => {
    const a = parseDeepseek({
      choices: [{ message: { content: '{"a":1}', reasoning_content: 'hmm' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5000, completion_tokens: 900, prompt_cache_hit_tokens: 4800, prompt_cache_miss_tokens: 200, completion_tokens_details: { reasoning_tokens: 600 } },
    });
    expect(a.content).toBe('{"a":1}');
    expect(a.usage).toEqual({ inputTokens: 5000, cachedInputTokens: 4800, cacheWriteTokens: 0, outputTokens: 900, reasoningTokens: 600 });
  });
});

describe('Z.ai GLM (chat completions)', () => {
  it('uses reasoning effort on GLM-5.3, which cannot stop thinking', () => {
    const b = zaiBody(req('glm-flash')) as Record<string, any>;
    expect(b.model).toBe('glm-5.3-flash');
    expect(b.thinking).toBeUndefined();
    expect(b.reasoning_effort).toBe('low');
    expect(b.max_tokens).toBe(4000);
  });
  it('disables thinking on models that allow it', () => {
    const b = zaiBody(req('glm-4.7-flash')) as Record<string, any>;
    expect(b.thinking).toEqual({ type: 'disabled' });
    expect(b.max_tokens).toBe(1000);
  });
  it('sends images as data URLs and reads cached tokens', () => {
    const b = zaiBody(req('glm-flash', { images: [{ mime: 'image/jpeg', base64: '/9j/' }] })) as Record<string, any>;
    expect(b.messages[1].content[0]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/' } });
    const a = parseZai({ choices: [{ message: { content: '{}' }, finish_reason: 'length' }], usage: { prompt_tokens: 3000, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 2048 } } });
    expect(a.usage.cachedInputTokens).toBe(2048);
    expect(a.finish).toBe('length');
  });
});

describe('postJson', () => {
  const sleeps: number[] = [];
  const sleep = async (ms: number) => void sleeps.push(ms);
  beforeEach(() => void (sleeps.length = 0));

  it('retries 429 and 5xx, honouring Retry-After', async () => {
    const answers = [json({ error: { message: 'slow down' } }, 429, { 'retry-after': '3' }), json({ error: 'busy' }, 529), json({ ok: 1 })];
    const fetchImpl = vi.fn(async () => answers.shift()!);
    const r = await postJson('https://x.test/v1', { 'x-api-key': 'k' }, {}, { provider: 'anthropic', fetchImpl, sleep });
    expect(r.json).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleeps[0]).toBe(3000);
    expect(sleeps[1]).toBeGreaterThanOrEqual(2000);
  });
  it('does not retry auth errors, spend caps or exhausted balances', async () => {
    for (const [status, body] of [
      [401, { error: { type: 'authentication_error', message: 'bad key' } }],
      [429, { error: { message: 'cap', details: { error_code: 'enforced_spend_limit_reached' } } }],
      [429, { error: { code: '1113', message: 'Insufficient balance' } }],
      [402, { error: { message: 'Insufficient Balance' } }],
    ] as const) {
      const fetchImpl = vi.fn(async () => json(body, status));
      const e = await postJson('https://x.test', {}, {}, { provider: 'p', fetchImpl, sleep }).catch((x) => x);
      expect(e).toBeInstanceOf(ProviderError);
      expect(e.retryable).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });
  it('gives up at once when asked to wait longer than a call should', async () => {
    const fetchImpl = vi.fn(async () => json({}, 429, { 'retry-after': '120' }));
    const e = await postJson('https://x.test', {}, {}, { provider: 'p', fetchImpl, sleep }).catch((x) => x);
    expect(e.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('maps timeouts to a retryable error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error('t'), { name: 'TimeoutError' });
    });
    const e = await postJson('https://x.test', {}, {}, { provider: 'gemini', fetchImpl, sleep, attempts: 2, timeoutMs: 5000 }).catch((x) => x);
    expect(e.message).toMatch(/did not answer within 5 s/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('tolerates the blank lines DeepSeek sends while it waits', async () => {
    const fetchImpl = vi.fn(async () => new Response('\n\n\n{"ok":2}', { status: 200 }));
    expect((await postJson('https://x.test', {}, {}, { provider: 'deepseek', fetchImpl, sleep })).json).toEqual({ ok: 2 });
  });
  it('parses Retry-After dates and scrubs keys from error text', () => {
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:10 GMT', Date.parse('Wed, 21 Oct 2026 07:28:00 GMT'))).toBe(10);
    expect(scrub('bad key=AIzaSyA1234567890abcdefghij and Bearer sk-abcdef1234567890xyz')).not.toMatch(/AIza|sk-abc/);
  });
});

// ------------------------------------------------------------------ router end to end

interface Seen {
  url: string;
  headers: Record<string, string>;
  body: any;
}

function stubFetch(handler: (s: Seen) => Response | Promise<Response>): Seen[] {
  const seen: Seen[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const s = { url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
    seen.push(s);
    return handler(s);
  });
  return seen;
}

const out = z.object({ answer: z.string() });
const keys = { ANTHROPIC_API_KEY: 'sk-ant-test-key-000000', GOOGLE_AI_STUDIO_API_KEY: 'AIzaTestKey0000000000', DEEPSEEK_API_KEY: 'sk-deepseek-test-0000', ZAI_API_KEY: 'zai-test-key-00000000' };
const claudeOk = (text: string, usage = { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 20 }) => json({ type: 'message', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage });

describe('generateJson across providers', () => {
  beforeEach(() => {
    httpHooks.sleep = async () => {};
    gatewayState.missing = false;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    gatewayState.missing = false;
  });

  it('goes through the gateway provider endpoint with metadata, key in a header only', async () => {
    const seen = stubFetch(() => claudeOk('{"answer":"yes"}'));
    const env = makeEnv(undefined, { ...keys, AI_GATEWAY_ID: 'fdf-preview', CF_AIG_TOKEN: 'cf-token-0000000000' });
    const r = await generateJson(env, { task: 'draft', system: 'sys', context: 'source', prompt: 'go', schema: out, itemId: 'it_9' });
    expect(r).toMatchObject({ data: { answer: 'yes' }, modelKey: 'claude-sonnet', model: 'claude-sonnet-5-5' });
    expect(seen[0]!.url).toBe('https://gateway.ai.cloudflare.com/v1/acct/fdf-preview/anthropic/v1/messages');
    expect(seen[0]!.headers['x-api-key']).toBe(keys.ANTHROPIC_API_KEY);
    expect(seen[0]!.headers['cf-aig-authorization']).toBe('Bearer cf-token-0000000000');
    expect(JSON.parse(seen[0]!.headers['cf-aig-metadata']!)).toMatchObject({ task: 'draft', item: 'it_9' });
    expect(seen[0]!.headers['cf-aig-skip-cache']).toBe('true');
    expect(seen[0]!.url).not.toMatch(/key/i);
  });

  it('calls Z.ai directly (no built-in gateway provider) and Gemini with the key in a header', async () => {
    const seen = stubFetch((s) =>
      s.url.includes('z.ai')
        ? json({ choices: [{ message: { content: '{"answer":"glm"}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } })
        : json({ candidates: [{ content: { parts: [{ text: '{"answer":"gem"}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }),
    );
    const env = makeEnv(undefined, { ZAI_API_KEY: keys.ZAI_API_KEY, GOOGLE_AI_STUDIO_API_KEY: keys.GOOGLE_AI_STUDIO_API_KEY, AI_GATEWAY_ID: 'fdf' });
    const plate = await generateJson(env, { task: 'plate', system: 's', prompt: 'p', schema: out });
    expect(plate.data.answer).toBe('glm');
    expect(seen[0]!.url).toBe('https://api.z.ai/api/paas/v4/chat/completions');
    expect(seen[0]!.headers.authorization).toBe(`Bearer ${keys.ZAI_API_KEY}`);
    const ocr = await generateJson(env, { task: 'ocr', system: 's', prompt: 'p', schema: out, images: [{ mime: 'image/png', base64: 'iVBO' }] });
    expect(ocr.data.answer).toBe('gem');
    expect(seen[1]!.url).toBe('https://gateway.ai.cloudflare.com/v1/acct/fdf/google-ai-studio/v1beta/models/gemini-3.8-flash:generateContent');
    expect(seen[1]!.headers['x-goog-api-key']).toBe(keys.GOOGLE_AI_STUDIO_API_KEY);
  });

  it('falls down the chain on persistent 5xx and truncation, and records every call with its tokens', async () => {
    let anthropicCalls = 0;
    const seen = stubFetch((s) => {
      if (s.url.includes('anthropic')) {
        anthropicCalls++;
        return json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 529);
      }
      if (s.url.includes('generativelanguage')) return json({ candidates: [{ content: { parts: [{ text: '{"ans' }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 2900 } });
      return json({
        choices: [{ message: { content: '{"answer":"ds"}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 4000, completion_tokens: 500, prompt_cache_hit_tokens: 3000, completion_tokens_details: { reasoning_tokens: 300 } },
      });
    });
    const env = makeEnv(undefined, keys);
    const r = await generateJson(env, { task: 'draft', system: 's', prompt: 'p', schema: out, itemId: 'it_2' });
    expect(r.modelKey).toBe('deepseek-flash');
    // Sonnet, three tries (Claude's 529 is retried), then Gemini (cut off), then DeepSeek.
    expect(anthropicCalls).toBe(3);
    expect(seen.at(-1)!.url).toBe('https://api.deepseek.com/chat/completions');
    const rows = (await env.DB.prepare('SELECT provider, ok, error, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, cost_usd FROM model_calls ORDER BY rowid').all<Record<string, any>>()).results;
    expect(rows.map((x) => [x.provider, x.ok])).toEqual([
      ['anthropic', 0],
      ['google-ai-studio', 0],
      ['deepseek', 1],
    ]);
    expect(rows[0]!.error).toMatch(/529/);
    expect(rows[1]!.error).toMatch(/cut off/);
    expect(rows[1]!.reasoning_tokens).toBe(2900);
    expect(rows[1]!.cost_usd).toBeCloseTo((1000 * 0.75 + 3000 * 3.75) / 1e6, 10);
    expect(rows[2]).toMatchObject({ input_tokens: 4000, cached_input_tokens: 3000, output_tokens: 500, reasoning_tokens: 300 });
    expect(rows[2]!.cost_usd).toBeCloseTo((1000 * 0.3 + 3000 * 0.006 + 500 * 1.2) / 1e6, 10);
  });

  it('repairs an answer that fails the schema with one more turn on the same model', async () => {
    const answers = [claudeOk('{"wrong":1}'), claudeOk('{"answer":"fixed"}', { input_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 900, output_tokens: 10 })];
    const seen = stubFetch(() => answers.shift()!);
    const env = makeEnv(undefined, { ANTHROPIC_API_KEY: keys.ANTHROPIC_API_KEY });
    const r = await generateJson(env, { task: 'draft', system: 's', context: 'c', prompt: 'p', schema: out });
    expect(r.data.answer).toBe('fixed');
    expect(seen[1]!.body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user']);
    const rows = (await env.DB.prepare('SELECT ok, cached_input_tokens FROM model_calls ORDER BY rowid').all<Record<string, number>>()).results;
    expect(rows).toEqual([
      { ok: 0, cached_input_tokens: 0 },
      { ok: 1, cached_input_tokens: 900 },
    ]);
  });

  it('skips models that cannot read a required PDF, and ends on Workers AI when nothing else answers', async () => {
    const seen = stubFetch(() => json({ error: { message: 'bad key' } }, 401));
    const env = makeEnv(() => answer({ answer: 'wai' }), keys);
    const r = await generateJson(env, { task: 'read', system: 's', prompt: 'p', schema: out });
    expect(r.modelKey).toBe('wai-deepseek-flash');
    // Sonnet, then Haiku: both Claude, each refused once (auth errors are not retried).
    expect(seen.map((s) => new URL(s.url).host)).toEqual(['api.anthropic.com', 'api.anthropic.com', 'api.deepseek.com', 'api.z.ai', 'generativelanguage.googleapis.com']);
    const doc = { mime: 'application/pdf' as const, base64: 'JVBE', pages: 5 };
    seen.length = 0;
    await expect(generateJson(env, { task: 'ocr', system: 's', prompt: 'p', schema: out, documents: [doc], requireDocuments: true })).rejects.toThrow(/Every model/);
    expect(seen.map((s) => new URL(s.url).host)).toEqual(['generativelanguage.googleapis.com', 'api.anthropic.com']);
  });

  it('keeps Workers AI reasoning models from thinking even when the task asks for it', async () => {
    const env = makeEnv(() => answer({ answer: 'wai' }));
    await generateJson(env, { task: 'draft', system: 's', prompt: 'p', schema: out });
    expect(env.aiCalls[0]!.input.chat_template_kwargs).toEqual({ thinking: false, enable_thinking: false });
  });

  it('drops a PDF longer than a model takes, rather than skipping the model', async () => {
    const seen = stubFetch(() => claudeOk('{"answer":"text only"}'));
    const env = makeEnv(undefined, { ANTHROPIC_API_KEY: keys.ANTHROPIC_API_KEY });
    await generateJson(env, { task: 'read', system: 's', prompt: 'p', schema: out, documents: [{ mime: 'application/pdf', base64: 'JVBE', pages: 400 }] });
    expect(JSON.stringify(seen[0]!.body)).not.toMatch(/"document"/);
  });

  it('refuses a call whose worst case would cross the ceiling, before sending it', async () => {
    const seen = stubFetch(() => claudeOk('{"answer":"x"}'));
    const env = makeEnv(undefined, { ANTHROPIC_API_KEY: keys.ANTHROPIC_API_KEY, SPEND_CEILING_USD: '0.0001' });
    await expect(generateJson(env, { task: 'draft', system: 's', prompt: 'x'.repeat(40_000), schema: out })).rejects.toThrow(/Spend ceiling: draft on claude-sonnet could cost/);
    expect(seen).toHaveLength(0);
  });
});

describe('scanned PDFs', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('are transcribed a few pages per call by a PDF-reading model, keeping page offsets', async () => {
    const { ocrPdf } = await import('../src/extract/pdf');
    httpHooks.sleep = async () => {};
    const seen = stubFetch((s) => {
      const m = /pages (\d+) to (\d+)/.exec(JSON.stringify(s.body))!;
      const pages = [];
      for (let n = Number(m[1]); n <= Number(m[2]); n++) pages.push({ page: n, text: `Page ${n} text, set in type and scanned.` });
      return claudeOk(JSON.stringify({ pages, title: 'A Scan', creator: '' }));
    });
    const env = makeEnv(undefined, { ANTHROPIC_API_KEY: keys.ANTHROPIC_API_KEY });
    const r = (await ocrPdf(env, new Uint8Array([37, 80, 68, 70]), 12, 'it_s'))!;
    expect(seen).toHaveLength(2);
    expect(seen[0]!.body.messages[0].content[0]).toMatchObject({ type: 'document', cache_control: { type: 'ephemeral' } });
    expect(r.extractor).toBe('ocr');
    expect(r.pages).toHaveLength(12);
    expect(r.text.slice(r.pages[11]!)).toMatch(/^Page 12 text/);
    expect(r.meta.title).toBe('A Scan');
    expect(await ocrPdf(env, new Uint8Array(4), 61)).toBeNull();
  });
});

// Workers AI through the AI binding, via the gateway when it exists. Needs no key, so it is the last
// fallback in every chain. Chat models take OpenAI-style messages; a JSON schema where the model
// supports one. Reasoning models run with thinking off (DECISIONS.md).

import type { Env } from '../../env';
import { errorMessage } from '../../util';
import { gatewayState } from '../gateway';
import { ModelError, type ProviderAnswer, type ProviderRequest } from '../types';
import { chatMessages } from './openai-chat';

/** A Workers AI call that never answers must fail (and be retried), not hang the step. */
export const AI_TIMEOUT_MS = 150_000;

const isMissingGateway = (e: unknown) => /2001|configure AI Gateway/i.test(errorMessage(e));

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

/** Ledger name for Workers AI calls: marks the ones that bypassed a missing gateway. */
export const wai = () => (gatewayState.missing ? 'workers-ai-direct' : 'workers-ai');

export async function callWorkersAi(env: Env, req: ProviderRequest): Promise<ProviderAnswer> {
  const { cfg } = req;
  // The schema is always stated in the prompt too: some models accept response_format and ignore it.
  const input: Record<string, unknown> = { messages: chatMessages(req, { schemaInPrompt: true }), max_tokens: req.maxTokens, temperature: req.temperature };
  if (cfg.thinking !== 'none' && req.thinking === 'off') input.chat_template_kwargs = { thinking: false, enable_thinking: false };
  if (cfg.json === 'schema') input.response_format = { type: 'json_schema', json_schema: req.schema };
  else if (cfg.json === 'object') input.response_format = { type: 'json_object' };
  const out = (await runWorkersAi(env, cfg.model, input, { skipCache: false })) as Record<string, unknown>;
  const usage = (out.usage ?? {}) as Record<string, number>;
  let content: unknown = out.response;
  const choices = out.choices as Array<{ message?: { content?: unknown }; finish_reason?: string }> | undefined;
  if (content === undefined && choices?.[0]?.message) content = choices[0].message.content ?? null;
  const reason = choices?.[0]?.finish_reason;
  return {
    content,
    usage: {
      inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
      reasoningTokens: 0,
    },
    finish: reason === 'length' ? 'length' : 'stop',
  };
}

// Where a provider request goes. With AI_GATEWAY_ID set, through Cloudflare AI Gateway's
// provider-specific endpoint (so logs and spend sit in one place); otherwise, or when the routes
// say a provider has no gateway route, straight to the provider. Keys come from Worker secrets and
// travel only in headers; with BYOK the gateway supplies a stored key instead.

import type { Env } from '../env';
import { postJson, ProviderError, type PostOptions } from './http';
import type { Provider, RoutesConfig } from './types';

/**
 * Whether the configured gateway was found missing in this isolate. Workers AI refuses a gateway id
 * that does not exist (error 2001); calls then go direct so the pipeline keeps running, the ledger
 * marks them, and the Desk's settings page says the gateway needs creating.
 */
export const gatewayState = { missing: false };

export const GATEWAY_HOST = 'https://gateway.ai.cloudflare.com/v1';

/** Gateway slug for each provider that AI Gateway knows natively. */
const BUILT_IN: Partial<Record<Provider, string>> = {
  'google-ai-studio': 'google-ai-studio',
  anthropic: 'anthropic',
  deepseek: 'deepseek',
  openai: 'openai',
  openrouter: 'openrouter',
};

export function gatewaySlug(routes: RoutesConfig, provider: Provider): string | null {
  const configured = routes.gateway?.[provider];
  if (configured === null) return null;
  return configured ?? BUILT_IN[provider] ?? null;
}

export interface ProviderCall {
  provider: Provider;
  /** Provider base without a trailing slash, e.g. https://api.anthropic.com */
  directBase: string;
  /** Path after the base, e.g. /v1/messages */
  path: string;
  /** Provider headers, auth included. */
  headers: Record<string, string>;
  body: unknown;
  task: string;
  itemId?: string | null;
  post?: Partial<PostOptions>;
}

export function routeUrl(env: Env, routes: RoutesConfig, provider: Provider, directBase: string, path: string): { url: string; viaGateway: boolean } {
  const slug = gatewaySlug(routes, provider);
  if (slug && env.AI_GATEWAY_ID && env.CF_ACCOUNT_ID && !gatewayState.missing) {
    return { url: `${GATEWAY_HOST}/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/${slug}${path}`, viaGateway: true };
  }
  return { url: `${directBase}${path}`, viaGateway: false };
}

const isMissingGatewayAnswer = (e: ProviderError) => (e.status === 400 || e.status === 404) && /2001|gateway (was )?not found|configure AI Gateway/i.test(e.message);

export async function callProvider(env: Env, routes: RoutesConfig, call: ProviderCall): Promise<Record<string, unknown>> {
  const { url, viaGateway } = routeUrl(env, routes, call.provider, call.directBase, call.path);
  const headers: Record<string, string> = { ...call.headers };
  if (viaGateway) {
    if (env.CF_AIG_TOKEN) headers['cf-aig-authorization'] = `Bearer ${env.CF_AIG_TOKEN}`;
    headers['cf-aig-metadata'] = JSON.stringify({ task: call.task, ...(call.itemId ? { item: call.itemId } : {}), env: env.ENVIRONMENT });
  }
  try {
    return (await postJson(url, headers, call.body, { provider: call.provider, ...call.post })).json;
  } catch (e) {
    if (viaGateway && e instanceof ProviderError && isMissingGatewayAnswer(e)) {
      gatewayState.missing = true;
      console.warn(JSON.stringify({ event: 'ai-gateway-missing', gateway: env.AI_GATEWAY_ID }));
      return (await postJson(`${call.directBase}${call.path}`, call.headers, call.body, { provider: call.provider, ...call.post })).json;
    }
    throw e;
  }
}

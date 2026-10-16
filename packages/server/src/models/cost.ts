// Cost of one call from its normalised usage and the model's declared prices. Cached reads, cache
// writes and reasoning are each priced at their own rate; anything a provider does not price apart
// falls back to the plain input or output rate, so the ledger errs high, never low.

import type { Prices, Usage } from './types';

export function costOf(prices: Prices, u: Usage): number {
  const p = prices.longAbove !== undefined && prices.long && u.inputTokens > prices.longAbove ? { ...prices, ...prices.long } : prices;
  const cached = Math.min(u.cachedInputTokens, u.inputTokens);
  const written = Math.min(u.cacheWriteTokens, u.inputTokens - cached);
  const plainIn = Math.max(0, u.inputTokens - cached - written);
  const reasoning = Math.min(u.reasoningTokens, u.outputTokens);
  const plainOut = Math.max(0, u.outputTokens - reasoning);
  const usd = plainIn * p.in + cached * (p.cachedIn ?? p.in) + written * (p.cacheWrite ?? p.in) + plainOut * p.out + reasoning * (p.reasoning ?? p.out);
  return usd / 1_000_000;
}

/** The most a call could cost: every input token uncached, the whole output budget spent. */
export function worstCaseCost(prices: Prices, inputTokens: number, maxOutputTokens: number): number {
  const writeCostsMore = (prices.cacheWrite ?? 0) > prices.in;
  const reasoningCostsMore = (prices.reasoning ?? 0) > prices.out;
  return costOf(prices, {
    inputTokens,
    cachedInputTokens: 0,
    cacheWriteTokens: writeCostsMore ? inputTokens : 0,
    outputTokens: maxOutputTokens,
    reasoningTokens: reasoningCostsMore ? maxOutputTokens : 0,
  });
}

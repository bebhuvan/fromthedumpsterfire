// The spend ledger. Every model call is recorded in D1 with its cost; before each call the month's
// total is compared with SPEND_CEILING_USD and the call is refused once it is reached.

import type { Env } from './env';
import { FatalError, newId, nowIso } from './util';

export interface CallRecord {
  task: string;
  provider: string;
  model: string;
  itemId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  costUsd: number;
  latencyMs: number;
  ok: boolean;
  error?: string | null;
}

export class SpendCeilingError extends FatalError {
  constructor(spent: number, ceiling: number) {
    super(`Spend ceiling reached: $${spent.toFixed(2)} of $${ceiling.toFixed(2)} this month. Raise SPEND_CEILING_USD to continue.`);
  }
}

export function monthStart(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function monthSpend(env: Env): Promise<number> {
  const row = await env.DB.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM model_calls WHERE at >= ?')
    .bind(monthStart())
    .first<{ total: number }>();
  return row?.total ?? 0;
}

export interface SpendStatus {
  spentUsd: number;
  warnUsd: number;
  ceilingUsd: number;
  state: 'ok' | 'warn' | 'ceiling';
}

export async function spendStatus(env: Env): Promise<SpendStatus> {
  const spentUsd = await monthSpend(env);
  const warnUsd = Number(env.SPEND_WARN_USD ?? 0);
  const ceilingUsd = Number(env.SPEND_CEILING_USD ?? 0);
  const state = ceilingUsd > 0 && spentUsd >= ceilingUsd ? 'ceiling' : warnUsd > 0 && spentUsd >= warnUsd ? 'warn' : 'ok';
  return { spentUsd, warnUsd, ceilingUsd, state };
}

/** Throws SpendCeilingError when the month's spend has reached the ceiling. A zero ceiling means no model calls. */
export async function assertBudget(env: Env): Promise<void> {
  const ceiling = Number(env.SPEND_CEILING_USD ?? 0);
  const spent = await monthSpend(env);
  if (!(ceiling > 0) || spent >= ceiling) throw new SpendCeilingError(spent, ceiling);
}

export async function recordCall(env: Env, r: CallRecord): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO model_calls (id, at, task, provider, model, item_id, input_tokens, output_tokens, audio_seconds, cost_usd, latency_ms, ok, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newId('mc_'),
      nowIso(),
      r.task,
      r.provider,
      r.model,
      r.itemId ?? null,
      r.inputTokens ?? 0,
      r.outputTokens ?? 0,
      r.audioSeconds ?? 0,
      r.costUsd,
      r.latencyMs,
      r.ok ? 1 : 0,
      r.error ? r.error.slice(0, 500) : null,
    )
    .run();
}

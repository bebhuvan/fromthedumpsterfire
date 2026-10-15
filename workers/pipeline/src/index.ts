// The pipeline worker: a durable Workflow per item, and the queue consumer that fans captures out
// to it, sends push notifications after a publish, and drafts the field-note helpers.

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import {
  applyFields,
  draftItem,
  draftQuestions,
  draftRoute,
  errorMessage,
  fetchRange,
  fetchSource,
  getItem,
  joinTranscript,
  judgeNotes,
  notifyAll,
  nowIso,
  readItem,
  resolveWiki,
  runChecks,
  setStatus,
  SpendCeilingError,
  storeSource,
  transcribeAudio,
  type AudioPlan,
  type Env,
  type HaulRow,
  type ItemWorkflowParams,
  type QueueMessage,
  type SourceMeta,
} from '@fdf/server';

const RETRY: WorkflowStepConfig = { retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' }, timeout: '10 minutes' };
const ONCE: WorkflowStepConfig = { retries: { limit: 1, delay: '5 seconds' }, timeout: '5 minutes' };

/** Errors that will not get better on retry stop the step at once. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e && typeof e === 'object' && 'fatal' in e) throw new NonRetryableError(errorMessage(e), (e as unknown as Error).name);
    throw e;
  }
}

export class ItemWorkflow extends WorkflowEntrypoint<Env, ItemWorkflowParams> {
  async run(event: WorkflowEvent<ItemWorkflowParams>, step: WorkflowStep) {
    const { itemId, redraftOnly } = event.payload;
    const env = this.env;
    const runId = event.instanceId;
    const mark = (s: string) =>
      env.DB.prepare('UPDATE runs SET step = ? WHERE id = ?').bind(s, runId).run();

    await step.do('start', ONCE, async () => {
      await env.DB.prepare(`INSERT OR IGNORE INTO runs (id, item_id, status, step, started_at) VALUES (?, ?, 'running', 'start', ?)`).bind(runId, itemId, nowIso()).run();
      await setStatus(env, itemId, redraftOnly ? 'reading' : 'fetching');
      return true;
    });

    try {
      if (!redraftOnly) {
        const fetched = await step.do('fetch', RETRY, () =>
          guard(async () => {
            await mark('fetch');
            const item = await getItem(env, itemId);
            if (!item) throw new NonRetryableError('The item was deleted');
            const outcome = await fetchSource(env, item as never);
            if (outcome.kind === 'text') {
              const r = await storeSource(env, itemId, outcome);
              return { audio: null as null | { plan: AudioPlan; meta: SourceMeta }, words: r.words };
            }
            await applyFields(env, itemId, outcome.fields);
            await setStatus(env, itemId, 'fetching', `Transcribing ${outcome.plan.chunks.length} part${outcome.plan.chunks.length === 1 ? '' : 's'} of audio`);
            return { audio: { plan: outcome.plan, meta: outcome.meta }, words: 0 };
          }),
        );

        if (fetched.audio) {
          const { plan, meta } = fetched.audio;
          const parts: string[] = [];
          for (const [i, chunk] of plan.chunks.entries()) {
            const text = await step.do(`transcribe-${i + 1}-of-${plan.chunks.length}`, RETRY, () =>
              guard(async () => {
                await mark(`transcribe ${i + 1}/${plan.chunks.length}`);
                const bytes = await fetchRange(plan.url, chunk.start, chunk.end);
                const t = await transcribeAudio(env, bytes, { itemId });
                return t.text;
              }),
            );
            parts.push(text);
          }
          await step.do('store-transcript', ONCE, () =>
            guard(async () => {
              const text = joinTranscript(parts);
              if (!text.trim()) throw new NonRetryableError('The transcription came back empty');
              await storeSource(env, itemId, { kind: 'text', text, extractor: 'whisper', meta: { ...meta, note: 'Machine transcript of the audio. Check quotes against the recording.' }, fields: {} });
              return true;
            }),
          );
        }
      }

      const read = await step.do('read', RETRY, () => guard(async () => (await mark('read'), readItem(env, itemId))));
      await step.do('wiki', RETRY, () => guard(async () => (await mark('wiki'), resolveWiki(env, itemId, read.queries))));
      await step.do('draft', RETRY, () => guard(async () => (await mark('draft'), draftItem(env, itemId))));
      await step.do('judge', RETRY, () => guard(async () => (await mark('judge'), setStatus(env, itemId, 'checking'), judgeNotes(env, itemId))));
      await step.do('check', RETRY, async () => {
        await mark('check');
        const r = await runChecks(env, itemId);
        return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.status]));
      });
      await step.do('finish', ONCE, async () => {
        await setStatus(env, itemId, 'ready');
        await env.DB.prepare(`UPDATE runs SET status = 'done', step = 'done', finished_at = ? WHERE id = ?`).bind(nowIso(), runId).run();
        return true;
      });
    } catch (e) {
      const msg = errorMessage(e);
      const paused = msg.startsWith('Spend ceiling') || e instanceof SpendCeilingError;
      await step.do('record-failure', ONCE, async () => {
        await setStatus(env, itemId, paused ? 'paused' : 'failed', msg.slice(0, 500));
        await env.DB.prepare(`UPDATE runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`).bind(msg.slice(0, 1000), nowIso(), runId).run();
        return true;
      });
      throw e;
    }
  }
}

async function handle(env: Env, msg: QueueMessage): Promise<void> {
  switch (msg.kind) {
    case 'ingest':
    case 'redraft': {
      if (!msg.itemId) return;
      const id = `${msg.itemId}-${Date.now().toString(36)}`;
      await env.ITEM_WORKFLOW.create({ id, params: { itemId: msg.itemId, redraftOnly: msg.kind === 'redraft' } });
      return;
    }
    case 'notify': {
      if (!msg.haulId) return;
      const h = await env.DB.prepare('SELECT * FROM hauls WHERE id = ?').bind(msg.haulId).first<HaulRow>();
      if (!h) return;
      const v = await env.DB.prepare('SELECT notified FROM haul_versions WHERE haul_id = ? AND version = ?').bind(msg.haulId, msg.version ?? 1).first<{ notified: number }>();
      if (!v || v.notified) return; // at most one notification per Haul
      const title = [h.title_text, h.title_italic].filter(Boolean).join(' ');
      const report = await notifyAll(env, {
        title: `Haul ${h.number}: ${title}`,
        body: h.deck,
        url: `${env.SITE_BASE.replace(/\/$/, '')}/haul/${h.number}`,
      });
      if (report.configured) {
        await env.DB.prepare('UPDATE haul_versions SET notified = 1 WHERE haul_id = ? AND version = ?').bind(msg.haulId, msg.version ?? 1).run();
      }
      console.log(JSON.stringify({ event: 'notify', haul: h.number, ...report }));
      return;
    }
    case 'haul-draft': {
      if (!msg.haulId) return;
      if (msg.what === 'route') await draftRoute(env, msg.haulId);
      else await draftQuestions(env, msg.haulId);
      return;
    }
  }
}

export default {
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const m of batch.messages) {
      try {
        await handle(env, m.body);
        m.ack();
      } catch (e) {
        console.error(JSON.stringify({ event: 'queue-error', kind: m.body.kind, error: errorMessage(e), attempts: m.attempts }));
        if (e instanceof SpendCeilingError || m.attempts >= 4) m.ack();
        else m.retry({ delaySeconds: 30 * m.attempts });
      }
    }
  },
  async fetch(): Promise<Response> {
    return new Response('fdf pipeline: no public routes', { status: 404 });
  },
} satisfies ExportedHandler<Env, QueueMessage>;

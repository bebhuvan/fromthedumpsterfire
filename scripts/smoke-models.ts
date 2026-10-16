// A small, real smoke test of each external model in routes.json: one structured-output call, and
// one PDF or image call where the model takes them. Prints tokens (cached and reasoning too) and
// cost per call; never prints a key.
// Keys are read from workers/pipeline/.dev.vars (gitignored). Models whose key is missing are skipped.
// Usage: npx tsx scripts/smoke-models.ts [modelKey ...]
//   With CF_ACCOUNT_ID and AI_GATEWAY_ID in .dev.vars the calls go through the gateway.

import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { z } from 'zod';
import { callAnthropic } from '../packages/server/src/models/providers/anthropic.ts';
import { callDeepseek } from '../packages/server/src/models/providers/deepseek.ts';
import { callGemini } from '../packages/server/src/models/providers/gemini.ts';
import { callZai } from '../packages/server/src/models/providers/zai.ts';
import { costOf } from '../packages/server/src/models/cost.ts';
import { jsonSchemaFor } from '../packages/server/src/models/schema.ts';
import type { ModelConfig, ProviderAnswer, ProviderRequest, RoutesConfig } from '../packages/server/src/models/types.ts';
import type { Env } from '../packages/server/src/env.ts';

const routes = JSON.parse(readFileSync(new URL('../packages/server/src/models/routes.json', import.meta.url), 'utf8')) as RoutesConfig;

function devVars(path: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(new URL(path, import.meta.url), 'utf8')
        .split('\n')
        .map((l) => /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(l))
        .filter((m): m is RegExpExecArray => Boolean(m))
        .map((m) => [m[1]!, m[2]!]),
    );
  } catch {
    return {};
  }
}

const env = { ...devVars('../workers/pipeline/.dev.vars'), ENVIRONMENT: 'local' } as unknown as Env;
const KEY: Record<string, keyof Env> = { anthropic: 'ANTHROPIC_API_KEY', 'google-ai-studio': 'GOOGLE_AI_STUDIO_API_KEY', deepseek: 'DEEPSEEK_API_KEY', zai: 'ZAI_API_KEY' };
const CALL: Record<string, (e: Env, r: RoutesConfig, q: ProviderRequest) => Promise<ProviderAnswer>> = { anthropic: callAnthropic, 'google-ai-studio': callGemini, deepseek: callDeepseek, zai: callZai };

/** A one-page PDF that says a known sentence. */
function tinyPdf(text: string): string {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1').toString('base64');
}

/** A 64 x 64 PNG in one flat colour. */
function tinyPng(rgb: [number, number, number]): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const w = 64;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: w }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

const card = z.object({ title: z.string(), year: z.number().int(), themes: z.array(z.string()).min(1).max(3) });
const seen = z.object({ text: z.string(), colour: z.string() });

function request(key: string, cfg: ModelConfig, over: Partial<ProviderRequest>): ProviderRequest {
  return {
    modelKey: key,
    cfg,
    task: 'smoke',
    system: 'You fill in small structured records. Answer with JSON only.',
    prompt: 'Book: "The Coal Question" by William Stanley Jevons, first published 1865. Give its title, year and up to three themes.',
    images: [],
    documents: [],
    schema: jsonSchemaFor(card),
    maxTokens: 400,
    temperature: 0,
    thinking: 'off',
    ...over,
  };
}

const only = process.argv.slice(2);
let total = 0;
for (const [key, cfg] of Object.entries(routes.models)) {
  if (cfg.provider === 'workers-ai' || (only.length && !only.includes(key))) continue;
  const call = CALL[cfg.provider];
  if (!call) continue;
  if (!env[KEY[cfg.provider]!]) {
    console.log(`${key}: skipped (no ${String(KEY[cfg.provider])} in workers/pipeline/.dev.vars)`);
    continue;
  }
  const runs: Array<[string, ProviderRequest, z.ZodType]> = [['json', request(key, cfg, {}), card]];
  if (cfg.pdf) runs.push(['pdf', request(key, cfg, { prompt: 'Copy the sentence printed in the attached PDF as text, and say what colour its text is.', documents: [{ mime: 'application/pdf', base64: tinyPdf('Things worth salvaging from the archive.'), pages: 1 }], schema: jsonSchemaFor(seen) }), seen]);
  else if (cfg.vision) runs.push(['image', request(key, cfg, { prompt: 'This image is one flat colour. Name the colour, and put an empty string in text.', images: [{ mime: 'image/png', base64: tinyPng([220, 60, 40]) }], schema: jsonSchemaFor(seen) }), seen]);
  for (const [what, q, schema] of runs) {
    const started = Date.now();
    try {
      const a = await call(env, routes, q);
      const text = typeof a.content === 'string' ? a.content : JSON.stringify(a.content);
      const parsed = schema.safeParse(JSON.parse(text.replace(/^```(?:json)?\s*|```\s*$/g, '')));
      const cost = costOf(cfg.prices, a.usage);
      total += cost;
      const u = a.usage;
      console.log(
        `${key} ${what}: ${parsed.success ? 'valid' : 'INVALID'} ${a.finish} in ${Date.now() - started} ms; tokens in ${u.inputTokens} (cached ${u.cachedInputTokens}, written ${u.cacheWriteTokens}) out ${u.outputTokens} (reasoning ${u.reasoningTokens}); $${cost.toFixed(6)}; ${text.slice(0, 140).replace(/\s+/g, ' ')}`,
      );
    } catch (e) {
      console.log(`${key} ${what}: FAILED in ${Date.now() - started} ms: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
console.log(`total $${total.toFixed(6)}`);

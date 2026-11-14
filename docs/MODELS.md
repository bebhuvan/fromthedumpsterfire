# Models

What each external model can do, how the Desk uses it, and what it costs. Every fact here was read
from the provider's own docs on **2026-10-16**; the links are the pages read. Prices and limits
change, so check the source before changing a route. The machine-readable form (capabilities and
prices per model, chains per task) is `packages/server/src/models/routes.json`; the adapters are in
`packages/server/src/models/providers/`.

## At a glance

| Key in routes.json | Model id | Context / max output | JSON | Thinking | Vision / PDF | Caching | USD per M tokens: in / cached in / out |
|---|---|---|---|---|---|---|---|
| `haiku` | `claude-haiku-5-5` | 1M / 128K | JSON schema (structured outputs) | adaptive, effort low to high, can be off | images, PDFs (600 pages) | explicit `cache_control`, 5 min | 0.10 / 0.01 / 0.50 (cache write 0.125); above 100K prompt tokens 0.50 / 0.05 / 2.50 |
| `gemini-flash` | `gemini-3.8-flash` | 1,048,576 / 65,536 (32,768 per non-streaming call) | JSON schema (`responseJsonSchema`) | `thinkingLevel` low, medium, high; cannot be off | images, PDFs (1,000 pages), audio, video | implicit from 4,096 tokens | 0.75 / 0.075 / 3.75 until 31 Dec 2026, then 1.50 / 0.15 / 7.50 |
| `deepseek-flash` | `deepseek-flash` (V4.1-Flash) | 1M / 384K | JSON object | on by default; can be off; effort low, high, max | images; no PDFs | automatic disk cache | 0.30 / 0.006 / 1.20 peak; half off-peak |
| `glm-flash` | `glm-5.3-flash` | 1M / 128K | JSON object | always on; effort low, high, max | images, video, files | automatic | 0.15 / 0.03 / 0.50 |
| `glm-4.7-flash` | `glm-4.7-flash` | 200K / 128K | JSON object | on by default; can be off | none | automatic | free |
| `claude-sonnet` (read, draft) | `claude-sonnet-5-5` | 1M / 128K | JSON schema | adaptive; cannot be off | images, PDFs | explicit | 2 / 0.10 / 10 (cache write 2.50) |
| `gemini-argon` (not in a chain) | `gemini-4-argon` | 1M output ("long-decode") / context not stated | JSON schema | as Gemini Flash (assumed; not documented on the pricing page) | as Gemini Flash (assumed) | implicit only | 2 / 0.10 / 10 until 30 Nov 2026, then 4 / 0.20 / 20; `routes.json` carries the December prices so the ceiling never understates it. Source: https://ai.google.dev/gemini-api/docs/pricing (read 2026-10-17) |
| `deepseek-pro` (not in a chain) | `deepseek-v4-pro` | 1M / 384K | JSON object | as Flash | none | automatic | 1.32 / 0.044 / 3.96 peak |

Workers AI models (`wai-*`) need no key and are last in every chain; their prices are in
`routes.json` and `spend.ts`, from https://developers.cloudflare.com/workers-ai/platform/pricing/.

## How a call is made

`generateJson` keeps its contract: callers pass a system prompt, a prompt, a zod schema and
optionally images, PDFs and a `context` block. For each model in the task's chain the router:

1. skips it if its key is missing, if images were sent and it has no vision, or if a PDF is
   required and it cannot read PDFs (a PDF longer than `pdfMaxPages` is dropped and the model gets
   the extracted text only);
2. checks the spend ceiling against the **worst case** this call could cost (every input token
   uncached, the whole output and thinking budget spent), and refuses before sending if it could
   cross `SPEND_CEILING_USD`;
3. calls the provider's native API through its adapter. Built-in AI Gateway providers (Google AI
   Studio, Anthropic, DeepSeek) go through
   `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/{provider}/…` with a
   `cf-aig-metadata` header naming the task and item, so the gateway's logs can be filtered by item.
   Z.ai is not an AI Gateway provider and is called directly (see below). Without `AI_GATEWAY_ID`,
   every provider is called directly;
4. retries inside the call on 408, 409, 429, 500, 502, 503, 504 and 529, up to three tries, waiting
   1 s then 2 s (plus jitter), or what `Retry-After` says if it says. A wait longer than 20 s, an auth
   error, a spend cap or an exhausted balance moves straight to the next model. Each request times
   out at 150 s;
5. treats an answer cut off at the output limit, or a refusal or safety block, as a failure of that
   model and moves on;
6. validates the JSON with zod. A failure gets one repair turn (the model's own answer and the
   problems listed); the stable prefix is unchanged, so the repair reads it from the cache;
7. records every call in `model_calls`: input tokens (and of those, cached and cache-written),
   output tokens (and of those, reasoning), cost, latency, and the error if any.

Keys travel only in request headers (`x-api-key`, `x-goog-api-key`, `Authorization`), never in a
URL; nothing logs headers, and provider error text is scrubbed of anything shaped like a key before
it is stored.

### Thinking

Each task names a level (`off`, `low`, `medium`, `high`); each adapter maps it to its provider and
adds an output allowance for the thinking **on top of** the answer's own `maxTokens`. That fixes the
failure recorded in DECISIONS.md (long drafts spent the whole budget on reasoning and returned
truncated JSON) without giving up thinking where it helps.

| Level | Claude | Gemini 3.8 Flash | DeepSeek | GLM-5.3 Flash | GLM-4.7 Flash |
|---|---|---|---|---|---|
| off | `thinking: disabled` | `thinkingLevel: low` (cannot be off), +2K | `thinking: disabled` | `reasoning_effort: low` (cannot be off), +3K | `thinking: disabled` |
| low | adaptive, effort low, +4K | low, +4K | enabled, effort low, +6K | low, +6K | enabled, +6K |
| medium | adaptive, effort medium, +8K | medium, +8K | enabled, effort high, +12K | high, +12K | enabled, +12K |
| high | adaptive, effort high, +16K | high, +16K | enabled, effort high, +24K | high, +24K | enabled, +24K |

Reasoning text (DeepSeek's `reasoning_content`, Gemini's thought parts) is discarded; it is never
shown, stored or sent back.

### Caching

- **Claude:** explicit. The system prompt gets a `cache_control` breakpoint when it is at least 512
  tokens (Haiku 5.5's minimum), and so does the end of the `context` block (or the last PDF when
  there is no context). Cache writes cost 1.25 times input; reads cost a tenth. Only the 5-minute
  TTL is used: the calls that share a prefix (draft and its redrafts, a repair turn, the pages of a
  scanned PDF) come within a minute of each other.
- **Gemini:** implicit only. The stable prefix (system instruction, files, context) comes first, so
  repeat calls hit Google's automatic cache from 4,096 tokens at a tenth of the input price. Explicit
  `cachedContents` are not used: they give the same discount, add a create call and charge storage
  ($0.50 per M tokens per hour), and our reuse is a few calls within a minute. Revisit if the
  ledger's `cached_input_tokens` shows implicit hits are rare.
- **DeepSeek and Z.ai:** automatic prefix caches; the adapters put stable text first in the user
  turn. Hits show as `prompt_cache_hit_tokens` (DeepSeek) and `prompt_tokens_details.cached_tokens`.

- **AI Gateway response cache:** skipped for every generation call (`cf-aig-skip-cache: true`;
  `skipCache` on Workers AI). The smoke test showed the gateway returning a stored answer in 99 ms
  for an identical request, which the ledger then charged as a real call; and a Redraft sends the
  same first request as the original draft, so it would get the same draft back. Embeddings and
  transcripts still use the gateway cache. Claude's prompt cache, measured the same day: a repeat
  PDF call read 1,820 of 1,853 input tokens from cache and cost $0.000036 against $0.000244.

Callers decide what is stable: `draftItem` sends the item header, card, Wikipedia extracts and
source as `context`, and only the feedback changes between attempts.

### PDFs

The extracted text (unpdf, then Workers AI `toMarkdown`) stays the source of truth: excerpts,
quotables and cited quotes are matched against it. Two uses of native PDF input:

- **read:** when an item came from a PDF with a text layer, the PDF (up to 14 MB) is attached for
  models that read PDFs, at low media resolution, so the reading card sees tables, figures and
  captions. The prompt tells the model to copy quotations from the extracted text.
- **Scanned PDFs** (no text layer) used to fail with "upload pages as images". Now `ocrPdf`
  transcribes up to 60 pages, ten pages per call, with the `ocr` task at high media resolution,
  keeping page offsets for "p. 12" locators. The item is marked as model-transcribed, like a page
  photo. The same file is sent on each call, so the later calls hit the prompt cache.

### Not used, and why

- **Batch APIs** (Gemini, Claude: half price, results within 24 hours). The pipeline runs per item
  while the editor waits for drafts; a day's delay is worse than the saving on a few cents.
  Worth revisiting for the backfill (milestone 7).
- **Gemini audio input.** Whisper on Workers AI costs $0.0005 a minute and returns timestamped
  segments that the transcript locators need.
- **Claude's 1-hour cache, citations, tools; Gemini's tools and URL context.** Our calls are
  single-turn JSON with verification in code; models never fetch or emit URLs.
- **Temperature on Claude 5 and Gemini 3.6+.** Claude 5 models return 400 for a non-default
  temperature and Gemini 3.6+ ignores it (and will reject it later), so `temperature: false` in
  routes.json stops the adapters sending it. Regenerations on these models vary by feedback only.

## Chains per task

Costs are for a typical 5,000-word article (about 7,000 source tokens), from the prices above, and
include thinking. The first model is used when its key is set; the rest are fallbacks.

| Task | Chain | Thinking | Why | Expected cost |
|---|---|---|---|---|
| read | claude-sonnet → haiku → deepseek-flash → glm-flash → gemini-flash → wai-deepseek-flash → wai-scout | low | Since 2026-10-17 the reading card also picks the further reading, which is editorial judgement: on Haiku the picks varied run to run between "Pfeilstorch" and generic topics ("White stork", "Bird migration"); on Sonnet they were specific with reasons (Red knot and the horseshoe crabs of Delaware Bay). List lengths are asked for in descriptions and trimmed in code, so one item too many no longer costs a repair turn. | about $0.03 an article, $0.05 an hour of talk |
| draft | claude-sonnet → gemini-flash → deepseek-flash → haiku → wai-kimi → wai-deepseek-flash | low | Titles, excerpt choice and the big ideas are editorial judgement. Measured side by side on 2026-10-17 on the same two items (The Conversation's bird-migration piece, 1,587 words; Karpathy's one-hour LLM talk, 12,151 words), cost per draft: **Haiku** ($0.003 / $0.006) flat titles, missed the best passages and ideas. **Gemini 3.8 Flash** ($0.006 / $0.018) good ideas (found "System 1 vs System 2"), misused the italic title tail. **DeepSeek Flash** ($0.008 / $0.020) strong titles and passages, but it is also the judge, so it should not draft. **Sonnet 5.5** ($0.018 / $0.06) the most consistent: best passages, ideas across the whole talk. **Gemini 4 Argon** ($0.036 / $0.098 at December prices) about Sonnet's level, not better, at 1.7 times the cost. Gemini Flash is second because it is the next best and a different family from the judge. Input limit 300,000 characters so a two-hour transcript fits whole. | $0.03 for a 1,600-word article, $0.06 for a one-hour talk; redrafts read the source from the prompt cache |
| research | claude-sonnet → gemini-flash → deepseek-flash → haiku → wai-kimi → wai-deepseek-flash | low | Added 2026-11-14 (DECISIONS). Two calls per item: leads from the model's own knowledge (what makes a margin note worth reading is breadth of reading, so the strongest drafter), then notes written from the fetched Wikipedia paragraphs. Input capped at 120,000 characters; the second call sees about 5,000 characters per lead. Not yet measured on real items: the estimate is from token counts at Sonnet's prices ($2 in, $10 out a million). | about $0.08 to $0.12 an item, $1.50 to $2.50 for a 16-item Haul |
| judge | deepseek-flash → gemini-flash → haiku → wai-kimi → wai-deepseek-flash | medium | A different model family from the drafter checks its notes; thinking helps match a claim to its evidence. | about $0.007 |
| connect | claude-sonnet → gemini-flash → deepseek-flash → haiku → wai-kimi → wai-deepseek-flash | medium | Typing a link and choosing quotes at both ends is judgement work. Moved to Sonnet on 2026-11-14 after Hauls 001 and 002 produced no connections on DeepSeek Flash (not measured side by side; the reason is the zero, and that Sonnet drafts best). | about $0.04 per batch of candidates (estimate) |
| clean | haiku → deepseek-flash → glm-flash → wai-deepseek-flash → wai-scout | off | Deletion-only cleanup is mechanical; the code check accepts or rejects it. | under $0.001 per voice note |
| ocr | gemini-flash → haiku → glm-flash → deepseek-flash → wai-scout | off (Gemini: low) | Gemini reads page images most accurately; high media resolution for old type. | about $0.008 per page photo; about $0.15 for a 30-page scan |
| plate | glm-flash → deepseek-flash → haiku → wai-deepseek-flash → wai-scout | off | Two to four search phrases: a small paid model is enough. The free GLM-4.7-Flash was too often overloaded (smoke test), so the editor chose paid GLM-5.3-Flash (2026-10-16). | about $0.00005 |
| haul | haiku → gemini-flash → deepseek-flash → wai-kimi → wai-deepseek-flash | low | Questions and route draft in the editor's register. | under $0.005 per Haul |
| thread | same as haul | low | Thread titles and years. | under $0.002 per thread |
| bridge | same as haul | low | The Rhyme's bridge line (was on the `haul` route). | under $0.002 per Rhyme |

Per item (read, plate, connect, draft, research, judge): about **$0.15 to $0.20** since the research desk
and Sonnet connections (2026-11-14; was $0.04 to $0.08 after drafting moved to Sonnet on 2026-10-17), against about $0.014 on Workers AI alone. A YouTube video with only
auto-generated captions is now transcribed by Whisper instead ($0.0005 a minute, $0.03 an hour). The editor chose paid models first for the bulk tasks on 2026-10-16. Gemini's price doubles
on 1 January 2027; OCR is its main use, so that roughly doubles OCR cost.

## Providers in detail

### Anthropic Claude (Messages API)

- **Endpoint:** `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`,
  `anthropic-version: 2023-06-01`. Through the gateway:
  `…/{gateway}/anthropic/v1/messages`; with BYOK, leave out `x-api-key` and send
  `cf-aig-authorization`. [versioning](https://platform.claude.com/docs/en/api/versioning),
  [gateway](https://developers.cloudflare.com/ai-gateway/usage/providers/anthropic/)
- **Models:** `claude-haiku-5-5` (released 2026-10-07; a fixed id with no dated snapshot),
  `claude-sonnet-5-5`, `claude-opus-5-5`. [models](https://platform.claude.com/docs/en/about-claude/models/overview),
  [Haiku 5.5 migration](https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide)
- **Structured outputs (GA):** `output_config: { format: { type: "json_schema", schema } }`; the JSON
  arrives in the text block. `additionalProperties` must be false; no `minimum`/`maximum`,
  `minLength`/`maxLength`; `minItems` only 0 or 1. The adapter trims those keywords (zod still
  enforces them). A refusal or `max_tokens` stop can return JSON that does not match.
  [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- **Thinking:** `budget_tokens` returns 400 on Haiku 5.5 and Sonnet 5.5. Use
  `thinking: { type: "adaptive" }` with `output_config.effort` (`low` … `max`; Haiku's default is
  medium) or `thinking: { type: "disabled" }` (Haiku only, at effort high or below). Thinking is
  billed as output and counts toward `max_tokens`. Any non-default `temperature` returns 400.
  [thinking](https://platform.claude.com/docs/en/build-with-claude/thinking),
  [effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- **Vision and PDF:** image blocks (10 MB, 8000 px), document blocks (32 MB request, 600 pages);
  each PDF page costs its text plus a page image, typically 1,500 to 3,000 tokens. Haiku 5.5's new
  tokenizer counts about 30% more tokens than Haiku 4.5 for the same text.
  [vision](https://platform.claude.com/docs/en/build-with-claude/vision),
  [PDF](https://platform.claude.com/docs/en/build-with-claude/pdf-support)
- **Prompt caching:** `cache_control: { type: "ephemeral" }` on up to four blocks; 5 min (1.25x
  write) or 1 h (2x write); reads 0.1x on Haiku; minimum 512 tokens on Haiku 5.5. Changing images,
  thinking settings or the output format invalidates the cache.
  [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- **Usage:** `input_tokens` excludes cached tokens; total input is `input_tokens +
  cache_read_input_tokens + cache_creation_input_tokens`. Thinking is inside `output_tokens`.
- **Errors:** 400, 401, 402, 403, 404, 409, 413, 429 `rate_limit_error`, 500, 504, 529
  `overloaded_error`; `retry-after` on 429; a 429 with `enforced_spend_limit_reached` will not clear
  on retry. Stop reasons: `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`,
  `refusal`, `model_context_window_exceeded`. [errors](https://platform.claude.com/docs/en/api/errors),
  [rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- **Prices:** [pricing](https://platform.claude.com/docs/en/about-claude/pricing). Haiku's
  above-100K tier applies to the whole request, cached tokens included; routes.json models it with
  `longAbove`.
- **Batches:** `POST /v1/messages/batches`, half price, most done within an hour, 24 h limit.
  [batches](https://platform.claude.com/docs/en/build-with-claude/batch-processing)

### Google Gemini (generateContent)

- **Endpoint:** `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`,
  header `x-goog-api-key`. Through the gateway: `…/{gateway}/google-ai-studio/v1beta/models/…`.
  [generateContent](https://ai.google.dev/api/generate-content),
  [gateway](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/)
- **Models:** `gemini-3.8-flash` is the newest stable Flash (the editor's "3.8 Flash"); also
  `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`.
  [models](https://ai.google.dev/gemini-api/docs/models),
  [3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- **Structured output:** `generationConfig.responseMimeType = "application/json"` with
  `responseJsonSchema`. The structured-output page now shows a `response_format` object, but that
  example is for the Interactions API: `generateContent` refused its `mime_type` value in our
  smoke test (2026-10-16), and the older pair works. Supports type, enum,
  min/max, min/maxItems, `additionalProperties`; keys come out in schema order.
  [structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
- **Thinking:** `thinkingConfig.thinkingLevel` (`low`, `medium` default, `high`; `minimal` is an
  error on 3.8 Flash). It cannot be turned off. `maxOutputTokens` includes thinking.
  [thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking)
- **Limits:** a non-streaming call returns at most 32,768 tokens. Temperature, topP and topK are
  ignored on 3.6 Flash and newer. [troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)
- **Files:** inline parts within a 20 MB request (the Desk caps a PDF at 14 MB before base64);
  PDFs up to 1,000 pages; Gemini 3 counts 280, 560 or 1,120 tokens a page at low, medium or high
  `mediaResolution` (the document page also says 258). Audio, up to 9.5 hours.
  [documents](https://ai.google.dev/gemini-api/docs/generate-content/document-processing),
  [media resolution](https://ai.google.dev/gemini-api/docs/generate-content/media-resolution)
- **Caching:** implicit from 4,096 tokens at a tenth of input; explicit `cachedContents` (v1beta,
  storage $0.50 per M tokens per hour). [caching](https://ai.google.dev/gemini-api/docs/generate-content/caching)
- **Usage:** `promptTokenCount` (includes cached), `cachedContentTokenCount`,
  `candidatesTokenCount` (excludes thoughts, by the docs' sum for `totalTokenCount`),
  `thoughtsTokenCount`. Thoughts are billed as output.
- **Errors:** 400, 402 (prepaid credit gone: do not retry), 403, 404, 429 `RESOURCE_EXHAUSTED`,
  500, 503, 504; no Retry-After is documented. Finish reasons include `STOP`, `MAX_TOKENS`,
  `SAFETY`, `RECITATION`, `PROHIBITED_CONTENT`; `promptFeedback.blockReason` means no candidates.
  Tier 1 spend cap is $10 per 10 minutes. [errors](https://ai.google.dev/gemini-api/docs/generate-content/api-errors),
  [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- **Prices:** [pricing](https://ai.google.dev/gemini-api/docs/pricing). 3.8 Flash doubles on
  1 January 2027 (the page gives no reason). Batch is half price.

### DeepSeek

- **Endpoint:** `POST https://api.deepseek.com/chat/completions`, `Authorization: Bearer`. Through
  the gateway: `…/{gateway}/deepseek/chat/completions`.
  [API](https://api-docs.deepseek.com/), [gateway](https://developers.cloudflare.com/ai-gateway/usage/providers/deepseek/)
- **Models:** `deepseek-flash` is DeepSeek-V4.1-Flash (2026-09-10), with images. `deepseek-chat`
  and `deepseek-reasoner` were scheduled for retirement on 2026-07-24 and are no longer used here.
  [models and pricing](https://api-docs.deepseek.com/quick_start/pricing), [updates](https://api-docs.deepseek.com/updates)
- **JSON:** `response_format: { type: "json_object" }` only (no JSON schema); the prompt must say
  "json" and show the shape, so the adapter puts the schema in the system prompt. The docs warn of
  occasional empty content, which the router treats as a failed answer.
  [JSON mode](https://api-docs.deepseek.com/guides/json_mode)
- **Thinking:** `thinking: { type: "enabled" | "disabled" }`, **on by default**, with
  `reasoning_effort` `low`, `high` or `max`. Temperature has no effect while thinking.
  `reasoning_content` need not be sent back without tools. Default `max_tokens` is 8K without
  thinking and 64K with. [thinking](https://api-docs.deepseek.com/guides/thinking_mode)
- **Caching:** automatic; `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens` in usage.
  [KV cache](https://api-docs.deepseek.com/guides/kv_cache)
- **Errors:** 400, 401, 402 (balance), 422, 429, 500, 503. Long waits are padded with blank lines,
  which the HTTP layer tolerates. [errors](https://api-docs.deepseek.com/quick_start/error_codes),
  [rate limits](https://api-docs.deepseek.com/quick_start/rate_limit)
- **Prices:** off-peak (outside 01:00 to 04:00 and 06:00 to 10:00 UTC on weekdays) is half;
  routes.json uses the peak price. No batch API.

### Z.ai GLM

- **Endpoint:** `POST https://api.z.ai/api/paas/v4/chat/completions`, `Authorization: Bearer`. The
  Coding Plan endpoints are limited to Z.ai's supported tools and are not used.
  [quick start](https://docs.z.ai/guides/overview/quick-start),
  [chat completion](https://docs.z.ai/api-reference/llm/chat-completion)
- **AI Gateway:** Z.ai is not a built-in provider
  ([providers](https://developers.cloudflare.com/ai-gateway/usage/providers/)), so the Desk calls
  it directly and logs it in its own ledger. To log it in the gateway too, create a custom provider
  with slug `zai` and base URL `https://api.z.ai`, switch it on, then set `"gateway": { "zai":
  "custom-zai" }` in `MODEL_ROUTES`; requests then go to
  `…/{gateway}/custom-zai/api/paas/v4/chat/completions`.
  [custom providers](https://developers.cloudflare.com/ai-gateway/configuration/custom-providers/)
- **Models:** GLM-5.3-Flash (`glm-5.3-flash`, vision, 1M context) is paid; GLM-4.7-Flash,
  GLM-4.5-Flash and GLM-4.6V-Flash are free. [GLM-5.3-Flash](https://docs.z.ai/guides/vlm/glm-5.3-flash),
  [GLM-4.7](https://docs.z.ai/guides/llm/glm-4.7), [pricing](https://docs.z.ai/guides/overview/pricing)
- **JSON:** `response_format: { type: "json_object" }`; no JSON schema, so the schema goes in the
  prompt. [structured output](https://docs.z.ai/guides/capabilities/struct-output)
- **Thinking:** `thinking: { type: "enabled" | "disabled" }` from GLM-4.6 on, default enabled.
  GLM-5.3 models cannot disable it and take `reasoning_effort` instead (vision models: `low`,
  `high`, `max`). [thinking](https://docs.z.ai/guides/capabilities/thinking-mode)
- **Images and files:** `image_url` (under 5 MB, 6000 px) and `file` blocks (`file_data` data URL,
  50 MB), not both in one request. PDF input is off in routes.json until the smoke test shows it
  works on GLM-5.3-Flash.
- **Caching:** automatic, `usage.prompt_tokens_details.cached_tokens`.
  [cache](https://docs.z.ai/guides/capabilities/cache)
- **Errors:** business codes in the body: 1302 and 1305 (429, retry), 1113 (429, balance: do not
  retry), 1301 (400, content flagged), 1261 (prompt too long), 1211 (unknown model), 1234 (500,
  retry). [codes](https://docs.z.ai/api-reference/api-code). Rate limits sit behind the console login.

## Smoke test (2026-10-16)

`[SMOKE_THINKING=medium] npx tsx scripts/smoke-models.ts [modelKey ...]` with keys in
`workers/pipeline/.dev.vars`: one JSON call per model and one PDF or image call where supported,
with tokens and cost for each. Add `CF_ACCOUNT_ID` and `AI_GATEWAY_ID` there to go through the
gateway. First run, Gemini, DeepSeek and Z.ai (no Anthropic key yet), thinking off and medium,
direct and through `fdf-preview`: every answer valid, about $0.006 in all.

What it settled:

- **Gemini JSON:** `generateContent` refuses the `response_format` object the structured-output
  page now shows (400 on `response_format.text.mime_type`); that page's example is the Interactions
  API. `responseMimeType` + `responseJsonSchema` works, and is what the adapter sends.
- **Gemini through the gateway:** the `v1beta` path passes through `google-ai-studio` unchanged.
  The preview gateway needs no `CF_AIG_TOKEN`.
- **Gemini PDF:** the one-page test PDF cost 552 input tokens, copied verbatim.
- **DeepSeek:** `reasoning_tokens` sits inside `completion_tokens`, so thinking spends
  `max_tokens`; the adapter's allowance on top is right. Image input works on `deepseek-flash`.
- **Z.ai:** `glm-4.7-flash` is the API id. `json_object` works on GLM-5.3-Flash, and images too.
  Reasoning tokens are reported. The free GLM-4.7-Flash is often overloaded (1305, a 429): two of
  five calls failed after three tries, one took 68 s. It is no longer in any chain; plate and clean
  use the paid GLM-5.3-Flash.
- **Claude** (key added later the same day): Haiku and Sonnet valid on JSON and PDF; cache writes
  and reads priced as documented. GLM PDF input stays off.

## Keys

Wrangler secrets, on both Workers and both environments. Never paste a key into chat, a config
file or a command line. The simplest way: write `KEY=value` lines into a gitignored file at the repo
root (`.dev.vars.keys`, matched by `.dev.vars*`), upload it with `wrangler secret bulk`, then move
the lines into `workers/pipeline/.dev.vars` for local runs:

```sh
for W in pipeline api; do for E in preview production; do
  npx wrangler secret bulk .dev.vars.keys -c workers/$W/wrangler.jsonc --env $E
done; done
cat .dev.vars.keys >> workers/pipeline/.dev.vars && rm .dev.vars.keys
```

Or one key at a time, each command prompting for the value:

```sh
for KEY in GOOGLE_AI_STUDIO_API_KEY ANTHROPIC_API_KEY DEEPSEEK_API_KEY ZAI_API_KEY; do
  for W in pipeline api; do
    for E in preview production; do
      npx wrangler secret put $KEY -c workers/$W/wrangler.jsonc --env $E
    done
  done
done
```

Or BYOK: store the keys in the AI Gateway dashboard, set `CF_AIG_TOKEN` as a secret and `"byok":
true` in `MODEL_ROUTES` (Z.ai still needs `ZAI_API_KEY` unless it is a gateway custom provider).
For local runs and the smoke test, put the same names in `workers/api/.dev.vars` and
`workers/pipeline/.dev.vars` (both gitignored by `.dev.vars*`).

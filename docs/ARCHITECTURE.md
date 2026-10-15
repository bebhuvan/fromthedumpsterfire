# Architecture

Everything runs on Cloudflare except push delivery (APNs/FCM via Expo push), app builds (EAS) and
external model APIs (reached through AI Gateway).

```
Desk PWA (phone + laptop) ─┐
Telegram / iOS Shortcut ───┼─► workers/api ─► D1 + R2 ─► workers/pipeline (Workflows, Queues)
                           │                                   │
Reader app + website ◄─────┴──── published Haul bundle (R2) ◄──┘
```

## Surfaces

| Surface | Who | Tech |
|---|---|---|
| Website | readers | Astro on Workers static assets, fromthedumpsterfire.com |
| Reader app | readers | Expo (React Native), Android + iOS, reads published bundles, offline |
| Desk | editor only | Astro routes + PWA at desk.fromthedumpsterfire.com, behind Cloudflare Access |
| Capture | editor only | Desk share target (Android), iOS Shortcut, optional Telegram bot |

The reader app has no editor mode. All write routes sit behind Access.

## Cloudflare bindings

| Binding | Service | Use |
|---|---|---|
| `DB` | D1 | items, notes, reading cards, entities, edges, issues, checks, runs |
| `MEDIA` | R2 | voice audio, source snapshots, plates, published Haul bundles |
| `ITEM_WORKFLOW` | Workflows | per-item pipeline, durable steps with retries |
| `INGEST_QUEUE` | Queues | fan-out and backfill |
| `AI` | Workers AI | Whisper transcription, embeddings, `toMarkdown` for PDFs |
| `VECTORS` | Vectorize | embeddings for connection candidates |
| `BROWSER` | Browser Rendering | snapshots of JS-heavy pages |
| AI Gateway | | Gemini Flash (reading cards, drafts) and a stronger judge model; caching, cost logs, spend cap |
| Cron | | weekly link re-checks |
| Access | | protects the Desk and write routes |

## Per-item pipeline (Workflow steps)

1. **fetch**: resolve the source, extract clean text (Readability on linkedom; unpdf / toMarkdown
   for PDFs; captions or Whisper for video and audio), snapshot to R2.
2. **transcribe**: editor voice note to text (Workers AI Whisper).
3. **clean**: remove fillers and fix punctuation. Code diffs input vs output tokens and rejects any
   change that is not a deletion or punctuation.
4. **read**: reading card with a Flash model, structured JSON, validated by schema.
5. **entities**: link to Wikidata IDs; Wikipedia summaries from current revisions via the REST API.
6. **plate**: match a public-domain image (Wikimedia Commons, Met, Rijksmuseum, AIC, Smithsonian
   open-access APIs); record licence.
7. **connect**: candidates from Vectorize + shared entities + shared mechanisms; judge model types each
   edge with evidence quotes from both ends; store with confidence.
8. **draft**: title options, excerpt candidates (offsets into source text), marginalia with citations.
9. **check**: excerpts matched verbatim; links fetched (2xx); marginalia checked against cited
   sources; style check on all model prose. Failures surface on the Desk, never silently drop.

Every step writes its output and cost to D1 so the Desk can show provenance.

## Publish

The Desk's Publish action freezes the Haul in D1 and writes a versioned bundle to R2:
`hauls/001/v1/haul.json` plus assets, and updates `hauls/index.json`. The website rebuilds from the
bundle; the app fetches the index, downloads the Haul for offline reading, and receives a push.
Corrections publish a new version with a visible changelog entry.

## Cost guardrails

`SPEND_WARN_USD` and `SPEND_CEILING_USD` vars per env, enforced before each model call using AI
Gateway cost logs. Flash for bulk reading; the stronger model only for edge judging and final checks.

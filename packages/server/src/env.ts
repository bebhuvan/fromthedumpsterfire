// Bindings and vars shared by the Desk API and the pipeline. Each worker binds a subset; code that
// needs a binding the current worker lacks fails loudly rather than reaching for a default.

export interface QueueMessage {
  kind: 'ingest' | 'redraft' | 'notify' | 'haul-draft' | 'connect';
  itemId?: string;
  haulId?: string;
  version?: number;
  what?: 'questions' | 'route';
}

export interface ItemWorkflowParams {
  itemId: string;
  /** Skip fetching and extraction; re-run reading, drafting and checks on the stored source. */
  redraftOnly?: boolean;
}

export interface Env {
  DB: D1Database;
  /** Private: uploads/, notes/, snapshots/, plates/ (chosen images before publish). Never public. */
  MEDIA: R2Bucket;
  /** Public: only published bundles live here (hauls/...). Only publish.ts writes to it. */
  FILES: R2Bucket;
  /** Vectorize index of source chunks and reading cards (bge-m3, 1024 dims, cosine). Optional: connections skip the vector route without it. */
  VECTORS?: Vectorize;
  /** Browser Rendering, for pages that need JavaScript. Optional: the fallback is off without it. */
  BROWSER?: Fetcher;
  /** "on" turns on the Browser Rendering fallback (default off; see extract/browser.ts for why). */
  BROWSER_FALLBACK?: string;
  /** Cloudflare Images, to resize a chosen plate. Optional: the provider's own rendition is kept without it. */
  IMAGES?: ImagesBinding;
  AI: Ai;
  INGEST_QUEUE: Queue<QueueMessage>;
  ITEM_WORKFLOW: Workflow<ItemWorkflowParams>;
  ASSETS?: Fetcher;
  /** Workers Rate Limiting binding for the public device route (optional; an in-isolate limiter is the fallback). */
  DEVICE_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };

  ENVIRONMENT: 'local' | 'preview' | 'production';
  SPEND_WARN_USD: string;
  SPEND_CEILING_USD: string;
  /** Public base for published files, e.g. https://files.fromthedumpsterfire.com */
  FILES_BASE: string;
  /** Public site base, for notification deep links, e.g. https://fromthedumpsterfire.com */
  SITE_BASE: string;
  CF_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
  /** Optional JSON override of the model routes (see packages/server/src/models/routes.json). */
  MODEL_ROUTES?: string;

  // Access (Desk API only). Empty values deny every request.
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  OWNER_EMAIL?: string;
  /** Local wrangler dev only; refused on any non-localhost host and in production. */
  DEV_AUTH_BYPASS?: string;

  // Secrets. Never logged, never returned; only their presence is reported.
  CF_AIG_TOKEN?: string;
  GOOGLE_AI_STUDIO_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  FCM_SERVICE_ACCOUNT?: string;
  /** Open-access image APIs that need a key; each provider is skipped when its key is missing. */
  SMITHSONIAN_API_KEY?: string;
  RIJKSMUSEUM_API_KEY?: string;
}

export const SECRET_NAMES = [
  'CF_AIG_TOKEN',
  'GOOGLE_AI_STUDIO_API_KEY',
  'DEEPSEEK_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'FCM_SERVICE_ACCOUNT',
  'SMITHSONIAN_API_KEY',
  'RIJKSMUSEUM_API_KEY',
] as const;

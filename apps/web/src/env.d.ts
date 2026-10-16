// Minimal typing for the Workers runtime module. Full @cloudflare/workers-types would clash with
// the DOM types the client scripts need, and the site only reads `env`.
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}

declare module '@astrojs/cloudflare/handler' {
  export function handle(request: Request, env: unknown, context: { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void }): Promise<Response>;
}

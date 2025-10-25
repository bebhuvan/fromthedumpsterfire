/**
 * Cloudflare Workers Custom Handler
 *
 * Advanced optimizations for edge performance:
 * - Smart caching with Cache API
 * - CSP nonce generation and injection
 * - Early Hints (103) for critical resources
 * - Automatic Brotli compression
 * - Font preloading
 * - Security headers enhancement
 * - Performance headers (Server-Timing, etc.)
 */

// HTMLRewriter handler to inject nonces into script tags
class NonceInjector {
  constructor(nonce) {
    this.nonce = nonce;
  }

  element(element) {
    // Only add nonce to inline scripts and JSON-LD
    const type = element.getAttribute('type');
    if (type === 'application/ld+json' || !element.getAttribute('src')) {
      element.setAttribute('nonce', this.nonce);
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cache = caches.default;

    // Generate a unique nonce for this request
    const nonceArray = new Uint8Array(16);
    crypto.getRandomValues(nonceArray);
    const nonce = Array.from(nonceArray, byte => byte.toString(16).padStart(2, '0')).join('');

    // Cache key includes compression encoding for proper cache separation
    const cacheKey = new Request(url.toString(), request);

    // For HTML pages, we can't use cached versions because nonce must be unique
    const acceptHeader = request.headers.get('Accept') || '';
    const isHtmlRequest = acceptHeader.includes('text/html') || url.pathname.endsWith('.html') || url.pathname.endsWith('/');

    let response;

    // Only use cache for non-HTML resources
    if (!isHtmlRequest) {
      response = await cache.match(cacheKey);
      if (response) {
        response = new Response(response.body, response);
        response.headers.set('CF-Cache-Status', 'HIT');
        response.headers.set('X-Worker-Cache', 'HIT');
        return response;
      }
    }

    // Not in cache, fetch from origin (static assets)
    response = await env.ASSETS.fetch(request);

    // Clone response so we can modify headers
    response = new Response(response.body, response);

    // === Early Hints (103) Support ===
    // Send critical resource hints before main response
    if (url.pathname === '/' || url.pathname === '/index.html') {
      // Note: Early Hints sent automatically by Cloudflare if configured
      // We're setting Link headers which CF will use for Early Hints
      response.headers.append('Link', '</fonts/crimson-pro-regular.ttf>; rel=preload; as=font; type=font/ttf; crossorigin');
      response.headers.append('Link', '</fonts/dm-serif-display-regular.ttf>; rel=preload; as=font; type=font/ttf; crossorigin');
      response.headers.append('Link', '</fonts/inter-400.ttf>; rel=preload; as=font; type=font/ttf; crossorigin');
    }

    // === Caching Strategy ===
    const contentType = response.headers.get('Content-Type') || '';
    let cacheControl;

    if (url.pathname.startsWith('/_astro/')) {
      // Hashed assets - cache forever (1 year)
      cacheControl = 'public, max-age=31536000, immutable';
    } else if (contentType.includes('image/')) {
      // Images - cache for 1 week
      cacheControl = 'public, max-age=604800, stale-while-revalidate=86400';
    } else if (contentType.includes('font/') || url.pathname.includes('.woff')) {
      // Fonts - cache for 1 year
      cacheControl = 'public, max-age=31536000, immutable';
    } else if (contentType.includes('text/css') || contentType.includes('javascript')) {
      // CSS/JS without hash - cache for 1 day
      cacheControl = 'public, max-age=86400, stale-while-revalidate=3600';
    } else if (contentType.includes('text/html')) {
      // HTML - cache for 1 hour, revalidate
      cacheControl = 'public, max-age=3600, must-revalidate';
    } else if (url.pathname === '/rss.xml' || url.pathname === '/sitemap-index.xml') {
      // RSS/Sitemap - cache for 1 hour
      cacheControl = 'public, max-age=3600, stale-while-revalidate=1800';
    } else {
      // Default - cache for 1 hour
      cacheControl = 'public, max-age=3600';
    }

    response.headers.set('Cache-Control', cacheControl);

    // === Compression Headers ===
    // Cloudflare automatically handles Brotli/Gzip, but we can hint preferences
    if (!response.headers.has('Content-Encoding')) {
      // Let Cloudflare know we support compression
      response.headers.set('Vary', 'Accept-Encoding');
    }

    // === Performance Headers ===
    // Server-Timing header for debugging
    response.headers.set('Server-Timing', 'edge;desc="Cloudflare Workers"');

    // Tell browser this is a static site
    response.headers.set('X-Content-Type-Options', 'nosniff');

    // === Additional Security Headers ===
    // CSP with nonce for HTML pages
    const responseContentType = response.headers.get('Content-Type') || '';
    if (responseContentType.includes('text/html')) {
      const cspHeader = [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        "style-src 'self' 'unsafe-inline'",
        "style-src-attr 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "require-trusted-types-for 'script'"
      ].join('; ');

      response.headers.set('Content-Security-Policy', cspHeader);
    }

    // Enable CORS for fonts (if served from same origin)
    if (contentType.includes('font/')) {
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    }

    // Timing-Allow-Origin for better performance monitoring
    response.headers.set('Timing-Allow-Origin', '*');

    // === Cloudflare-Specific Headers ===
    // Enable Polish (automatic image optimization) - if on paid plan
    response.headers.set('CF-Polish', 'lossy');

    // === HTML Rewriting for Nonce Injection ===
    if (responseContentType.includes('text/html')) {
      // Use HTMLRewriter to inject nonces into script tags
      response = new HTMLRewriter()
        .on('script', new NonceInjector(nonce))
        .transform(response);
    }

    // === Store in Cache ===
    // Only cache successful non-HTML responses
    if (response.status === 200 && !responseContentType.includes('text/html')) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    // Mark as cache miss
    response.headers.set('X-Worker-Cache', isHtmlRequest ? 'BYPASS' : 'MISS');

    return response;
  },
};

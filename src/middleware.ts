import type { MiddlewareHandler } from 'astro';

export const onRequest: MiddlewareHandler = async (context, next) => {
  const response = await next();

  // Security Headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // Content Security Policy
  // Note: The Cloudflare Worker (_worker.js) will override this with nonce-based CSP for HTML
  // This serves as a fallback for direct asset access
  // In dev mode, we need 'unsafe-inline' for Astro's inline styles
  const isDev = import.meta.env.DEV;
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src 'self'${isDev ? " 'unsafe-inline'" : ''}`,
      `style-src 'self'${isDev ? " 'unsafe-inline'" : ''}`,
      "font-src 'self'",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-src https://bhuvan.substack.com https://www.youtube.com https://youtube.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests"
    ].join('; ')
  );

  return response;
};

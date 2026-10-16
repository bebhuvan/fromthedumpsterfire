import type { APIRoute } from 'astro';
import { tokensCss } from '../lib/tokens-css';

export const GET: APIRoute = () => new Response(tokensCss(), { headers: { 'content-type': 'text/css; charset=utf-8' } });

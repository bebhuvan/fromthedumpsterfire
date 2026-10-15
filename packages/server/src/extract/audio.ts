// Long audio (podcast episodes, talks without captions) is transcribed in byte-range chunks, one
// durable workflow step per chunk. MP3 frames resynchronise at any byte, so MP3 splits cleanly;
// other containers (m4a, webm) cannot be cut at arbitrary bytes and are sent whole if small enough.

import { USER_AGENT } from './http';

export const CHUNK_BYTES = 3 * 1024 * 1024;
export const MAX_WHOLE_BYTES = 20 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export interface AudioPlan {
  url: string;
  mime: string;
  bytes: number;
  chunks: Array<{ start: number; end: number }>; // inclusive byte ranges
}

export async function planAudio(url: string, knownMime?: string, knownBytes?: number): Promise<AudioPlan> {
  let bytes = knownBytes ?? 0;
  let mime = knownMime ?? '';
  let finalUrl = url;
  if (!bytes || !mime) {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, range: 'bytes=0-0' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    await res.body?.cancel();
    finalUrl = res.url || url;
    const range = res.headers.get('content-range');
    bytes = range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length') ?? 0);
    mime = (res.headers.get('content-type') ?? mime ?? '').split(';')[0]!.trim();
  }
  if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
    mime = /\.m4a(\?|$)/i.test(url) ? 'audio/mp4' : /\.(ogg|opus)(\?|$)/i.test(url) ? 'audio/ogg' : 'audio/mpeg';
  }
  if (!bytes) throw new Error('The audio server did not report a size');
  if (bytes > MAX_TOTAL_BYTES) throw new Error(`Audio is ${Math.round(bytes / 1e6)} MB; the limit is ${MAX_TOTAL_BYTES / 1e6} MB`);
  const splittable = mime === 'audio/mpeg' || mime === 'audio/mp3';
  if (!splittable) {
    if (bytes > MAX_WHOLE_BYTES) throw new Error(`This ${mime} audio is too long to transcribe in one piece (${Math.round(bytes / 1e6)} MB)`);
    return { url: finalUrl, mime, bytes, chunks: [{ start: 0, end: bytes - 1 }] };
  }
  const chunks: AudioPlan['chunks'] = [];
  for (let s = 0; s < bytes; s += CHUNK_BYTES) chunks.push({ start: s, end: Math.min(bytes, s + CHUNK_BYTES) - 1 });
  return { url: finalUrl, mime, bytes, chunks };
}

export async function fetchRange(url: string, start: number, end: number): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, range: `bytes=${start}-${end}` }, redirect: 'follow', signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Audio fetch returned ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // A server that ignores Range sends the whole file; take our slice of it.
  return res.status === 200 && buf.byteLength > end - start + 1 ? buf.subarray(start, end + 1) : buf;
}

/** Join chunk transcripts into paragraphs, one per chunk boundary or about every 120 words. */
export function joinTranscript(parts: string[]): string {
  const sentences = parts.join(' ').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z"“])/);
  const paras: string[] = [];
  let cur = '';
  for (const s of sentences) {
    cur = cur ? `${cur} ${s}` : s;
    if (cur.split(' ').length > 120) {
      paras.push(cur);
      cur = '';
    }
  }
  if (cur) paras.push(cur);
  return paras.join('\n\n');
}

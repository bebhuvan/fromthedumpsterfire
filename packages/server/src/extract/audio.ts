// Long audio (podcast episodes, talks without captions) is transcribed in chunks, one durable
// workflow step per chunk, then stitched into one transcript with timestamps.
//
// - MP3 frames resynchronise at any byte, so an MP3 is cut into byte ranges that overlap by a few
//   seconds. Each chunk's start time is estimated from the bitrate (exact for CBR and for VBR files
//   with a Xing/Info header's frame count); the overlap is removed when stitching.
// - Fragmented MP4 (YouTube's DASH audio) is cut on its own segment boundaries from the sidx index:
//   each chunk is the init segment plus whole media segments, a valid file with exact times.
// - Anything else (a plain m4a, webm, ogg) cannot be cut at arbitrary bytes and is sent whole if it
//   is small enough for Whisper.
// A cap (three hours) and a spend estimate run before any transcription.

import { USER_AGENT } from './http';
import { finalUrlOf, guardedFetch } from './guard';
import { FatalError } from '../util';
import type { TranscriptSegment } from '../models/router';

export const CHUNK_BYTES = 3 * 1024 * 1024;
export const OVERLAP_BYTES = 128 * 1024;
export const MAX_WHOLE_BYTES = 20 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 450 * 1024 * 1024;
export const MAX_SECONDS = 3 * 60 * 60;

export interface ByteRange {
  start: number;
  end: number; // inclusive
}

export interface AudioChunk extends ByteRange {
  /** Bytes sent before the range (the fMP4 init segment). */
  prefix?: ByteRange;
  /** Start time of this chunk in the whole recording, seconds (estimated for MP3). */
  at: number;
  /** Seconds at the start of this chunk that repeat the end of the previous one. */
  overlap: number;
}

export interface AudioPlan {
  url: string;
  mime: string;
  bytes: number;
  kind: 'mp3' | 'fmp4' | 'whole';
  /** Estimated length in seconds (0 when unknown). */
  seconds: number;
  /** Whether chunk times are exact (fMP4) or estimated from the bitrate (MP3). */
  exactTimes: boolean;
  chunks: AudioChunk[];
}

export interface DashRanges {
  initRange: ByteRange;
  indexRange: ByteRange;
}

// ---------------------------------------------------------------- MP3 headers

const BITRATES: Record<string, number[]> = {
  // MPEG-1 Layer III, MPEG-2/2.5 Layer III (kbps), index 1..14
  '1': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<string, number[]> = { '1': [44100, 48000, 32000], '2': [22050, 24000, 16000], '2.5': [11025, 12000, 8000] };

/** Size of an ID3v2 tag at the start of the bytes (0 if none). */
export function id3Size(b: Uint8Array): number {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0;
  const size = ((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f);
  const footer = b[5]! & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

export interface Mp3Info {
  bitrate: number; // bits per second
  sampleRate: number;
  samplesPerFrame: number;
  /** Total frames from a Xing/Info header, for an exact duration. */
  frames?: number;
}

/** Find the first MPEG audio frame in the bytes and read its header (and a Xing/Info frame count). */
export function mp3Info(b: Uint8Array): Mp3Info | null {
  for (let i = 0; i + 4 <= b.length; i++) {
    if (b[i] !== 0xff || (b[i + 1]! & 0xe0) !== 0xe0) continue;
    const verBits = (b[i + 1]! >> 3) & 3; // 0: 2.5, 2: 2, 3: 1
    const layer = (b[i + 1]! >> 1) & 3; // 1: Layer III
    const brIdx = b[i + 2]! >> 4;
    const srIdx = (b[i + 2]! >> 2) & 3;
    if (verBits === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) continue;
    const ver = verBits === 3 ? '1' : verBits === 2 ? '2' : '2.5';
    const bitrate = BITRATES[ver === '1' ? '1' : '2']![brIdx]! * 1000;
    const sampleRate = RATES[ver]![srIdx]!;
    const samplesPerFrame = ver === '1' ? 1152 : 576;
    // Xing/Info sits after the side information.
    const mono = (b[i + 3]! >> 6) === 3;
    const side = ver === '1' ? (mono ? 17 : 32) : mono ? 9 : 17;
    const x = i + 4 + side;
    let frames: number | undefined;
    if (x + 12 <= b.length) {
      const tag = String.fromCharCode(b[x]!, b[x + 1]!, b[x + 2]!, b[x + 3]!);
      if ((tag === 'Xing' || tag === 'Info') && b[x + 7]! & 1) frames = ((b[x + 8]! << 24) | (b[x + 9]! << 16) | (b[x + 10]! << 8) | b[x + 11]!) >>> 0;
    }
    return { bitrate, sampleRate, samplesPerFrame, frames };
  }
  return null;
}

/** Overlapping byte ranges over an MP3, with each chunk's estimated start time. */
export function mp3Chunks(totalBytes: number, dataStart: number, byteRate: number, chunk = CHUNK_BYTES, overlap = OVERLAP_BYTES): AudioChunk[] {
  const out: AudioChunk[] = [];
  for (let s = 0; s < totalBytes; ) {
    const end = Math.min(totalBytes, s + chunk) - 1;
    out.push({ start: s, end, at: Math.max(0, (s - dataStart) / byteRate), overlap: out.length ? overlap / byteRate : 0 });
    if (end >= totalBytes - 1) break;
    s = end + 1 - overlap;
  }
  return out;
}

// ---------------------------------------------------------------- fragmented MP4 (sidx)

export interface SidxSegment {
  offset: number; // absolute byte offset
  size: number;
  seconds: number;
}

/** Parse a sidx box (the bytes of DASH indexRange) into absolute segment ranges with durations. */
export function parseSidx(b: Uint8Array, indexRangeEnd: number): SidxSegment[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  while (p + 8 <= b.length) {
    const size = dv.getUint32(p);
    const type = String.fromCharCode(b[p + 4]!, b[p + 5]!, b[p + 6]!, b[p + 7]!);
    if (type !== 'sidx') {
      if (size < 8) return [];
      p += size;
      continue;
    }
    const version = b[p + 8]!;
    let q = p + 12 + 4; // full box header, reference_ID
    const timescale = dv.getUint32(q);
    q += 4;
    let firstOffset: number;
    if (version === 0) {
      q += 4; // earliest_presentation_time
      firstOffset = dv.getUint32(q);
      q += 4;
    } else {
      q += 8;
      firstOffset = Number(dv.getBigUint64(q));
      q += 8;
    }
    q += 2; // reserved
    const count = dv.getUint16(q);
    q += 2;
    // Offsets count from the first byte after the sidx box.
    let offset = indexRangeEnd + 1 - (b.length - (p + size)) + firstOffset;
    const segs: SidxSegment[] = [];
    for (let i = 0; i < count && q + 12 <= b.length; i++) {
      const ref = dv.getUint32(q);
      const dur = dv.getUint32(q + 4);
      const refSize = ref & 0x7fffffff;
      segs.push({ offset, size: refSize, seconds: dur / timescale });
      offset += refSize;
      q += 12;
    }
    return segs;
  }
  return [];
}

/** Group fMP4 segments into chunks of whole segments under `chunk` bytes, each led by the init segment. */
export function fmp4Chunks(segs: SidxSegment[], init: ByteRange, chunk = CHUNK_BYTES): AudioChunk[] {
  const out: AudioChunk[] = [];
  let at = 0;
  let cur: { start: number; end: number; at: number } | null = null;
  let t = 0;
  for (const s of segs) {
    if (cur && s.offset + s.size - 1 - cur.start + 1 > chunk) {
      out.push({ start: cur.start, end: cur.end, prefix: init, at: cur.at, overlap: 0 });
      cur = null;
    }
    if (!cur) cur = { start: s.offset, end: s.offset + s.size - 1, at: t };
    else cur.end = s.offset + s.size - 1;
    t += s.seconds;
    at = t;
  }
  if (cur) out.push({ start: cur.start, end: cur.end, prefix: init, at: cur.at, overlap: 0 });
  void at;
  return out;
}

// ---------------------------------------------------------------- planning

async function fetchHead(url: string, start: number, end: number): Promise<Uint8Array> {
  return fetchRange(url, start, end).catch(() => new Uint8Array());
}

export async function planAudio(url: string, knownMime?: string, knownBytes?: number, opts: { dash?: DashRanges; seconds?: number } = {}): Promise<AudioPlan> {
  let bytes = knownBytes ?? 0;
  let mime = knownMime ?? '';
  let finalUrl = url;
  if (!bytes || !mime) {
    const res = await guardedFetch(url, { headers: { 'user-agent': USER_AGENT, range: 'bytes=0-0' }, timeoutMs: 20_000 });
    await res.body?.cancel();
    finalUrl = finalUrlOf(res, url);
    const range = res.headers.get('content-range');
    bytes = bytes || (range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length') ?? 0));
    mime = mime || (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
  }
  if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
    mime = /\.m4a(\?|$)/i.test(url) ? 'audio/mp4' : /\.(ogg|opus)(\?|$)/i.test(url) ? 'audio/ogg' : 'audio/mpeg';
  }
  if (!bytes) throw new FatalError('The audio server did not report a size');
  if (bytes > MAX_TOTAL_BYTES) throw new FatalError(`Audio is ${Math.round(bytes / 1e6)} MB; the limit is ${Math.round(MAX_TOTAL_BYTES / 1e6)} MB`);

  if (mime === 'audio/mpeg' || mime === 'audio/mp3') {
    let head = await fetchHead(finalUrl, 0, 65_535);
    let tag = id3Size(head);
    if (tag > head.length - 4 && tag < bytes) head = await fetchHead(finalUrl, tag, tag + 16_383);
    else head = head.subarray(tag);
    const info = mp3Info(head);
    const byteRate = info ? info.bitrate / 8 : 16_000; // 128 kbps if the header cannot be read
    const seconds = info?.frames ? (info.frames * info.samplesPerFrame) / info.sampleRate : opts.seconds || (bytes - tag) / byteRate;
    const plan: AudioPlan = { url: finalUrl, mime, bytes, kind: 'mp3', seconds, exactTimes: false, chunks: mp3Chunks(bytes, tag, info?.frames ? (bytes - tag) / seconds : byteRate) };
    return capped(plan);
  }

  if (opts.dash && mime === 'audio/mp4') {
    const idx = await fetchRange(finalUrl, opts.dash.indexRange.start, opts.dash.indexRange.end);
    const segs = parseSidx(idx, opts.dash.indexRange.end);
    if (segs.length) {
      const seconds = segs.reduce((s, x) => s + x.seconds, 0);
      return capped({ url: finalUrl, mime, bytes, kind: 'fmp4', seconds, exactTimes: true, chunks: fmp4Chunks(segs, opts.dash.initRange) });
    }
  }

  if (bytes > MAX_WHOLE_BYTES) {
    throw new FatalError(
      `This ${mime} audio is ${Math.round(bytes / 1e6)} MB and cannot be split safely (only MP3 and DASH MP4 can be). Find an MP3 of it, or paste a transcript as a passage.`,
    );
  }
  return capped({ url: finalUrl, mime, bytes, kind: 'whole', seconds: opts.seconds ?? 0, exactTimes: true, chunks: [{ start: 0, end: bytes - 1, at: 0, overlap: 0 }] });
}

function capped(plan: AudioPlan): AudioPlan {
  if (plan.seconds > MAX_SECONDS) {
    throw new FatalError(`This recording is about ${Math.round(plan.seconds / 60)} minutes; the Desk transcribes up to ${MAX_SECONDS / 3600} hours. Paste a transcript instead.`);
  }
  return plan;
}

export async function fetchRange(url: string, start: number, end: number): Promise<Uint8Array> {
  const res = await guardedFetch(url, { headers: { 'user-agent': USER_AGENT, range: `bytes=${start}-${end}` }, timeoutMs: 60_000 });
  if (!res.ok) throw new Error(`Audio fetch returned ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_TOTAL_BYTES) throw new Error('Audio response is too large');
  const buf = new Uint8Array(await res.arrayBuffer());
  // A server that ignores Range sends the whole file; take our slice of it.
  return res.status === 200 && buf.byteLength > end - start + 1 ? buf.subarray(start, end + 1) : buf;
}

/** The bytes Whisper gets for one chunk: the init segment (fMP4) followed by the range. */
export async function fetchChunk(url: string, c: AudioChunk): Promise<Uint8Array> {
  const body = await fetchRange(url, c.start, c.end);
  if (!c.prefix) return body;
  const head = await fetchRange(url, c.prefix.start, c.prefix.end);
  const out = new Uint8Array(head.byteLength + body.byteLength);
  out.set(head, 0);
  out.set(body, head.byteLength);
  return out;
}

// ---------------------------------------------------------------- stitching

export interface ChunkTranscript {
  at: number;
  overlap: number;
  seconds: number;
  text: string;
  segments: TranscriptSegment[];
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/** Remove from `next` the longest run of words (3 to 40) that repeats the end of `prev`. */
export function dropRepeatedHead(prev: string, next: string): string {
  const a = words(prev).slice(-40).map(norm);
  const bw = words(next);
  const b = bw.map(norm);
  for (let k = Math.min(a.length, b.length, 40); k >= 3; k--) {
    let same = true;
    for (let i = 0; i < k; i++) if (a[a.length - k + i] !== b[i]) (same = false), (i = k);
    if (same) return bw.slice(k).join(' ');
  }
  return next;
}

/**
 * Stitch chunk transcripts into paragraphs with timestamps. Segments that fall wholly inside a
 * chunk's overlap are dropped; a segment straddling it loses the words that repeat the previous
 * chunk. Returns the text and `times` (paragraph offsets to milliseconds) for locators.
 */
export function stitchTranscript(parts: ChunkTranscript[], paraWords = 120): { text: string; times: Array<{ offset: number; ms: number }> } {
  const segs: Array<{ t: number; text: string }> = [];
  let tail = '';
  for (const [k, p] of parts.entries()) {
    // Without segments, each sentence of the chunk's text stands in, timed at the chunk's start.
    const list = p.segments.length
      ? p.segments
      : p.text
          .replace(/\s+/g, ' ')
          .trim()
          .split(/(?<=[.!?])\s+(?=[A-Z"“])/)
          .filter(Boolean)
          .map((text, i) => ({ start: i === 0 ? p.overlap : p.overlap + 2, end: Math.max(p.seconds, p.overlap + 3), text }));
    for (const s of list) {
      if (k > 0 && p.overlap > 0 && s.end <= p.overlap + 0.25) continue;
      let text = s.text.trim();
      if (k > 0 && s.start < p.overlap + 1.5) text = dropRepeatedHead(tail, text);
      if (!text) continue;
      segs.push({ t: p.at + Math.max(0, s.start), text });
      tail = `${tail} ${text}`.split(/\s+/).slice(-60).join(' ');
    }
  }
  const paras: Array<{ t: number; text: string }> = [];
  let cur: { t: number; text: string } | null = null;
  for (const s of segs) {
    if (!cur) cur = { t: s.t, text: s.text };
    else cur.text = `${cur.text} ${s.text}`;
    if (words(cur.text).length >= paraWords && /[.!?]["”’)]*$/.test(cur.text)) {
      paras.push(cur);
      cur = null;
    }
  }
  if (cur) paras.push(cur);
  let offset = 0;
  const times: Array<{ offset: number; ms: number }> = [];
  const texts: string[] = [];
  for (const p of paras) {
    const t = p.text.replace(/\s+/g, ' ').trim();
    times.push({ offset, ms: Math.round(p.t * 1000) });
    texts.push(t);
    offset += t.length + 2;
  }
  return { text: texts.join('\n\n'), times };
}

/** Join chunk transcripts into paragraphs, one per chunk boundary or about every 120 words. */
export function joinTranscript(parts: string[]): string {
  return stitchTranscript(parts.map((text) => ({ at: 0, overlap: 0, seconds: 0, text, segments: [] }))).text;
}

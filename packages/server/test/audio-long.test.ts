// Long audio: a synthetic 2 h 50 min MP3 is planned into overlapping byte-range chunks, each chunk
// is "transcribed" by a mocked Whisper (AI binding) that returns timed segments, and the stitched
// transcript has every word once, in order, with timestamps. Also: the three-hour cap, the spend
// estimate, DASH MP4 segment chunking, and voice-note format sniffing.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_BYTES, fmp4Chunks, id3Size, MAX_SECONDS, mp3Info, OVERLAP_BYTES, parseSidx, planAudio, stitchTranscript, type ChunkTranscript } from '../src/extract/audio';
import { transcribeAudio } from '../src/models/router';
import { assertAffordable } from '../src/spend';
import { sniffAudioFormat } from '../src/voice';
import { makeEnv } from './fake-env';

const BYTE_RATE = 16_000; // 128 kbps
/** MPEG-1 Layer III, 128 kbps, 44.1 kHz, stereo frame header, then padding. */
const FRAME = new Uint8Array([0xff, 0xfb, 0x90, 0x64, ...new Array(60).fill(0)]);

function stubAudioServer(totalBytes: number, head: Uint8Array = FRAME) {
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://cloudflare-dns.com/')) {
      const type = new URL(url).searchParams.get('type');
      return Response.json({ Answer: type === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] });
    }
    const range = /bytes=(\d+)-(\d+)/.exec(String((init?.headers as Record<string, string>)?.range ?? ''));
    const start = Number(range?.[1] ?? 0);
    const end = Math.min(Number(range?.[2] ?? totalBytes - 1), totalBytes - 1);
    const body = new Uint8Array(end - start + 1);
    if (start < head.length) body.set(head.subarray(start, Math.min(head.length, end + 1)), 0);
    return new Response(body, { status: 206, headers: { 'content-type': 'audio/mpeg', 'content-range': `bytes ${start}-${end}/${totalBytes}`, 'content-length': String(body.length) } });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('MP3 headers', () => {
  it('reads the bitrate, sample rate and an ID3 tag size', () => {
    expect(mp3Info(FRAME)).toMatchObject({ bitrate: 128_000, sampleRate: 44_100, samplesPerFrame: 1152 });
    const id3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0x02, 0x01]);
    expect(id3Size(id3)).toBe(10 + 257);
  });
});

describe('a long podcast', () => {
  const seconds = 2 * 3600 + 50 * 60;
  const total = seconds * BYTE_RATE; // about 163 MB

  it('plans overlapping chunks, transcribes each through the AI binding, and stitches one clean, timed transcript', async () => {
    stubAudioServer(total);
    const plan = await planAudio('https://podcasts.example.org/episode.mp3');
    expect(plan.kind).toBe('mp3');
    expect(Math.round(plan.seconds)).toBe(seconds);
    expect(plan.chunks.length).toBe(Math.ceil((total - OVERLAP_BYTES) / (CHUNK_BYTES - OVERLAP_BYTES)));
    for (let i = 1; i < plan.chunks.length; i++) {
      expect(plan.chunks[i]!.start).toBe(plan.chunks[i - 1]!.end + 1 - OVERLAP_BYTES);
      expect(plan.chunks[i]!.overlap).toBeCloseTo(OVERLAP_BYTES / BYTE_RATE, 5);
    }
    expect(plan.chunks.at(-1)!.end).toBe(total - 1);

    // Mock Whisper: one word per second of audio ("w<second>"), segments of ten seconds, in chunk-local time.
    let current = plan.chunks[0]!;
    const env = makeEnv((model, input) => {
      expect(model).toBe('@cf/openai/whisper-large-v3-turbo');
      expect(typeof input.audio).toBe('string');
      const dur = (current.end - current.start + 1) / BYTE_RATE;
      const segs: Array<{ start: number; end: number; text: string }> = [];
      for (let t = 0; t < dur; t += 10) {
        const words: string[] = [];
        for (let s = Math.ceil(current.at + t); s < current.at + Math.min(dur, t + 10); s++) words.push(`w${s}`);
        if (words.length) segs.push({ start: t, end: Math.min(dur, t + 10), text: `${words.join(' ')}.` });
      }
      return { text: segs.map((s) => s.text).join(' '), segments: segs, transcription_info: { duration: dur } };
    });
    const parts: ChunkTranscript[] = [];
    for (const c of plan.chunks) {
      current = c;
      const bytes = new Uint8Array(c.end - c.start + 1);
      const t = await transcribeAudio(env, bytes, { itemId: 'it_pod' });
      parts.push({ at: c.at, overlap: c.overlap, seconds: t.seconds, text: t.text, segments: t.segments });
    }
    const { text, times } = stitchTranscript(parts);
    const nums = (text.match(/w(\d+)/g) ?? []).map((w) => Number(w.slice(1)));
    // Every second once, in order: the overlaps were removed and nothing was lost.
    expect(nums.length).toBe(seconds);
    nums.forEach((n, i) => expect(n).toBe(i));
    // Paragraph timestamps rise and point at the right words.
    expect(times[0]).toEqual({ offset: 0, ms: 0 });
    for (let i = 1; i < times.length; i++) {
      expect(times[i]!.ms).toBeGreaterThan(times[i - 1]!.ms);
      const firstWord = Number(/w(\d+)/.exec(text.slice(times[i]!.offset))![1]);
      expect(Math.abs(firstWord - times[i]!.ms / 1000)).toBeLessThanOrEqual(1);
    }
    // The ledger has one call per chunk; the cost matches the audio minutes.
    const ledger = await env.DB.prepare(`SELECT COUNT(*) AS n, SUM(audio_seconds) AS s, SUM(cost_usd) AS usd FROM model_calls WHERE task = 'transcribe'`).first<{ n: number; s: number; usd: number }>();
    expect(ledger!.n).toBe(plan.chunks.length);
    expect(ledger!.usd).toBeCloseTo((ledger!.s / 60) * 0.0005, 6);
  }, 60_000);

  it('refuses a recording over three hours before transcribing anything', async () => {
    stubAudioServer((MAX_SECONDS + 600) * BYTE_RATE);
    await expect(planAudio('https://podcasts.example.org/long.mp3')).rejects.toThrow(/up to 3 hours/);
  });

  it('refuses up front when the estimated transcription cost would pass the ceiling', async () => {
    const env = makeEnv(undefined, { SPEND_CEILING_USD: '0.05' });
    await expect(assertAffordable(env, (seconds / 60) * 0.0005 * 1.1, 'transcribing 170 minutes of audio')).rejects.toThrow(/Spend ceiling: transcribing 170 minutes/);
    await expect(assertAffordable(makeEnv(), 0.1, 'x')).resolves.toBeUndefined();
  });
});

describe('DASH MP4 (YouTube audio)', () => {
  it('parses the sidx index and cuts on segment boundaries, each chunk led by the init segment', () => {
    // sidx v0: timescale 1000, 300 references of 600 KB and 10 s each.
    const count = 300;
    const size = 12 + 4 + 4 + 4 + 4 + 2 + 2 + count * 12;
    const b = new Uint8Array(size);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, size);
    b.set([0x73, 0x69, 0x64, 0x78], 4);
    dv.setUint32(16, 1000); // timescale (after version/flags and reference_ID)
    dv.setUint32(24, 0); // first_offset
    dv.setUint16(30, count);
    for (let i = 0; i < count; i++) {
      dv.setUint32(32 + i * 12, 600 * 1024);
      dv.setUint32(36 + i * 12, 10_000);
    }
    const indexRange = { start: 700, end: 700 + size - 1 };
    const segs = parseSidx(b, indexRange.end);
    expect(segs).toHaveLength(count);
    expect(segs[0]!.offset).toBe(indexRange.end + 1);
    expect(segs[1]!.offset).toBe(indexRange.end + 1 + 600 * 1024);
    const chunks = fmp4Chunks(segs, { start: 0, end: 699 });
    expect(chunks.length).toBe(Math.ceil(count / 5));
    expect(chunks[1]).toMatchObject({ prefix: { start: 0, end: 699 }, at: 50, overlap: 0 });
    for (const c of chunks) expect(c.end - c.start + 1).toBeLessThanOrEqual(CHUNK_BYTES);
  });
});

describe('voice-note formats', () => {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  it('reads the real container and codec from the bytes', () => {
    const mp4 = (codec: string) => new Uint8Array([0, 0, 0, 24, ...ascii('ftypM4A '), 0, 0, 0, 0, ...ascii('moov....stsd'), ...ascii(codec)]);
    expect(sniffAudioFormat(mp4('mp4a'), 'audio/mp4')).toBe('m4a');
    expect(sniffAudioFormat(mp4('Opus'), 'audio/mp4')).toBe('mp4');
    expect(sniffAudioFormat(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0]), 'audio/mp4')).toBe('webm');
    expect(sniffAudioFormat(new Uint8Array(ascii('OggS\0\0\0\0')), '')).toBe('ogg');
    expect(sniffAudioFormat(new Uint8Array([...ascii('ID3'), 4, 0, 0]), '')).toBe('mp3');
    expect(sniffAudioFormat(new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')]), '')).toBe('wav');
  });
});

import { guardedFetch } from './guard';

// YouTube: metadata and captions through the InnerTube player API (the Android client returns
// caption tracks without a proof-of-origin token). Prefers human captions over auto-generated ones.
// When a video has no captions, the caller can transcribe an audio-only stream with Whisper.

export interface YouTubeInfo {
  id: string;
  title: string;
  author: string;
  seconds: number;
  description: string;
  publishDate?: string;
  captions?: { text: string; times: Array<{ offset: number; ms: number }>; lang: string; auto: boolean };
  /** The smallest audio stream; DASH MP4 streams carry their init and index ranges so long ones can be cut on segment boundaries. */
  audio?: { url: string; mime: string; bytes: number; dash?: { initRange: { start: number; end: number }; indexRange: { start: number; end: number } } };
  playable: boolean;
  reason?: string;
}

const CLIENTS = [
  {
    ctx: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en', gl: 'IN' },
    ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
  },
  {
    ctx: { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2', hl: 'en', gl: 'IN' },
    ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X)',
  },
];

export function youtubeId(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = /\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(u.pathname);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

interface Json3 {
  events?: Array<{ tStartMs?: number; segs?: Array<{ utf8?: string }> }>;
}

/** Turn caption events into paragraphs: break on a long pause or after ~70 words at a sentence end. */
export function captionsToText(j: Json3): { text: string; times: Array<{ offset: number; ms: number }> } {
  const times: Array<{ offset: number; ms: number }> = [];
  let text = '';
  let para = '';
  let paraStartMs = 0;
  let lastMs = 0;
  let words = 0;
  const flush = () => {
    const t = para.replace(/\s+/g, ' ').trim();
    if (t) {
      if (text) text += '\n\n';
      times.push({ offset: text.length, ms: paraStartMs });
      text += t;
    }
    para = '';
    words = 0;
  };
  for (const ev of j.events ?? []) {
    const seg = (ev.segs ?? []).map((s) => s.utf8 ?? '').join('');
    if (!seg.trim()) continue;
    const ms = ev.tStartMs ?? lastMs;
    // A new paragraph after a sentence ends and either a long pause or about seventy words.
    const sentenceEnd = /[.!?]["”]?\s*$/.test(para);
    if (para && sentenceEnd && ((ms - lastMs > 6000 && words > 25) || words > 70)) flush();
    else if (para && words > 160) flush();
    if (!para) paraStartMs = ms;
    para += ' ' + seg.replace(/\n/g, ' ');
    words += seg.split(/\s+/).filter(Boolean).length;
    lastMs = ms;
  }
  flush();
  return { text, times };
}

export async function fetchYouTube(url: string): Promise<YouTubeInfo> {
  const id = youtubeId(url);
  if (!id) throw new Error('Not a YouTube video URL');
  let lastReason = 'unavailable';
  for (const client of CLIENTS) {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': client.ua },
      body: JSON.stringify({ context: { client: client.ctx }, videoId: id, contentCheckOk: true, racyCheckOk: true }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) continue;
    const j = (await res.json()) as Record<string, any>;
    const status = j.playabilityStatus?.status;
    const vd = j.videoDetails ?? {};
    if (!vd.title) {
      lastReason = j.playabilityStatus?.reason ?? status ?? 'no details';
      continue;
    }
    const info: YouTubeInfo = {
      id,
      title: vd.title,
      author: vd.author ?? '',
      seconds: Number(vd.lengthSeconds ?? 0),
      description: vd.shortDescription ?? '',
      publishDate: j.microformat?.playerMicroformatRenderer?.publishDate,
      playable: status === 'OK',
      reason: status === 'OK' ? undefined : j.playabilityStatus?.reason,
    };
    const tracks: Array<{ baseUrl: string; languageCode: string; kind?: string }> = j.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const pick =
      tracks.find((t) => t.languageCode.startsWith('en') && t.kind !== 'asr') ??
      tracks.find((t) => t.languageCode.startsWith('en')) ??
      tracks.find((t) => t.kind !== 'asr') ??
      tracks[0];
    if (pick) {
      const cr = await guardedFetch(pick.baseUrl.replace(/&fmt=[^&]+/, '') + '&fmt=json3', { headers: { 'user-agent': client.ua }, timeoutMs: 20_000 });
      const body = cr.ok ? await cr.text() : '';
      if (body) {
        const { text, times } = captionsToText(JSON.parse(body) as Json3);
        if (text) info.captions = { text, times, lang: pick.languageCode, auto: pick.kind === 'asr' };
      }
    }
    type Fmt = { url?: string; mimeType?: string; contentLength?: string; bitrate?: number; initRange?: { start: string; end: string }; indexRange?: { start: string; end: string } };
    const formats: Fmt[] = j.streamingData?.adaptiveFormats ?? [];
    const audios = formats.filter((f) => f.url && f.mimeType?.startsWith('audio/')).sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0));
    // Prefer an MP4 stream with a segment index (it can be split for long videos), else the smallest.
    const audio = audios.find((f) => f.mimeType!.startsWith('audio/mp4') && f.initRange && f.indexRange) ?? audios[0];
    if (audio?.url) {
      const r = (x?: { start: string; end: string }) => (x ? { start: Number(x.start), end: Number(x.end) } : undefined);
      const initRange = r(audio.initRange);
      const indexRange = r(audio.indexRange);
      info.audio = { url: audio.url, mime: audio.mimeType!.split(';')[0]!, bytes: Number(audio.contentLength ?? 0), ...(initRange && indexRange ? { dash: { initRange, indexRange } } : {}) };
    }
    return info;
  }
  throw new Error(`YouTube would not return this video (${lastReason})`);
}

export function msToClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

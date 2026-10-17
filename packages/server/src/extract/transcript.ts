// A transcript the editor made elsewhere (yt-dlp captions, Whisper on the laptop, a show's own
// transcript) and pasted or uploaded to the Desk. WebVTT and SRT keep their times, so excerpts and
// ideas get "at 12:40" locators; plain text and Markdown are taken as written. Nothing is reworded:
// timing lines, cue numbers, styling tags and the rolling repeats of auto-captions are dropped, and
// the words are joined into paragraphs.

export interface ParsedTranscript {
  text: string;
  /** Paragraph start offsets in `text` and their times, when the format carries times. */
  times: Array<{ offset: number; ms: number }>;
  format: 'vtt' | 'srt' | 'text';
}

const CUE_TIME = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*/;

function toMs(m: RegExpExecArray): number {
  const [, h, mi, s, frac] = m;
  return ((Number(h ?? 0) * 60 + Number(mi)) * 60 + Number(s)) * 1000 + Number((frac ?? '0').padEnd(3, '0'));
}

/** Paragraph breaks: after about 600 characters at a sentence end, or 900 regardless, or a pause. */
function paragraphs(cues: Array<{ ms: number; text: string }>): { text: string; times: ParsedTranscript['times'] } {
  let text = '';
  const times: ParsedTranscript['times'] = [];
  let para = '';
  let paraMs = 0;
  let lastMs = 0;
  const flush = () => {
    if (!para.trim()) return;
    if (text) text += '\n\n';
    times.push({ offset: text.length, ms: paraMs });
    text += para.trim();
    para = '';
  };
  for (const c of cues) {
    const gap = c.ms - lastMs;
    if (para && (para.length > 900 || (para.length > 600 && /[.!?]["'”’)]?$/.test(para)) || (gap > 6000 && para.length > 200))) flush();
    if (!para) paraMs = c.ms;
    para += (para ? ' ' : '') + c.text;
    lastMs = c.ms;
  }
  flush();
  return { text, times };
}

function cueText(lines: string[]): string {
  return lines
    .join(' ')
    .replace(/<[^>]+>/g, '') // <c>, <00:00:01.000>, <v Speaker>
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTimed(raw: string, format: 'vtt' | 'srt'): ParsedTranscript {
  const blocks = raw.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const cues: Array<{ ms: number; text: string }> = [];
  for (const b of blocks) {
    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
    const at = lines.findIndex((l) => CUE_TIME.test(l));
    if (at < 0) continue;
    const m = CUE_TIME.exec(lines[at]!)!;
    const text = cueText(lines.slice(at + 1));
    if (text) cues.push({ ms: toMs(m), text });
  }
  // Auto-captions roll: each cue repeats the previous line before adding the next. Keep each line once.
  const deduped: typeof cues = [];
  for (const c of cues) {
    const prev = deduped[deduped.length - 1];
    if (prev && (c.text === prev.text || prev.text.endsWith(c.text))) continue;
    if (prev && c.text.startsWith(prev.text)) {
      const rest = c.text.slice(prev.text.length).trim();
      if (rest) deduped.push({ ms: c.ms, text: rest });
      continue;
    }
    deduped.push(c);
  }
  const p = paragraphs(deduped);
  return { ...p, format };
}

/** Plain text or Markdown: drop YAML front matter, keep the words and paragraphs as written. */
function parsePlain(raw: string): ParsedTranscript {
  let s = raw.replace(/\r\n?/g, '\n');
  s = s.replace(/^---\n[\s\S]*?\n---\n/, '');
  const text = s
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
  return { text, times: [], format: 'text' };
}

export function parseTranscript(raw: string, name = ''): ParsedTranscript {
  const head = raw.trimStart().slice(0, 200);
  if (/^WEBVTT/.test(head) || /\.vtt$/i.test(name)) return parseTimed(raw, 'vtt');
  if (/\.srt$/i.test(name) || /^\d+\s*\n\s*\d{1,2}:\d{2}:\d{2},\d{3}\s*-->/.test(head)) return parseTimed(raw, 'srt');
  return parsePlain(raw);
}

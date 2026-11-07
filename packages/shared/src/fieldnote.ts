// The field note as the editor writes it on the Desk, and how it becomes the published body
// (FieldNote.body in haul.ts). The editor writes plain text with a few marks:
//
//   ## A heading             a section heading (one to six #, then a space)
//   > quoted lines           a quotation; a line with ">" alone starts its next paragraph
//   [words](https://…)       a link on the editor's own words
//   *words* or _words_       italic, for a title (**words** is read the same way)
//   https://… on its own     a paragraph that is one address alone: a YouTube or Vimeo video, a
//                            Spotify episode or show, or an X post is set there as an embed (resolved
//                            by code from the link, never typed or written by a model); any other
//                            address prints as a link
//
// Paragraphs are separated by a blank line. Turning the text into the body only deletes marks, so
// the words that print are the editor's, in their order (the test checks this).

import { xPostUrl, type NoteBlock, type NoteEmbed, type NoteRun } from './haul';

/** A piece of the editor's text, before embeds are resolved. */
export type NotePart =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'quotation'; paragraphs: string[] }
  | { kind: 'link'; url: string; embed: NoteEmbed['kind'] | null };

const HEADING = /^#{1,6}\s+(.*?)(?:\s+#+)?$/;
const LONE_URL = /^<?(https?:\/\/[^\s<>]+?)>?$/;

/** The kind of embed a lone link becomes, or null when it prints as a link. */
export function embedKind(url: string): NoteEmbed['kind'] | null {
  if (xPostUrl(url)) return 'post';
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  if (['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'vimeo.com', 'player.vimeo.com'].includes(host)) return 'video';
  if (host === 'open.spotify.com' && /\/(episode|show)\//.test(u.pathname)) return 'audio';
  return null;
}

/** The editor's text as headings, paragraphs, quotations and lone links, in order. */
export function noteParts(source: string): NotePart[] {
  const parts: NotePart[] = [];
  for (const chunk of source.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)) {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!;
      const h = HEADING.exec(line);
      if (h) {
        if (h[1]) parts.push({ kind: 'heading', text: h[1] });
        i++;
        continue;
      }
      if (line.startsWith('>')) {
        const paras: string[][] = [[]];
        while (i < lines.length && lines[i]!.startsWith('>')) {
          const t = lines[i]!.replace(/^>\s?/, '').trim();
          if (t) paras[paras.length - 1]!.push(t);
          else if (paras[paras.length - 1]!.length) paras.push([]);
          i++;
        }
        const ps = paras.filter((p) => p.length).map((p) => p.join(' '));
        if (ps.length) parts.push({ kind: 'quotation', paragraphs: ps });
        continue;
      }
      const start = i;
      while (i < lines.length && !HEADING.test(lines[i]!) && !lines[i]!.startsWith('>')) i++;
      const text = lines.slice(start, i).join(' ');
      const lone = LONE_URL.exec(text);
      if (lone) parts.push({ kind: 'link', url: lone[1]!, embed: embedKind(lone[1]!) });
      else parts.push({ kind: 'paragraph', text });
    }
  }
  return parts;
}

/** The lone links in the note that become embeds, once each, in order. */
export function embedLinks(source: string): string[] {
  return [...new Set(noteParts(source).flatMap((p) => (p.kind === 'link' && p.embed ? [p.url] : [])))];
}

// [words](https://…) (one level of brackets inside the words and of parentheses inside the address),
// <https://…>, or a bare address (trailing punctuation left in the text).
const LINK = /\[((?:[^[\]\n]|\[[^[\]\n]*\])+)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)|<(https?:\/\/[^\s<>]+)>|(https?:\/\/[^\s<>]*[^\s<>.,;:!?'"\]])/g;
// *words*, _words_ or **words**: not inside a word, not opening or closing on a space.
const EM = /(^|[^\p{L}\p{N}\\*_])(\*\*|\*|_)(?=\S)(.+?)(?<=\S)\2(?![\p{L}\p{N}*_])/gu;

function emRuns(text: string, url?: string): NoteRun[] {
  const out: NoteRun[] = [];
  const link = url ? { url } : {};
  let last = 0;
  EM.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = EM.exec(text)); ) {
    const at = m.index + m[1]!.length;
    if (at > last) out.push({ text: text.slice(last, at), ...link });
    out.push({ text: m[3]!, ...link, em: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), ...link });
  return out;
}

/** A paragraph's runs: its links and italics marked, the marks themselves deleted. */
export function noteRuns(text: string): NoteRun[] {
  const out: NoteRun[] = [];
  let last = 0;
  LINK.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = LINK.exec(text)); ) {
    let url = m[2] ?? m[3] ?? m[4]!;
    let end = m.index + m[0].length;
    // A bare address that closes more parentheses than it opens: the extra ones belong to the sentence.
    const count = (c: string) => url.split(c).length - 1;
    while (m[4] && url.endsWith(')') && count(')') > count('(')) {
      url = url.slice(0, -1);
      end--;
      LINK.lastIndex = end;
    }
    out.push(...emRuns(text.slice(last, m.index)));
    out.push(...emRuns(m[1] ?? url, url));
    last = end;
  }
  out.push(...emRuns(text.slice(last)));
  // Neighbours that read the same are one run.
  const merged: NoteRun[] = [];
  for (const r of out) {
    if (!r.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.url === r.url && !!prev.em === !!r.em) prev.text += r.text;
    else merged.push({ ...r });
  }
  return merged;
}

export const runsText = (runs: NoteRun[]) => runs.map((r) => r.text).join('');

/** The editor's text in plain paragraphs (headings and quoted paragraphs too; lone links left out). */
export function partsPlain(parts: NotePart[]): string[] {
  return parts.flatMap((p) => (p.kind === 'link' ? [] : p.kind === 'quotation' ? p.paragraphs : [p.text]).map((t) => runsText(noteRuns(t))));
}

/**
 * The published body: the parts with their runs, and each lone link as the embed `embedFor` resolved
 * for it. An embeddable link with nothing resolved is listed in `missing` (the publish refuses it);
 * any other lone link prints as a paragraph holding that link.
 */
export function noteBody(parts: NotePart[], embedFor: (url: string) => NoteEmbed | undefined): { body: NoteBlock[]; missing: string[] } {
  const body: NoteBlock[] = [];
  const missing: string[] = [];
  for (const p of parts) {
    if (p.kind === 'heading') body.push({ kind: 'heading', text: runsText(noteRuns(p.text)) });
    else if (p.kind === 'quotation') body.push({ kind: 'quotation', paragraphs: p.paragraphs.map(noteRuns) });
    else if (p.kind === 'paragraph') body.push({ kind: 'paragraph', runs: noteRuns(p.text) });
    else if (p.embed) {
      const e = embedFor(p.url);
      if (e) body.push(e);
      else missing.push(p.url);
    } else body.push({ kind: 'paragraph', runs: [{ text: p.url, url: p.url }] });
  }
  return { body, missing };
}

/** The body's words as plain paragraphs (FieldNote.paragraphs). */
export function bodyParagraphs(body: NoteBlock[]): string[] {
  return body.flatMap((b) => (b.kind === 'paragraph' ? [runsText(b.runs)] : b.kind === 'heading' ? [b.text] : b.kind === 'quotation' ? b.paragraphs.map(runsText) : []));
}

/** Whether the body says more than its plain paragraphs: a heading, quotation, embed, link or italic. */
export function bodyIsRich(body: NoteBlock[]): boolean {
  return body.some((b) => b.kind !== 'paragraph' || b.runs.some((r) => r.url || r.em));
}

/** A run marked as part of the highlighted line. */
export type MarkedRun = NoteRun & { mark?: boolean };

/** The runs split where `highlight` starts and ends, the runs inside it marked. */
export function markRuns(runs: NoteRun[], highlight?: string): MarkedRun[] {
  const at = highlight ? runsText(runs).indexOf(highlight) : -1;
  if (!highlight || at < 0) return runs;
  const end = at + highlight.length;
  const out: MarkedRun[] = [];
  let pos = 0;
  for (const r of runs) {
    const a = pos;
    const b = pos + r.text.length;
    pos = b;
    const cuts = [a, Math.min(Math.max(at, a), b), Math.min(Math.max(end, a), b), b];
    for (let k = 0; k < 3; k++) {
      const s = cuts[k]!;
      const e = cuts[k + 1]!;
      if (e > s) out.push({ ...r, text: r.text.slice(s - a, e - a), ...(k === 1 ? { mark: true } : {}) });
    }
  }
  return out;
}

/** Runs grouped by link, so the words of one link (some in italic) make one anchor. */
export function linkGroups<R extends NoteRun>(runs: R[]): Array<{ url?: string; runs: R[] }> {
  const out: Array<{ url?: string; runs: R[] }> = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (prev && prev.url === r.url) prev.runs.push(r);
    else out.push({ ...(r.url ? { url: r.url } : {}), runs: [r] });
  }
  return out;
}

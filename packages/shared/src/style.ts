// The house style check for machine prose. Every model-written sentence passes through this before
// the editor sees it; drafts with errors are regenerated, and the Desk shows warnings beside the text.
// The editor's own words are never run through it (they are never rewritten either).
// In machine mode (the default) it also runs the voice tells from voice.ts, so every caller that
// gates machine prose gets both checks.

import { voiceCheck } from './voice';

export type StyleSeverity = 'error' | 'warn';

export interface StyleIssue {
  rule: StyleRule;
  severity: StyleSeverity;
  /** The offending text, as it appears. */
  match: string;
  /** Character offset of the match in the checked text. */
  index: number;
  message: string;
}

export type StyleRule =
  | 'em-dash'
  | 'not-x-but-y'
  | 'hedge'
  | 'banned-word'
  | 'url'
  | 'exclamation'
  | 'connective-opener'
  | 'voice'
  | 'empty';

export interface StyleResult {
  ok: boolean;
  issues: StyleIssue[];
}

export interface StyleOptions {
  /**
   * Machine mode (the default) treats a single em dash as an error. Without it, only a chain of two
   * or more in one paragraph is an error and a single dash is a warning. Machine mode also runs the
   * voice tells (docs/VOICE.md).
   */
  strict?: boolean;
}

/** Words that mark prose as machine-written. Matched as whole words, with common inflections. */
export const BANNED_WORDS = [
  'delve',
  'tapestry',
  'testament',
  'realm',
  'pivotal',
  'seamless',
  'seamlessly',
  'elevate',
  'embark',
  'unleash',
  'unlock',
  'harness',
  'intricate',
  'multifaceted',
  'vibrant',
  'bustling',
  'showcase',
  'underscore',
  'foster',
  'leverage',
  'robust',
  'myriad',
  'plethora',
  'paramount',
  'synergy',
  'holistic',
  'meticulous',
  'meticulously',
  'invaluable',
  'transformative',
  'groundbreaking',
  'cutting-edge',
  'game-changer',
  'game-changing',
  'beacon',
  'captivating',
  'resonate',
  'resonates',
  'enthralling',
  'labyrinth',
  'symphony',
  'ever-evolving',
  'thought-provoking',
  'nuanced',
  'profound',
] as const;

// Inflections a stem may take before the word boundary: delves, delved, delving, elevated, fostering...
const INFLECT = "(?:s|es|d|ed|ing|ly)?";

const BANNED_RE = new RegExp(
  `\\b(${BANNED_WORDS.map((w) => w.replace(/[-]/g, '[- ]').replace(/e$/, 'e?')).join('|')})${INFLECT}\\b`,
  'gi',
);

/** Filler hedges and throat-clearing. Phrases, matched case-insensitively. */
export const HEDGES = [
  "it's worth noting",
  'it is worth noting',
  "it's important to note",
  'it is important to note',
  'it should be noted',
  'it could be argued',
  'one could argue',
  'one might argue',
  'arguably',
  'in many ways',
  'needless to say',
  'at the end of the day',
  "in today's world",
  "in today's fast-paced",
  'in an era of',
  'interestingly,',
  'notably,',
  'essentially,',
  'ultimately,',
  'in conclusion',
  'to some extent',
  'more often than not',
  'when it comes to',
  'a wide range of',
  'plays a crucial role',
  'plays a key role',
  'serves as a reminder',
  'a reminder that',
  'stands as',
  'speaks volumes',
] as const;

const HEDGE_RE = new RegExp(
  `(?:^|[^a-z])(${HEDGES.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]")).join('|')})`,
  'gi',
);

// "not X but Y", "not just X, but Y", "isn't X, it's Y", "It's not about X. It's about Y."
const NOT_BUT_RES: RegExp[] = [
  /\bnot\s+(?:just|only|merely|simply)\b[^.;:!?]{1,80}?\bbut\b/gi,
  /\bnot\s+(?:a|an|the|about|because|to|for|in|from)\s+\S+(?:\s+\S+){0,4},?\s+but\s+(?:rather\s+)?(?:a|an|the|about|because|to|for|in|from)\s/gi,
  /\b(?:is|was|are|were)n['’]t\s+[^.;:!?]{1,60}[,;:—–-]\s*(?:it|they|this|that|he|she)['’](?:s|re)\b/gi,
  /\b(?:it|this|that)['’]s\s+not\s+[^.;:!?]{1,60}[.;,—–]\s*(?:it|this|that)['’]s\b/gi,
  /\b(?:it|this|that)\s+is\s+not\s+[^.;:!?]{1,60}[.;,—–]\s*(?:it|this|that)\s+is\b/gi,
  /\bless\s+(?:a|an|about)\s+[^.;:!?]{1,40},?\s+(?:and\s+)?more\s+(?:a|an|about)\b/gi,
];

const CONNECTIVE_OPENER_RE = /(?:^|[.!?]\s+)(Moreover|Furthermore|Additionally|In addition|Consequently|Thus|Hence|Indeed),/g;

const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|org|net|io|edu|gov)(?:\/\S*)?\b/gi;

export function checkStyle(text: string, options: StyleOptions = {}): StyleResult {
  const strict = options.strict ?? true;
  const issues: StyleIssue[] = [];
  const push = (rule: StyleRule, severity: StyleSeverity, match: string, index: number, message: string) =>
    issues.push({ rule, severity, match, index, message });

  if (!text.trim()) {
    push('empty', 'error', '', 0, 'Empty text.');
    return { ok: false, issues };
  }

  // Em dashes: chains are always errors; in strict (machine) mode any em dash is.
  let offset = 0;
  for (const para of text.split(/\n{2,}/)) {
    const dashes = [...para.matchAll(/—|\s--\s/g)];
    if (dashes.length >= 2) {
      push('em-dash', 'error', para.slice(0, 80), offset + (dashes[0]!.index ?? 0), 'A chain of em dashes. Use full stops or commas.');
    } else if (dashes.length === 1) {
      push('em-dash', strict ? 'error' : 'warn', '—', offset + (dashes[0]!.index ?? 0), 'An em dash. Prefer a full stop, comma or colon.');
    }
    offset += para.length + 2;
  }

  for (const re of NOT_BUT_RES) {
    for (const m of text.matchAll(re)) push('not-x-but-y', 'error', m[0], m.index ?? 0, 'A "not X but Y" construction. Say what it is.');
  }

  for (const m of text.matchAll(HEDGE_RE)) {
    const phrase = m[1]!;
    push('hedge', 'error', phrase, (m.index ?? 0) + m[0].length - phrase.length, `Filler hedge: "${phrase}". Cut it.`);
  }

  for (const m of text.matchAll(BANNED_RE)) push('banned-word', 'error', m[0], m.index ?? 0, `Banned word: "${m[0]}".`);

  for (const m of text.matchAll(URL_RE)) push('url', 'error', m[0], m.index ?? 0, 'Models never write URLs; code resolves links.');

  for (const m of text.matchAll(/!/g)) push('exclamation', 'warn', '!', m.index ?? 0, 'Exclamation mark.');

  for (const m of text.matchAll(CONNECTIVE_OPENER_RE)) push('connective-opener', 'warn', m[1]!, m.index ?? 0, `"${m[1]}," as an opener reads as padding.`);

  if (strict) {
    for (const f of voiceCheck(text)) push('voice', f.severity, f.match, f.index, f.message);
  }

  // One issue per rule per position is enough.
  const seen = new Set<string>();
  const unique = issues
    .filter((i) => {
      const k = `${i.rule}:${i.index}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.index - b.index);
  return { ok: !unique.some((i) => i.severity === 'error'), issues: unique };
}

/** A compact, model-readable list of what to fix, for regeneration prompts. */
export function describeIssues(issues: StyleIssue[]): string {
  return issues
    .filter((i) => i.severity === 'error')
    .map((i) => `- ${i.message}${i.match && i.rule !== 'em-dash' ? ` (found: "${i.match.slice(0, 60)}")` : ''}`)
    .join('\n');
}

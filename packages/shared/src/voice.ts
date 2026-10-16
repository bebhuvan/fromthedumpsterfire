// The editor's voice, in a form code and models can use. The human-readable profile, with the
// evidence and method behind every number here, is docs/VOICE.md.
//
// Three exports matter:
//   editorVoice      a short prompt block for models that draft suggestions the editor may adopt
//                    (title options, the route draft). It describes his curatorial register.
//   aiTells          machine-prose patterns that read as model-written, with regexes or detectors.
//   voiceCheck()     runs aiTells over a text and returns findings.
//   dictionaryHints  proper nouns and terms for the transcription prompt, most useful first.
//
// voiceCheck complements checkStyle (style.ts); it never re-reports what checkStyle already
// catches (em dashes, the short "not X but Y" shapes, filler hedges, the banned-word list, URLs,
// exclamation marks, connective openers). Run both on machine prose. Never run either on the
// editor's own words, which are never rewritten.

export type VoiceSeverity = 'error' | 'warn';

export interface VoiceMatch {
  match: string;
  index: number;
}

export interface AiTell {
  id: string;
  label: string;
  severity: VoiceSeverity;
  /** Why it reads as machine. */
  why: string;
  /** A real or representative bad example. */
  bad: string;
  /**
   * What the editor does, from the corpus (docs/VOICE.md, Methodology). Rates are per 10,000 words
   * of his Substack notes (134k words) versus the model-written contrast set (5.5k words).
   */
  evidence: string;
  /**
   * Applies only to machine prose (machine mode). These are things the editor himself does but a
   * model must not: write as him, or lean on his own praise words.
   */
  machineOnly?: boolean;
  pattern?: RegExp;
  detect?: (text: string) => VoiceMatch[];
}

export interface VoiceFinding extends VoiceMatch {
  id: string;
  severity: VoiceSeverity;
  message: string;
}

export interface VoiceCheckOptions {
  /**
   * Machine mode (the default) also applies the machineOnly tells: first person and praise
   * adjectives. Turn it off to test only the tells the editor himself never uses.
   */
  machine?: boolean;
}

// ---------------------------------------------------------------------------------------------
// The editor's register, for drafting models.

/**
 * A compact description of the editor's curatorial register (under 250 words). For models that
 * draft suggestions he may adopt: title options, the route draft, question prompts. The machine
 * still never writes in his first person and never claims his feelings or habits.
 */
export const editorVoice = `You are drafting suggestions the editor may adopt or rewrite. Match his curatorial register.

He writes like a well-read friend telling you what he found this week: plain Indian English, specific, unpretentious, a little irreverent. Sentences average about 15 words, mostly between 6 and 25. Mix one longer sentence with a short flat one; never stack three short fragments.

Name things exactly: who said it, where, when, and what the thing is. He links finds by what one reminded him of, so give the concrete link between two pieces, never a theme word. One picture per idea, from ordinary life rather than myth or grandeur. Humour is deadpan and self-deflating. Admit what is unknown.

Earn praise with a specific detail, never an adjective. Do not write: brilliant, fascinating, amazing, profound, a love letter, the antidote, changed everything, why it matters, quietly, all at once. No rhetorical-question hooks, no "not X but Y" reframes, no three-beat lists of fragments, no closing line that tells the reader what to feel.

Commas and full stops. A colon may set up a quotation. No em dashes.

Never write as "I". Never invent the editor's experiences, habits or feelings. Write about the work, not about him.

Titles: short, concrete, a little wry; puns and plain questions welcome, colons rare. His own: "Horny for status", "Sauron in our pockets", "Broken news", "What's your enough?", "Hollowed husks".`;

// ---------------------------------------------------------------------------------------------
// Sentence helpers (kept simple: notes are short and well punctuated).

const ABBREV = /\b(?:Mr|Mrs|Ms|Dr|St|vs|etc|e\.g|i\.e|Inc|Ltd|Jr|Sr|No)\.$/;

interface Span {
  text: string;
  index: number;
}

function paragraphs(text: string): Span[] {
  const out: Span[] = [];
  const re = /[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g;
  for (const m of text.matchAll(re)) if (m[0].trim()) out.push({ text: m[0], index: m.index ?? 0 });
  return out;
}

function sentencesOf(p: Span): Span[] {
  const out: Span[] = [];
  // A sentence ends at . ! ? or … followed by whitespace or the end, so "3.3" and "stats.py" stay whole.
  const re = /[^]+?(?:[.!?…]+["”’)]*(?=\s|$)|$)/g;
  let buf: Span | null = null;
  for (const m of p.text.matchAll(re)) {
    const raw = m[0];
    if (!raw.trim()) continue;
    const lead = raw.length - raw.trimStart().length;
    const piece = { text: raw.trim(), index: p.index + (m.index ?? 0) + lead };
    buf = buf ? { text: `${buf.text} ${piece.text}`, index: buf.index } : piece;
    if (ABBREV.test(buf.text)) continue;
    out.push(buf);
    buf = null;
  }
  if (buf) out.push(buf);
  return out;
}

const wordCount = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
const firstWords = (s: string, n: number) =>
  (s.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).slice(0, n).join(' ');

/** Three or more consecutive sentences of five words or fewer inside one paragraph. */
function detectStaccato(text: string): VoiceMatch[] {
  const out: VoiceMatch[] = [];
  for (const p of paragraphs(text)) {
    const ss = sentencesOf(p);
    let run: Span[] = [];
    const flush = () => {
      if (run.length >= 3) out.push({ match: run.map((s) => s.text).join(' '), index: run[0]!.index });
      run = [];
    };
    for (const s of ss) {
      if (wordCount(s.text) <= 5) run.push(s);
      else flush();
    }
    flush();
  }
  return out;
}

/** Three consecutive sentences that open with the same two words ("Read it when... Read it when..."). */
function detectAnaphora(text: string): VoiceMatch[] {
  const out: VoiceMatch[] = [];
  for (const p of paragraphs(text)) {
    const ss = sentencesOf(p);
    for (let i = 0; i + 2 < ss.length; i++) {
      const a = firstWords(ss[i]!.text, 2);
      if (a.split(' ').length < 2) continue;
      if (a === firstWords(ss[i + 1]!.text, 2) && a === firstWords(ss[i + 2]!.text, 2)) {
        out.push({ match: ss.slice(i, i + 3).map((s) => s.text).join(' '), index: ss[i]!.index });
        while (i + 3 < ss.length && firstWords(ss[i + 3]!.text, 2) === a) i++;
        i += 2;
      }
    }
  }
  return out;
}

/** A last sentence that tells the reader what it all meant. */
function detectSummaryCloser(text: string): VoiceMatch[] {
  const ps = paragraphs(text);
  const last = ps[ps.length - 1];
  if (!last) return [];
  const ss = sentencesOf(last);
  const s = ss[ss.length - 1];
  if (!s || ss.length + ps.length < 3) return []; // a one-line note has no "closer"
  return /^(?:(?:And )?(?:this|that)(?:['’]s| is) (?:why|the point|the lesson|the whole point|what (?:it|this) (?:all )?(?:means|is about))\b|In the end\b|Which is (?:why|exactly)\b|The (?:lesson|takeaway|point)\b|Ultimately\b)/i.test(s.text)
    ? [{ match: s.text, index: s.index }]
    : [];
}

// ---------------------------------------------------------------------------------------------
// The tells. Patterns are global and case-insensitive unless the case carries meaning.

const CURATOR_CLICHES = [
  'a love letter to',
  'love letter to',
  'the antidote',
  'an antidote to',
  'makes you feel seen',
  'feel seen',
  'a eulogy',
  'rallying cry',
  'changed how I (?:see|think)',
  'changed the way I (?:see|think)',
  'will surprise you',
  'at (?:its|their|his|her) absolute best',
  'worth every minute',
  'required reading',
  'a masterclass in',
  'a tour de force',
  'a deep dive',
  'food for thought',
  'a wake-up call',
  'lands somewhere between',
  'goosebumps at',
  "you didn['’]t know you needed",
  'stays with you',
  'lingers long after',
  'will make you rethink',
  ', all at once',
  'in the best (?:possible )?way',
] as const;

export const aiTells: readonly AiTell[] = [
  {
    id: 'staccato-run',
    label: 'Staccato run',
    severity: 'error',
    why: 'Three or more clipped sentences in a row is the model\'s idea of punch. The editor lands one short sentence after a longer one, then moves on.',
    bad: 'Six words that contain an entire philosophy. Write hard. Write clear. Write about what hurts.',
    evidence: 'Runs of 3+ sentences of 5 words or fewer: 0.4 per 10k words in his notes (mostly paired opposites like "Fear and greed. Hope and despair."), 5.3 in the contrast set, 2.2 in AI-polished 2026 essays.',
    detect: detectStaccato,
  },
  {
    id: 'anaphora-triplet',
    label: 'Mechanical anaphora',
    severity: 'error',
    why: 'Three sentences opening with the same words is a sermon template. It reads as rhythm applied from outside.',
    bad: 'Read it when you\'re stuck. Read it when you\'re afraid. Read it when you\'ve forgotten why you started.',
    evidence: 'Not found in his 62 Substack posts; present in the contrast set.',
    detect: detectAnaphora,
  },
  {
    id: 'not-a-x-a-y',
    label: '"Not a X. A Y." fragment',
    severity: 'error',
    why: 'A verbless correction of a position nobody held. checkStyle catches the "not X but Y" sentence; this is the fragment form it misses.',
    bad: 'This essay changed how I think about the web. Not a rant. A diagnosis.',
    evidence: '0 in his notes; in the contrast set ("Not a rant — a diagnosis.").',
    pattern: /(?:^|[.!?]\s+)Not (?:a|an|just|merely|only|another)\b[^.!?\n]{1,40}?(?:[.;:,—–]\s*|\s+-\s+)(?:but\s+)?(?:a|an|it['’]s|rather)\s/gi,
  },
  {
    id: 'doesnt-just',
    label: '"Doesn\'t just X, he Y"',
    severity: 'warn',
    why: 'Inflates a plain verb by denying a lesser one first. The editor\'s "isn\'t just X, it\'s also Y" adds a point; the model\'s version only escalates.',
    bad: 'Ethan Zuckerman doesn\'t just complain about advertising, he traces the exact moment we chose surveillance.',
    evidence: '"doesn\'t/isn\'t just" 1.0 per 10k in his notes, almost all additive ("also"); 5.3 per 10k in the contrast set.',
    pattern: /\b(?:doesn|didn|isn|wasn|don|aren|weren)['’]t (?:just|simply|merely) \w+[^.!?\n]{0,80}?[—–;,:]\s*(?:he|she|it|they|this|that|we|you)\b(?!['’]?s? also| also)/gi,
  },
  {
    id: 'why-it-matters',
    label: '"Why it matters"',
    severity: 'error',
    why: 'Announcing that something matters instead of showing what changes. The contrast set uses "matters" 16 times per 10k words; the editor about once.',
    bad: 'This is why curation matters. The stories we choose to share shape the people who read them.',
    evidence: '"matters" 1.0 per 10k in his notes, 15.9 in the contrast set. "why it matters" never appears in his notes.',
    pattern: /\b(?:why|how) (?:it|this|that|they|these|curation|\w+ing) (?:still )?matters?\b|\bmatters? (?:more|less) than (?:we|you|you['’]d|most|anyone)\b|\bthis is (?:why|what) \w+(?: \w+)? matters\b|\band (?:that|it) matters\b/gi,
  },
  {
    id: 'curator-cliche',
    label: 'Blurb cliché',
    severity: 'error',
    why: 'Stock phrases from publicity copy and recommendation threads. They praise without saying anything a reader could check.',
    bad: 'A love letter to the link. A eulogy and a rallying cry, all at once.',
    evidence: 'None of these phrases appear in his 134k words of notes; "a love letter", "the antidote", "a eulogy", "rallying cry", "all at once" all appear in the 1.4k-word set of model-written site notes.',
    pattern: new RegExp(`(?:${CURATOR_CLICHES.join('|')})\\b`, 'gi'),
  },
  {
    id: 'inflated-stakes',
    label: 'Inflated stakes',
    severity: 'error',
    why: 'Everything is the most important thing ever said, and every sentence a revelation. Superlatives without a measure.',
    bad: 'Twenty-five years later, this remains the most important thing anyone has ever said about the internet.',
    evidence: '"changed/explains everything" 1 use in his notes; "the most important X anyone has ever" 0. Both in the contrast set.',
    pattern: /\b(?:changed|changes|explains|shaped|shapes) everything\b|\b(?:secretly|really) about everything\b|\bthe (?:most important|best|greatest) \w+(?: \w+)? (?:anyone|anybody|you['’]ll|I['’]ve) (?:has |have )?(?:ever|will ever)\b|\bevery (?:sentence|page|line) (?:is|feels like) a revelation\b/gi,
  },
  {
    id: 'signpost-reveal',
    label: 'Signposted reveal',
    severity: 'error',
    why: 'Drum-roll phrases that promise a twist. The editor named one himself as "a classic AI tell": "here\'s the part I can\'t wriggle out of."',
    bad: 'Here\'s the part I can\'t wriggle out of. The answer? Nobody was watching.',
    evidence: '"Here\'s the thing/twist/part" 2 uses in 134k words (his "Here\'s" is almost always "Here\'s an excerpt"); 1.1 per 10k in AI-polished essays.',
    pattern: /\bhere['’]s the (?:thing|twist|kicker|catch|part|truth|secret|real (?:story|question|problem))\b|\bthe part (?:I|we|you) can['’]t (?:wriggle|shake|get) \w+|\bThe (?:answer|result|catch|twist|lesson|kicker|truth|verdict)\?\s/gi,
  },
  {
    id: 'and-yet-opener',
    label: '"And yet" opener',
    severity: 'warn',
    why: 'A stock pivot that signals depth before any is offered.',
    bad: 'The web we loved is gone. And yet, something survives.',
    evidence: '0 sentence-initial "And yet" in his notes; 3.5 per 10k in the contrast set.',
    pattern: /(?:^|[.!?]\s+)And yet\b/g,
  },
  {
    id: 'quiet-register',
    label: '"Quiet" / "quietly"',
    severity: 'warn',
    why: 'The model\'s favourite softener for faux restraint: "the quiet extinction", "quietly radical".',
    bad: 'Robin Sloan catalogues the quiet extinction of the web\'s most beloved species.',
    evidence: '0.2 per 10k in his notes, 1.8 in the contrast set, 2.2 in AI-polished essays.',
    pattern: /\bquietly\b|\bquiet (?:extinction|revolution|radical\w*|power|devastation|confidence|insistence|brilliance|beauty|dignity|grief|courage)\b/gi,
  },
  {
    id: 'possessive-triad',
    label: 'Possessive triad',
    severity: 'error',
    why: '"Your focus, your time, and your right to be present": a three-beat list with a repeated possessive, built for cadence, not content.',
    bad: 'It\'s a manifesto for reclaiming your focus, your time, and your right to simply be present.',
    evidence: '0 in his notes; present in the contrast set and in AI-polished essays.',
    pattern: /\b(your|our|their|its|his|her|my) [\w'’-]+(?: [\w'’-]+)?, \1 [\w'’-]+(?: [\w'’-]+)?,? and \1\b/gi,
  },
  {
    id: 'question-hook',
    label: 'Rhetorical-question hook',
    severity: 'warn',
    why: 'Opening a note with "What if..." or "Remember when..." stages curiosity instead of naming the thing.',
    bad: 'What if we treated the web like an ecosystem instead of a factory?',
    evidence: 'Paragraph-initial "What if / Remember when / Ever wonder / Have you ever": 0.3 per 10k in his notes, 3.5 in the contrast set.',
    pattern: /(?:^|\n)\s*(?:What if|Remember when|Ever (?:wonder|wondered)|Have you ever|Imagine a)\b[^?\n]*\?/gi,
  },
  {
    id: 'no-x-no-y',
    label: '"No X. No Y. Just Z."',
    severity: 'error',
    why: 'The negative list followed by a reveal is advertising cadence.',
    bad: 'No algorithms. No feeds. Just a person who cares.',
    evidence: '0 in his notes.',
    pattern: /\bNo \w+(?: \w+){0,3}\. No \w+(?: \w+){0,3}\.(?: (?:Just|Only|Simply) [^.!?\n]+[.!?])?/g,
  },
  {
    id: 'not-because-but-because',
    label: '"Not because X, but because Y"',
    severity: 'error',
    why: 'The long form of "not X but Y". checkStyle catches the short one; this catches spans over five words.',
    bad: 'I keep coming back to it not because it\'s well written, but because it refuses to flatter me.',
    evidence: '1 use in 134k words of his notes; 3.5 per 10k in the contrast set.',
    pattern: /\bnot because\b[^.!?\n]{1,90}\bbut because\b/gi,
  },
  {
    id: 'summary-closer',
    label: 'Moral in the last line',
    severity: 'warn',
    why: 'Ending by telling the reader what it all meant. The editor ends on a question ("What did you think?"), a sign-off, or a joke.',
    bad: 'The stories we share shape the people who read them. That\'s the point.',
    evidence: 'His 62 posts close with "What did/do you think?" (9), "That\'s it for this week" (13 including variants), or a comic send-off ("Go and suffer a little."); none closes on a moral.',
    detect: detectSummaryCloser,
  },
  {
    id: 'first-person',
    label: 'Machine writing as the editor',
    severity: 'error',
    machineOnly: true,
    why: 'The machine never writes in the editor\'s first person, and never invents his habits ("I keep this on a sticky note above my desk", "I bookmarked this three times").',
    bad: 'I found this in a digital art archive last Tuesday at 2am.',
    evidence: 'Every invented anecdote in the model-written site notes was first person. Decision of 2026-10-16: route lines stay by:machine.',
    pattern: /(?<!(?:War|Part|Chapter|Act|Book|Volume|Henry|Charles|Elizabeth|James|George|Louis|William) )\b(?:I|I['’](?:m|ve|d|ll)|me|my|mine|myself)\b(?![.-]\w)/g,
  },
  {
    id: 'praise-adjective',
    label: 'Praise adjective',
    severity: 'warn',
    machineOnly: true,
    why: 'Blurb words. They are also the editor\'s own heaviest tic, which is exactly why a model must not borrow them: copied, they read as his weakest habit.',
    bad: 'A brilliant, fascinating conversation with an amazing guest.',
    evidence: 'brilliant 110, fascinating 70, interesting 69, amazing 58, wonderful 54, beautiful 46, delightful 17 in his notes: one praise adjective every 315 words. ("profound" is already banned in style.ts.)',
    pattern: /\b(?:brilliant(?:ly)?|fascinating|amazing(?:ly)?|incredible|incredibly|stunning(?:ly)?|remarkabl[ey]|wonderful(?:ly)?|delightful(?:ly)?|compelling|gorgeous|masterful(?:ly)?|exquisite(?:ly)?|riveting|essential reading|must-read)\b/gi,
  },
];

/** Run the voice tells over machine prose. Findings are sorted by position. */
export function voiceCheck(text: string, options: VoiceCheckOptions = {}): VoiceFinding[] {
  const machine = options.machine ?? true;
  const out: VoiceFinding[] = [];
  for (const tell of aiTells) {
    if (tell.machineOnly && !machine) continue;
    const matches: VoiceMatch[] = tell.detect
      ? tell.detect(text)
      : [...text.matchAll(tell.pattern!)].map((m) => {
          // Patterns that anchor on a preceding sentence end report from the first letter.
          const lead = m[0].length - m[0].replace(/^(?:[.!?]\s+|\n\s*)/, '').length;
          return { match: m[0].slice(lead).trim(), index: (m.index ?? 0) + lead };
        });
    for (const m of matches) {
      out.push({ id: tell.id, severity: tell.severity, match: m.match, index: m.index, message: `${tell.label}: ${tell.why}` });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** A compact, model-readable list of voice problems, for regeneration prompts. */
export function describeVoiceFindings(findings: VoiceFinding[]): string {
  const seen = new Set<string>();
  return findings
    .filter((f) => f.severity === 'error')
    .filter((f) => (seen.has(f.id + f.match) ? false : (seen.add(f.id + f.match), true)))
    .map((f) => `- ${aiTells.find((t) => t.id === f.id)!.label} (found: "${f.match.slice(0, 60)}")`)
    .join('\n');
}

// ---------------------------------------------------------------------------------------------
// Dictation. Proper nouns and terms the editor says often, most useful first, so a caller with a
// short prompt budget (Whisper reads about 224 tokens) can take a prefix. Public names only.

export const dictionaryHints: readonly string[] = [
  // This publication and the editor's projects
  'From the Dumpster Fire', 'Haul', 'the Desk', 'Akshara', 'Dhwani', 'Maatu', 'Poetic Reveries',
  'Paper Lanterns', 'Tipsheet', 'Rabbit Holes', 'Life in India', 'Economic Atlas',
  // Work
  'Zerodha', 'Rainmatter', 'Kite', 'Zerodha Varsity', 'Markets by Zerodha', 'Climate Brief', 'Substack',
  // Indian markets and statistics
  'SEBI', 'RBI', 'NSE', 'BSE', 'MoSPI', 'EPFO', 'UPI', 'AMFI', 'IRDAI', 'Nifty', 'Sensex', 'F&O', 'SIP',
  'ULIP', 'PMS', 'AIF', 'NAV', 'DRHP', 'bhavcopy', 'G-Sec', 'lakh', 'crore', 'rupee', 'Financial Stability Report',
  'household debt',
  // Places and Indian words
  'Bengaluru', 'Bangalore', 'Namma Bengaluru', 'BBMP', 'Silk Board', 'Majestic', 'Kannada', 'Sanskrit',
  'Devanagari', 'Bhojpuri', 'gyan',
  // Models and tools he names in dictation
  'Claude', 'Claude Code', 'ChatGPT', 'Gemini', 'DeepSeek', 'Qwen', 'Kimi', 'Grok', 'LongCat', 'MiMo',
  'OpenRouter', 'OpenCode', 'Sarvam', 'Wispr Flow', 'Whisper', 'Anthropic', 'OpenAI', 'Cloudflare',
  'Wikisource', 'Wikidata', 'Internet Archive', 'Public Domain Review', 'The Marginalian',
  // Writers and figures he cites (public)
  'George Carlin', 'Gaston Bachelard', 'Byung-Chul Han', 'Jonathan Haidt', 'Robert Sapolsky', 'Anna Lembke',
  'Adam Tooze', 'Morgan Housel', 'Maria Popova', 'Rebecca Solnit', 'Will Storr', 'Iain McGilchrist',
  'Dan Carlin', 'Robin Hanson', 'Neil Postman', 'Gurwinder Bhogal', 'Corey Hoffstein', 'Jim Chanos',
  'Niall Ferguson', 'Malcolm McLean', 'Antonio Gramsci', 'Seneca', 'Emily Wilson', 'Christopher Nolan',
  // The Odyssey essay's cast (dictated, often garbled)
  'Homer', 'Odysseus', 'Telemachus', 'Penelope', 'Athena', 'Clytemnestra', 'Agamemnon', 'Orestes',
  'Aegisthus', 'Iphigenia', 'Electra', 'Hesiod', 'Oresteia', 'Hill of Ares',
];

/**
 * Garbles seen in the editor's dictated text, with what he meant. "observed" ones were found in
 * the 2026-09/10 Claude Code prompts or the raw essay transcripts; "earlier" ones come from the
 * earlier writing-voice profile and could not be re-checked (those transcripts were not kept).
 */
export const dictationGarbles: readonly { heard: string; meant: string; source: 'observed' | 'earlier' }[] = [
  { heard: 'Axara', meant: 'Akshara', source: 'observed' },
  { heard: 'Quen', meant: 'Qwen', source: 'observed' },
  { heard: 'Mospy / Mospi', meant: 'MoSPI', source: 'observed' },
  { heard: 'Bhav copy / Baovcopy', meant: 'bhavcopy', source: 'observed' },
  { heard: 'household dent', meant: 'household debt', source: 'observed' },
  { heard: 'Gurwinder Bogal / Gurvinder', meant: 'Gurwinder Bhogal', source: 'observed' },
  { heard: 'Corey Hofstein', meant: 'Corey Hoffstein', source: 'observed' },
  { heard: 'Longcast', meant: 'LongCat', source: 'observed' },
  { heard: 'Athina', meant: 'Athena', source: 'observed' },
  { heard: 'Maathu / Mathu', meant: 'Maatu', source: 'observed' },
  { heard: 'Zero The Varsity', meant: 'Zerodha Varsity', source: 'observed' },
  { heard: 'played by blood', meant: 'paid by blood', source: 'observed' },
  { heard: 'Malcom McLean', meant: 'Malcolm McLean', source: 'observed' },
  { heard: 'Kelly Marcus', meant: 'Telemachus', source: 'earlier' },
  { heard: "Ari's Hill", meant: 'Hill of Ares', source: 'earlier' },
  { heard: 'Chad GPT', meant: 'ChatGPT', source: 'earlier' },
];

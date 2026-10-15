// Voice-note cleanup is deletion-only. The editor's words are never reworded: a cleaned transcript
// may drop fillers and stutters and change punctuation and capitalisation, nothing else.
// `checkDeletionOnly` is the gate every cleaned transcript passes before it is stored.

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

/** Single words that may be deleted as fillers. */
export const FILLER_WORDS = new Set([
  'um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'ah', 'eh', 'hmm', 'mm', 'mhm',
  'like', 'so', 'basically', 'actually', 'literally', 'okay', 'ok', 'right', 'well', 'yeah', 'anyway',
]);

/** Two-word fillers that may be deleted together (never one word of the pair alone). */
export const FILLER_PHRASES = new Set(['you know', 'i mean', 'kind of', 'sort of', 'you see']);

/** Only these are removed by the code-only fallback; they never carry meaning. */
const PURE_FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'hmm', 'mm', 'mhm']);

/** Words that legitimately repeat ("that that", "had had") and are never treated as stutters. */
const LEGIT_DOUBLES = new Set(['that', 'had', 'is', 'do']);

const fold = (w: string) => w.toLowerCase().replace(/’/g, "'");

export function words(text: string): string[] {
  return [...text.matchAll(WORD_RE)].map((m) => m[0]);
}

/** Same word, allowing only a change of case in its first letter (sentence starts). */
function sameWord(input: string, output: string): boolean {
  if (input === output) return true;
  const a = input.replace(/’/g, "'");
  const b = output.replace(/’/g, "'");
  if (a === b) return true;
  return a.length === b.length && a.slice(1) === b.slice(1) && a[0]!.toLowerCase() === b[0]!.toLowerCase();
}

export interface DeletionReport {
  ok: boolean;
  /** Input words the cleanup removed, in order. */
  deleted: string[];
  /** Why it failed: an inserted or changed word, or a deletion that wasn't a filler or stutter. */
  problems: string[];
}

/**
 * Verify that `output` is `input` with only filler/stutter words deleted and punctuation or
 * capitalisation changed. Uses a small DP so that the most charitable alignment is found.
 */
export function checkDeletionOnly(input: string, output: string): DeletionReport {
  const a = words(input);
  const b = words(output);
  const n = a.length;
  const m = b.length;
  const INF = 1e9;
  // cost[i][j]: minimum number of disallowed deletions to align a[i..] with b[j..].
  const cost: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF));
  const step: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  // step codes: 1 keep, 2 delete filler/stutter, 3 delete phrase (two words), 4 delete disallowed
  cost[n]![m] = 0;
  for (let i = n; i >= 0; i--) {
    for (let j = m; j >= 0; j--) {
      if (i === n && j === m) continue;
      let best = INF;
      let how = 0;
      if (i < n && j < m && sameWord(a[i]!, b[j]!) && cost[i + 1]![j + 1]! < best) {
        best = cost[i + 1]![j + 1]!;
        how = 1;
      }
      if (i < n) {
        const w = fold(a[i]!);
        const stutter = i + 1 < n && fold(a[i + 1]!) === w && !LEGIT_DOUBLES.has(w);
        const free = FILLER_WORDS.has(w) || stutter;
        const c = cost[i + 1]![j]! + (free ? 0 : 1);
        if (c < best) {
          best = c;
          how = free ? 2 : 4;
        }
        if (i + 1 < n && FILLER_PHRASES.has(`${w} ${fold(a[i + 1]!)}`) && cost[i + 2]![j]! < best) {
          best = cost[i + 2]![j]!;
          how = 3;
        }
      }
      cost[i]![j] = best;
      step[i]![j] = how;
    }
  }
  if (cost[0]![0]! >= INF) {
    // The output contains a word that cannot be aligned: something was inserted or changed.
    const inputSet = new Set(a.map(fold));
    const foreign = b.filter((w) => !inputSet.has(fold(w)));
    return {
      ok: false,
      deleted: [],
      problems: foreign.length ? foreign.map((w) => `added or changed word: "${w}"`) : ['words were reordered'],
    };
  }
  const deleted: string[] = [];
  const problems: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const how = step[i]![j]!;
    if (how === 1) {
      i++;
      j++;
    } else if (how === 2) {
      deleted.push(a[i]!);
      i++;
    } else if (how === 3) {
      deleted.push(`${a[i]} ${a[i + 1]}`);
      i += 2;
    } else if (how === 4) {
      deleted.push(a[i]!);
      problems.push(`deleted a word that is not a filler: "${a[i]}"`);
      i++;
    } else break;
  }
  return { ok: problems.length === 0, deleted, problems };
}

/**
 * The code-only cleanup, used when no model is available or the model's cleanup fails the check.
 * Removes pure fillers (um, uh, er...) and immediate repetitions, then tidies spacing and capitals.
 */
export function cleanupDeterministic(input: string): string {
  let out = input.replace(/\s+/g, ' ').trim();
  // Pure fillers, with a comma that belongs to them.
  out = out.replace(/(^|[\s,.;!?])(?:um+|uh+m?|erm?|hmm+|mm+|mhm)\b[,.]?/gi, '$1');
  // Stutters: "I I think", "the the".
  out = out.replace(/\b([\p{L}']+)(?:\s+\1\b)+/giu, (run: string, w: string) => (LEGIT_DOUBLES.has(fold(w)) ? run : w));
  out = out
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])(?=[^\s\d])/g, '$1 ')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/^[\s,.;:]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Capitalise the first letter and the first letter after a sentence end.
  out = out.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_, pre: string, ch: string) => pre + ch.toUpperCase());
  return out;
}

export function isPureFiller(word: string): boolean {
  return PURE_FILLERS.has(fold(word));
}

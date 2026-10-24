// Code blocks arrive with their tokens highlighted at publish (@fdf/shared/highlight): runs of text,
// each with a role. A phone sets code line by line (numbered, scrolled sideways as one block), so the
// runs are cut at newlines here. Joined back, the lines are exactly the code.

import type { CodeToken } from '@fdf/shared/haul';

export type Run = CodeToken;

export function codeLines(code: string, tokens?: CodeToken[]): Run[][] {
  const runs: CodeToken[] = tokens?.length ? tokens : [['', code]];
  const lines: Run[][] = [[]];
  for (const [role, text] of runs) {
    const parts = text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push([role, part]);
    });
  }
  // A trailing newline ends the last line; it does not start an empty one.
  if (lines.length > 1 && lines[lines.length - 1]!.length === 0) lines.pop();
  return lines;
}

/** Short names for a code block's language, for the line above it (as on the website). */
export const CODE_LANGS: Record<string, string> = {
  bash: 'Shell', sh: 'Shell', shell: 'Shell', c: 'C', cpp: 'C++', css: 'CSS', diff: 'Diff', go: 'Go', java: 'Java', javascript: 'JavaScript', js: 'JavaScript',
  json: 'JSON', markdown: 'Markdown', python: 'Python', py: 'Python', ruby: 'Ruby', rust: 'Rust', sql: 'SQL', typescript: 'TypeScript', ts: 'TypeScript',
  xml: 'HTML', html: 'HTML', yaml: 'YAML',
};

/** "1:02:03" or "4:05" for a number of seconds; empty for none. */
export function clock(s?: number) {
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

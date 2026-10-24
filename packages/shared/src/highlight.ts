// Code highlighting for code blocks, run once at publish so the bundle carries the tokens and the
// site and the app only print them (no highlighter in the reader Worker or the app). highlight.js
// with a fixed set of languages; its scopes fold into the ten roles in tokens.ts (CodeRole), which
// the palette colours. The tokens always join back to the code exactly; validateHaul checks it.

import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import type { CodeToken } from './haul';
import type { CodeRole } from './tokens';

const LANGS = { bash, c, cpp, css, diff, go, java, javascript, json, markdown, python, ruby, rust, sql, typescript, xml, yaml };
for (const [name, def] of Object.entries(LANGS)) hljs.registerLanguage(name, def);

/** Names the Desk offers, with their common aliases. */
export const CODE_LANGS: Record<string, string> = {
  bash: 'Shell', c: 'C', cpp: 'C++', css: 'CSS', diff: 'Diff', go: 'Go', java: 'Java', javascript: 'JavaScript', json: 'JSON',
  markdown: 'Markdown', python: 'Python', ruby: 'Ruby', rust: 'Rust', sql: 'SQL', typescript: 'TypeScript', xml: 'HTML or XML', yaml: 'YAML',
};
const ALIAS: Record<string, string> = { sh: 'bash', shell: 'bash', zsh: 'bash', js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', html: 'xml', svg: 'xml', yml: 'yaml', md: 'markdown', rs: 'rust', 'c++': 'cpp', rb: 'ruby' };
export const codeLang = (lang?: string): string | undefined => {
  const l = lang?.trim().toLowerCase();
  if (!l) return undefined;
  const name = ALIAS[l] ?? l;
  return name in LANGS ? name : undefined;
};

/** highlight.js scope (first word, e.g. "title.function" -> "title.function") to a role. */
function roleOf(scope: string): CodeRole | '' {
  const s = scope.split(' ')[0]!;
  if (s.startsWith('title.class') || s === 'type' || s === 'class') return 't';
  if (s.startsWith('title') || s === 'function' || s === 'section') return 'f';
  if (s === 'keyword' || s === 'built_in' || s === 'selector-tag' || s === 'name' || s === 'operator') return 'k';
  if (s === 'string' || s === 'regexp' || s === 'symbol' || s === 'char' || s === 'link') return 's';
  if (s === 'comment' || s === 'quote' || s === 'doctag') return 'c';
  if (s === 'number' || s === 'literal' || s === 'bullet') return 'n';
  if (s === 'attr' || s === 'attribute' || s === 'property' || s === 'params' || s === 'variable' || s.startsWith('selector-')) return 'a';
  if (s === 'meta' || s === 'tag' || s === 'subst' || s === 'template-tag' || s === 'template-variable') return 'm';
  if (s === 'deletion') return 'd';
  if (s === 'addition') return 'i';
  return '';
}

const ENTITY: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };
const unescape = (t: string) => t.replace(/&(lt|gt|amp|quot|#x27|#39);/g, (m) => ENTITY[m] ?? m);

/**
 * Tokens for a block of code. Unknown or missing language: one plain token (the code is still
 * printed, set but not coloured). Adjacent runs of the same role merge.
 */
export function highlightCode(code: string, lang?: string): CodeToken[] {
  const name = codeLang(lang);
  if (!name || !code) return [['', code]];
  let html: string;
  try {
    html = hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
  } catch {
    return [['', code]];
  }
  const out: CodeToken[] = [];
  const stack: (CodeRole | '')[] = [];
  const push = (role: CodeRole | '', text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last[0] === role) last[1] += text;
    else out.push([role, text]);
  };
  const re = /<span class="([^"]+)">|<\/span>|([^<]+)/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[1] !== undefined) {
      const inner = roleOf(m[1].replace(/hljs-/g, '').replace(/_+$/, ''));
      // A plain scope inside a coloured one keeps the outer colour (e.g. params inside a function title).
      stack.push(inner || stack[stack.length - 1] || '');
    } else if (m[0] === '</span>') stack.pop();
    else push(stack[stack.length - 1] ?? '', unescape(m[2]!));
  }
  // Never ship tokens that do not rebuild the code.
  return out.map((t) => t[1]).join('') === code ? out : [['', code]];
}

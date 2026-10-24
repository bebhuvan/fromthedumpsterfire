// The slice of highlight.js that @fdf/shared/highlight uses, for the Worker projects' type check.
// highlight.js's own types pull in the DOM library (`/// <reference lib="dom" />`), which replaces
// the Workers' fetch and body types and breaks every Worker file; tsconfig "paths" points the
// Workers here instead. The code that runs is highlight.js itself.

declare const hljs: {
  registerLanguage(name: string, language: unknown): void;
  highlight(code: string, options: { language: string; ignoreIllegals?: boolean }): { value: string };
};
export default hljs;

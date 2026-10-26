// In tests (Node), the Worker's `import wasm from '@resvg/resvg-wasm/index_bg.wasm'` resolves here
// (vitest.config.ts): the wasm's bytes, which resvg's initWasm takes as readily as a compiled module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const fs: Any = await import('node:fs' as string);
const mod: Any = await import('node:module' as string);
const require = mod.createRequire(import.meta.url);
export default new Uint8Array(fs.readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));

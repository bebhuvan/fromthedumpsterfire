// wrangler bundles a .wasm import as a compiled WebAssembly.Module (its default CompiledWasm rule).
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}

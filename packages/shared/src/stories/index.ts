// Data stories (docs/DATA-STORIES.md): the grammar as code. A story is data (spec.ts), checked by
// validateStory, drawn plate by plate into scenes (the chart kit's scene, so the website and the
// app's pictures draw them the same way).

export * from './spec';
export * from './grammar';
export * from './plate';
export * from './ink';
export { pack } from './forms/swarm';
export { Placer, place, overlaps, type Box } from './place';

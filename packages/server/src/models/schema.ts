// JSON schemas for providers that enforce them. Each provider's constrained decoding accepts a
// different subset of JSON Schema, so the schema sent to it is trimmed to that subset. The trimmed
// keywords (array lengths, number ranges) are still enforced: zod validates every answer, and a
// failure gets one repair turn with the problems listed.

import { z } from 'zod';

export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

export interface TrimRules {
  /** Keywords to remove wherever they appear. */
  drop: readonly string[];
  /** Largest minItems the provider accepts; larger values are removed. */
  maxMinItems?: number;
  /** Set additionalProperties: false on every object. */
  closeObjects?: boolean;
}

export function trimSchema(schema: unknown, rules: TrimRules): Record<string, unknown> {
  const drop = new Set(rules.drop);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (drop.has(k)) continue;
      if (k === 'minItems' && rules.maxMinItems !== undefined && typeof v === 'number' && v > rules.maxMinItems) continue;
      // Property names are data, not keywords: recurse into each property's schema only.
      if (k === 'properties' && v && typeof v === 'object') {
        out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([name, s]) => [name, walk(s)]));
        continue;
      }
      out[k] = walk(v);
    }
    if (rules.closeObjects && out.type === 'object') out.additionalProperties = false;
    return out;
  };
  return walk(schema) as Record<string, unknown>;
}

/** Claude structured outputs: no number ranges, string lengths or item counts beyond minItems 0/1. */
export const ANTHROPIC_SCHEMA: TrimRules = {
  drop: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems', 'pattern', '$schema'],
  maxMinItems: 1,
  closeObjects: true,
};

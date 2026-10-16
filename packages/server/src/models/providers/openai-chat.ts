// The chat-completions shape that DeepSeek and Z.ai both speak natively. Each provider module
// supplies its own thinking parameters and usage fields; the messages, images and JSON mode are
// shared. Stable text goes first in the user turn so the providers' automatic prefix caches hit.

import { ModelError, type ProviderAnswer, type ProviderRequest } from '../types';

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } } | { type: 'file'; file: { file_data: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Part[];
}

export function chatMessages(req: ProviderRequest, opts: { schemaInPrompt: boolean; files?: boolean }): ChatMessage[] {
  // JSON-object mode does not enforce a schema, so the schema is stated in the system prompt.
  const system = opts.schemaInPrompt ? `${req.system}\n\nAnswer with one JSON object only, matching this JSON schema:\n${JSON.stringify(req.schema)}` : req.system;
  const text = req.context ? `${req.context}\n\n${req.prompt}` : req.prompt;
  const media: Part[] = [
    ...(opts.files ? req.documents.map((d): Part => ({ type: 'file', file: { file_data: `data:${d.mime};base64,${d.base64}` } })) : []),
    ...req.images.map((im): Part => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.base64}` } })),
  ];
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: media.length ? [...media, { type: 'text', text }] : text },
  ];
  if (req.repair) {
    messages.push({ role: 'assistant', content: req.repair.previous });
    messages.push({ role: 'user', content: `That JSON did not match the schema: ${req.repair.problem}. Reply again with the corrected JSON object only.` });
  }
  return messages;
}

/** Content and finish reason from a chat-completions answer. Reasoning text is discarded. */
export function chatContent(json: Record<string, unknown>, provider: string): { content: unknown; finish: string } {
  const choice = (json.choices as Array<{ message?: { content?: unknown }; finish_reason?: string }> | undefined)?.[0];
  if (!choice) throw new ModelError(`${provider} returned no choices`);
  const reason = String(choice.finish_reason ?? '');
  const finish = reason === 'stop' ? 'stop' : reason === 'length' || reason === 'model_context_window_exceeded' ? 'length' : reason === 'content_filter' || reason === 'sensitive' ? 'filter' : reason;
  return { content: choice.message?.content ?? null, finish };
}

export type { ProviderAnswer };

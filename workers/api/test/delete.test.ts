// Deleting an item: refused for a published Haul's item; otherwise rows, private files and vectors go.

import { describe, expect, it } from 'vitest';
import app from '../src/index';

const BASE = 'http://127.0.0.1:8787';
const headers = { origin: BASE, 'sec-fetch-site': 'same-origin', 'x-desk': '1' };

function env(published: boolean) {
  const sql: string[] = [];
  const deleted: string[][] = [];
  const sent: unknown[] = [];
  const first = (q: string) => {
    if (q.startsWith('SELECT * FROM items')) return { id: 'it1', file_key: 'uploads/it1.pdf' };
    if (q.includes('haul_items')) return published ? { status: 'published' } : null;
    if (q.startsWith('SELECT snapshot_key')) return { snapshot_key: 'snapshots/it1.html', text_key: 'snapshots/it1/text.txt' };
    return null;
  };
  const all = (q: string) => {
    if (q.startsWith('SELECT audio_key')) return [{ audio_key: 'notes/n1.webm' }];
    if (q.startsWith('SELECT id FROM chunks')) return [{ id: 'it1:card' }, { id: 'it1:0' }];
    return [];
  };
  const stmt = (q: string) => ({ bind: () => stmt(q), first: async () => first(q), all: async () => ({ results: all(q) }), run: async () => (sql.push(q), {}), q });
  return {
    sql,
    deleted,
    sent,
    env: {
      ENVIRONMENT: 'local',
      DEV_AUTH_BYPASS: '1',
      DB: { prepare: stmt, batch: async (ss: Array<{ q: string }>) => (ss.forEach((s) => sql.push(s.q)), []) },
      MEDIA: { delete: async (k: string[]) => void deleted.push(k) },
      INGEST_QUEUE: { send: async (m: unknown) => void sent.push(m) },
    },
  };
}

describe('DELETE /api/items/:id', () => {
  it('removes the rows, the private files and (through the pipeline) the vectors', async () => {
    const t = env(false);
    const res = await app.request(`${BASE}/api/items/it1`, { method: 'DELETE', headers }, t.env);
    expect(res.status).toBe(200);
    expect(t.sql.some((q) => q.startsWith('DELETE FROM items'))).toBe(true);
    expect(t.sql.some((q) => q.startsWith('UPDATE rhymes SET then_item_id = NULL'))).toBe(true);
    expect(t.sql.some((q) => q.startsWith('DELETE FROM notes'))).toBe(true);
    expect(t.sql.some((q) => q.startsWith('DELETE FROM runs'))).toBe(true);
    expect(t.sql.some((q) => q.includes('model_calls'))).toBe(false);
    expect(t.deleted).toEqual([['uploads/it1.pdf', 'snapshots/it1.html', 'snapshots/it1/text.txt', 'notes/n1.webm']]);
    expect(t.sent).toEqual([{ kind: 'purge', vectorIds: ['it1:card', 'it1:0'] }]);
  });

  it('refuses an item in a published Haul', async () => {
    const t = env(true);
    const res = await app.request(`${BASE}/api/items/it1`, { method: 'DELETE', headers }, t.env);
    expect(res.status).toBe(409);
    expect(t.sql).toEqual([]);
    expect(t.deleted).toEqual([]);
  });
});

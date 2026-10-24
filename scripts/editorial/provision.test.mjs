import { expect, it, vi } from 'vitest';
import { provisionAccess } from './provision.mjs';
const appId = '11111111-1111-1111-1111-111111111111';
const app = { id: appId, type: 'self_hosted', domain: 'desk.fromthedumpsterfire.com' };
const origin = 'https://desk.fromthedumpsterfire.com';
const service = { id: 'token-id', client_id: 'editor.access', client_secret: 'private-secret', expires_at: '2027-01-22' };
function fixture(over = {}) {
  const api = vi.fn(async (path, method = 'GET', data) => {
    if (over.handle) { const result = await over.handle(path, method, data); if (result) return result; }
    if (method === 'DELETE') return { success: true };
    if (path.startsWith('/apps?')) return { result: [app], result_info: { total_pages: 1 } };
    if (path === `/apps/${appId}`) return { result: app };
    if (path === '/service_tokens') return { result: service };
    if (path === `/apps/${appId}/policies`) return { result: { id: 'policy-id' } };
    throw new Error('Unexpected API call');
  });
  return api;
}
it('defaults to read-only planning, with no credential or policy creation', async () => {
  const api = fixture(), saveCredential = vi.fn();
  const r = await provisionAccess({ api, origin, name: 'Cloud session', saveCredential });
  expect(r).toMatchObject({ apply: false, durationDays: 90, scope: 'draft' });
  expect(api.mock.calls.every((c) => !c[1] || c[1] === 'GET')).toBe(true);
  expect(saveCredential).not.toHaveBeenCalled();
});
it('creates only its own service token/policy and sends secrets only to the credential writer', async () => {
  const api = fixture(), saveCredential = vi.fn();
  const r = await provisionAccess({ api, origin, name: 'Remote', apply: true, saveCredential });
  expect(saveCredential).toHaveBeenCalledWith(expect.objectContaining({ clientSecret: service.client_secret }));
  expect(JSON.stringify(r)).not.toContain(service.client_secret);
  expect(api).toHaveBeenCalledWith(`/apps/${appId}/policies`, 'POST', { name: 'Remote', decision: 'non_identity', include: [{ service_token: { token_id: service.id } }] });
  expect(api.mock.calls.some((c) => c[1] === 'PUT')).toBe(false);
});
it('rolls back only newly created resources if policy creation or private file saving fails', async () => {
  const api = fixture();
  await expect(provisionAccess({ api, origin, name: 'Remote', apply: true, saveCredential: async () => { throw new Error('disk full'); } })).rejects.toThrow('disk full');
  expect(api).toHaveBeenCalledWith(`/apps/${appId}/policies/policy-id`, 'DELETE');
  expect(api).toHaveBeenCalledWith('/service_tokens/token-id', 'DELETE');
  const denied = fixture({ handle: async (path, method) => { if (path.endsWith('/policies') && method === 'POST') throw new Error('Access denied'); } });
  await expect(provisionAccess({ api: denied, origin, name: 'Remote', apply: true, saveCredential: vi.fn() })).rejects.toThrow('Access denied');
  expect(denied).toHaveBeenCalledWith('/service_tokens/token-id', 'DELETE');
});
it('paginates discovery and refuses a mismatched app even with an explicit app ID', async () => {
  const api = fixture({ handle: async (path) => {
    if (path.startsWith('/apps?page=1&')) return { result: [], result_info: { total_pages: 2 } };
    if (path.startsWith('/apps?page=2&')) return { result: [app], result_info: { total_pages: 2 } };
  } });
  expect(await provisionAccess({ api, origin, name: 'Remote' })).toMatchObject({ appId });
  expect(api.mock.calls).toHaveLength(3);
  await expect(provisionAccess({ api: fixture(), origin: 'https://elsewhere.example', appId, apply: true, name: 'Remote' })).rejects.toThrow(/expected domain/);
});

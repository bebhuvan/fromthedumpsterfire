// Provision only a new service token and its policy, preserving every existing owner policy.
// Injectable API/credential writer make discovery, failure and rollback paths testable.
export async function provisionAccess({ api, origin, appId, name, scope = 'draft', apply = false, saveCredential }) {
  if (!['draft', 'publish'].includes(scope)) throw new Error('Invalid service scope');
  let app;
  if (appId) {
    if (!/^[a-f0-9-]{32,36}$/i.test(appId)) throw new Error('Invalid Access app ID');
    app = (await api(`/apps/${appId}`)).result;
  } else {
    const apps = [];
    for (let page = 1; ; page++) {
      const result = await api(`/apps?page=${page}&per_page=100`);
      apps.push(...result.result);
      if (page >= (result.result_info?.total_pages ?? 1)) break;
      if (page >= 100) throw new Error('Access app listing exceeded 100 pages');
    }
    const matches = apps.filter((a) => a.domain === new URL(origin).hostname);
    if (matches.length !== 1) throw new Error('Could not identify exactly one existing Desk Access app. Check Access permissions, or set FDF_ACCESS_APP_ID in the admin config. No application was changed.');
    app = (await api(`/apps/${matches[0].id}`)).result;
  }
  if (!app?.id || app.domain !== new URL(origin).hostname || app.type !== 'self_hosted') throw new Error('The selected app must be the self-hosted Desk at the expected domain');
  const plan = { domain: app.domain, appId: app.id, name, scope, durationDays: 90 };
  if (!apply) return { apply: false, ...plan };
  let tokenId, policyId;
  try {
    const service = (await api('/service_tokens', 'POST', { name, duration: '2160h' })).result;
    tokenId = service?.id;
    if (!tokenId || !service.client_id || !service.client_secret) throw new Error('Cloudflare did not return a complete service credential. Inspect service tokens before retrying.');
    if (!/^[A-Za-z0-9._-]+$/.test(service.client_id) || !/^[A-Za-z0-9_-]+$/.test(service.client_secret)) throw new Error('Unexpected service credential format');
    const policy = (await api(`/apps/${app.id}/policies`, 'POST', { name, decision: 'non_identity', include: [{ service_token: { token_id: tokenId } }] })).result;
    policyId = policy?.id;
    if (!policyId) throw new Error('Cloudflare did not return the created policy ID; inspect app policies before retrying.');
    const receipt = { ...plan, tokenId, policyId, clientId: service.client_id, expiresAt: service.expires_at, createdAt: new Date().toISOString() };
    // saveCredential must use exclusive create, chmod 600, and remove partial output on failure.
    await saveCredential({ origin, clientId: service.client_id, clientSecret: service.client_secret, receipt });
    return { apply: true, ...receipt };
  } catch (e) {
    const cleanupRequired = [];
    if (policyId) try { await api(`/apps/${app.id}/policies/${policyId}`, 'DELETE'); } catch { cleanupRequired.push('Service Auth policy'); }
    if (tokenId) try { await api(`/service_tokens/${tokenId}`, 'DELETE'); } catch { cleanupRequired.push('service token'); }
    if (cleanupRequired.length) throw new Error(`Setup failed; revoke ${cleanupRequired.join(' and ')} manually (app ${app.id}, token ${tokenId}, policy ${policyId ?? 'unknown'}). Inspect Access before retrying.`);
    throw e;
  }
}

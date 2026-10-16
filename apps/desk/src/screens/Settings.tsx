// What the Desk is running on: spend, model routes, secrets present (never their values), Access,
// devices and the most recent model calls.

import { api, type Spend } from '../api';
import { useLoad } from '../lib/core';

interface SettingsData {
  environment: string;
  spend: Spend;
  routes: { gatewayMissing: boolean; byok: boolean; transcribe: { model: string }; tasks: Record<string, Array<{ key: string; provider: string; model: string; available: boolean; viaGateway?: boolean; thinking?: string }>> };
  secrets: Record<string, boolean>;
  access: { teamDomain: boolean; aud: boolean; owner: string };
  devices: Array<{ platform: string; enabled: number; n: number }>;
  recentCalls: Array<{ at: string; task: string; provider: string; model: string; input_tokens: number; cached_input_tokens?: number; output_tokens: number; reasoning_tokens?: number; audio_seconds: number; cost_usd: number; latency_ms: number; ok: number; error: string | null }>;
  spendByTask: Array<{ task: string; calls: number; cost: number }>;
  filesBase: string;
}

const TASKS: Record<string, string> = {
  read: 'Reading cards',
  draft: 'Drafting',
  judge: 'Checking notes',
  clean: 'Voice cleanup',
  ocr: 'Page photos and scans',
  haul: 'Field-note help',
  plate: 'Plate searches',
  connect: 'Judging links',
  thread: 'Thread drafts',
  bridge: 'Rhyme bridges',
};

export function Settings() {
  const { data, error } = useLoad(() => api.get<SettingsData>('/api/settings'), []);
  if (error) return <p className="tray-empty">{error}</p>;
  if (!data) return <p className="tray-empty">Opening…</p>;
  const s = data.spend;
  return (
    <div className="stack" style={{ gap: 30, maxWidth: 1100 }}>
      <div>
        <div className="label">Settings · {data.environment}</div>
        <h1 className="display" style={{ fontSize: 40, margin: '6px 0 0' }}>
          The machinery
        </h1>
      </div>

      <section className="section">
        <h2 className="h2">Spend this month</h2>
        <p className="serif" style={{ fontSize: 20, margin: 0 }}>
          <span className="num">${s.spentUsd.toFixed(3)}</span> spent; warning at ${s.warnUsd}, calls stop at ${s.ceilingUsd}.{' '}
          {s.state !== 'ok' && <span className={s.state === 'ceiling' ? 'bad' : 'warn'}>{s.state === 'ceiling' ? 'The ceiling is reached: model calls are paused.' : 'Past the warning line.'}</span>}
        </p>
        {data.spendByTask.length > 0 && (
          <div className="kv">
            {data.spendByTask.map((t) => (
              <span key={t.task} style={{ display: 'contents' }}>
                <span className="muted">{TASKS[t.task] ?? t.task}</span>
                <span className="num">
                  {t.calls} calls · ${(t.cost ?? 0).toFixed(4)}
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="h2">Models</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Each task tries these in order, skipping any whose key is not set. Calls go through AI Gateway unless marked direct. Change them in <code>packages/server/src/models/routes.json</code> or with the <code>MODEL_ROUTES</code> var. Voice notes use {data.routes.transcribe.model}.
          {data.routes.gatewayMissing && <span className="warn"> The AI Gateway named in AI_GATEWAY_ID does not exist yet, so Workers AI calls are going direct (still logged here). Create it in the dashboard.</span>}
        </p>
        <div className="kv">
          {Object.entries(data.routes.tasks).map(([task, chain]) => (
            <span key={task} style={{ display: 'contents' }}>
              <span className="muted">{TASKS[task] ?? task}</span>
              <span>
                {chain.map((m, i) => (
                  <span key={m.key} className={m.available ? '' : 'muted'} style={{ textDecoration: m.available ? undefined : 'line-through' }}>
                    {i > 0 && ' → '}
                    {m.provider === 'workers-ai' ? m.model.replace('@cf/', '') : `${m.provider}/${m.model}`}
                    {m.thinking && m.thinking !== 'none' && m.thinking !== 'off' && <span className="muted"> (thinking {m.thinking})</span>}
                    {m.viaGateway === false && <span className="muted"> (direct)</span>}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="h2">Secrets and access</h2>
        <div className="kv">
          {Object.entries(data.secrets).map(([k, v]) => (
            <span key={k} style={{ display: 'contents' }}>
              <code>{k}</code>
              <span className={v ? 'ok' : 'muted'}>{v ? 'set' : 'not set'}</span>
            </span>
          ))}
          <span>Cloudflare Access</span>
          <span className={data.access.teamDomain && data.access.aud ? 'ok' : 'warn'}>{data.access.teamDomain && data.access.aud ? `on, owner ${data.access.owner}` : 'not configured (only local development can reach the Desk)'}</span>
          <span>Published files</span>
          <span>{data.filesBase}</span>
        </div>
      </section>

      <section className="section">
        <h2 className="h2">Reader devices</h2>
        <p className="serif" style={{ margin: 0, fontSize: 17 }}>
          {data.devices.length ? data.devices.map((d) => `${d.n} ${d.platform} ${d.enabled ? 'on' : 'off'}`).join(', ') : 'No devices have registered for notifications yet.'}
          {!data.secrets.FCM_SERVICE_ACCOUNT && <span className="small muted"> Push is not configured (FCM_SERVICE_ACCOUNT).</span>}
        </p>
      </section>

      <section className="section">
        <h2 className="h2">Recent model calls</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="calls">
            <thead>
              <tr>
                <th>When</th>
                <th>Task</th>
                <th>Model</th>
                <th>Tokens in/out</th>
                <th>Cost</th>
                <th>Time</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {data.recentCalls.map((c, i) => (
                <tr key={i}>
                  <td className="num">{new Date(c.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{TASKS[c.task] ?? c.task}</td>
                  <td>
                    {c.model.replace('@cf/', '')}
                    <span className="muted"> · {c.provider}</span>
                  </td>
                  <td className="num">{c.audio_seconds ? `${Math.round(c.audio_seconds)} s audio` : `${c.input_tokens}${c.cached_input_tokens ? ` (${c.cached_input_tokens} cached)` : ''} / ${c.output_tokens}${c.reasoning_tokens ? ` (${c.reasoning_tokens} thinking)` : ''}`}</td>
                  <td className="num">${c.cost_usd.toFixed(4)}</td>
                  <td className="num">{(c.latency_ms / 1000).toFixed(1)} s</td>
                  <td className={c.ok ? 'ok' : 'bad'}>{c.ok ? 'ok' : (c.error ?? 'failed').slice(0, 80)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

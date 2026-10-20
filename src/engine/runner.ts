// Runs an app under the collector, drives its scenarios, and turns what it observed into findings.
// Scan → Prove → (you Fix) → Verify: this file is Scan and Prove; compareRuns is Verify.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, openSync, readSync, closeSync, statSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { connect } from 'node:net';
import { inspectLog } from '../capture/inspect.ts';
import { startProxy } from '../capture/proxy.ts';
import { importHar, importLog } from '../capture/importers.ts';
import { runKey } from './mask.ts';
import { evaluate } from './rules.ts';
import { stateDir, nextRunNumber, saveRun } from './store.ts';
import type { Policy } from './policy.ts';
import type { CaptureEvent, Run, ScenarioResult } from './types.ts';

export type Progress =
  | { type: 'phase'; phase: 'starting' | 'ready' | 'scenarios' | 'evaluating' | 'done'; detail?: string }
  | { type: 'step'; scenario: string; request: string; status: number | null; ok: boolean }
  | { type: 'captured'; requests: number; logs: number }
  | { type: 'error'; code: 'nostart' | 'silent' | 'stopped' | 'policy'; message: string; detail?: string };

export interface RunOptions { scenario?: string; onProgress?: (p: Progress) => void; signal?: AbortSignal }

// In a checkout this is register.ts; scripts/build.ts rewrites every `new URL('….ts')` to .js for dist/.
const REGISTER = new URL('../capture/register.ts', import.meta.url).href;

export async function runPolicy(policy: Policy, opts: RunOptions = {}): Promise<Run> {
  const emit = opts.onProgress ?? (() => {});
  const root = policy.root;
  const dir = stateDir(root);
  const id = randomBytes(6).toString('hex');
  const capture = join(dir, 'tmp', `capture-${id}.ndjson`);
  const key = runKey(); // lives only in memory for this run
  const startedAt = new Date().toISOString();
  const scenarios = policy.scenarios.filter(s => !opts.scenario || s.name === opts.scenario);
  const results: ScenarioResult[] = [];
  const logEvents: CaptureEvent[] = [];
  let child: ChildProcess | undefined, stderr = '', status: Run['status'] = 'complete', error: string | undefined;

  // tail configured log files during the run so each line gets the time it was written
  const tails = policy.logs.map(l => ({ src: l, file: resolve(root, l.path), offset: existsSync(resolve(root, l.path)) ? statSync(resolve(root, l.path)).size : 0, rest: '' }));
  const pollLogs = () => {
    for (const t of tails) {
      if (!existsSync(t.file)) continue;
      const size = statSync(t.file).size;
      if (size < t.offset) t.offset = 0; // rotated
      if (size === t.offset) continue;
      const fd = openSync(t.file, 'r'), buf = Buffer.alloc(size - t.offset);
      readSync(fd, buf, 0, buf.length, t.offset); closeSync(fd);
      t.offset = size;
      const lines = (t.rest + buf.toString('utf8')).split(/\r?\n/);
      t.rest = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) { const e = inspectLog(t.src.path, line, key); if (e) logEvents.push(e); }
    }
  };
  const counts = () => {
    let req = 0, logs = logEvents.length;
    if (existsSync(capture)) for (const l of readFileSync(capture, 'utf8').split('\n')) { if (l.includes('"type":"request"')) req++; else if (l.includes('"type":"log"')) logs++; }
    return { requests: req, logs };
  };
  const ticker = setInterval(() => { pollLogs(); emit({ type: 'captured', ...counts() }); }, 120);

  let proxy: { port: number; close: () => void } | undefined;
  try {
    if (!scenarios.length || scenarios.some(s => !s.steps.length)) throw new StartError('No runnable steps: select a configured scenario with at least one step.');
    if (policy.app.start) {
      emit({ type: 'phase', phase: 'starting', detail: policy.app.start });
      if (await stillBusy(policy)) throw new StartError(`Something is already listening on ${policy.app.url}. Stop it, or change app.url, so ZcashFlight tests the app it starts.`, `${new URL(policy.app.url).port || 80} is already in use`);
      if (policy.app.proxy) proxy = await startProxy({ out: capture, key, sinkhole: policy.sinkhole });
      const cmd = policy.app.start.replace(/^node(\s|$)/, `"${process.execPath}"$1`);
      const proxyUrl = proxy ? `http://127.0.0.1:${proxy.port}` : undefined;
      const env = {
        ...process.env, ...policy.app.env,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${REGISTER}`].filter(Boolean).join(' '),
        ZCASHFLIGHT_OUT: capture, ZCASHFLIGHT_KEY: key, ZCASHFLIGHT_ROOT: root,
        ZCASHFLIGHT_SINKHOLE: policy.sinkhole ? '1' : '0',
        ...(proxyUrl ? { HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl, http_proxy: proxyUrl, https_proxy: proxyUrl, ZCASHFLIGHT_PROXY: proxyUrl } : {}),
      };
      child = spawn(cmd, { cwd: root, env, shell: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout?.on('data', () => {});
      child.stderr?.on('data', d => { stderr = (stderr + d).slice(-4000); });
    }
    await waitReady(policy, child, () => stderr);
    emit({ type: 'phase', phase: 'ready' });

    emit({ type: 'phase', phase: 'scenarios' });
    const vars: Record<string, string> = {};
    const fill = (v: unknown): any => typeof v === 'string' ? v.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '') : Array.isArray(v) ? v.map(fill) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
    outer: for (const s of scenarios) {
      const r: ScenarioResult = { name: s.name, description: s.description, ok: true, steps: [], window: [Date.now(), 0] };
      results.push(r);
      for (const st of s.steps) {
        if (opts.signal?.aborted) { status = 'incomplete'; const left = scenarios.slice(scenarios.indexOf(s) + (r.steps.length ? 1 : 0)).map(x => x.name); error = `stopped: ${left.join(' and ') || 'the last step'} didn't run`; break outer; }
        const t0 = Date.now(), request = `${st.method} ${st.path.replace(/\{\{(\w+)\}\}/g, ':$1')}`;
        try {
          const res = await fetch(new URL(fill(st.path), policy.app.url), {
            method: st.method,
            headers: { ...(st.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(st.headers ?? {}) },
            body: st.json !== undefined ? JSON.stringify(fill(st.json)) : undefined,
            signal: AbortSignal.timeout(st.timeoutMs ?? 10000),
          });
          const text = await res.text();
          if (st.save) { try { const j = JSON.parse(text); for (const [k, f] of Object.entries(st.save)) vars[k] = String(f.split('.').reduce((o: any, x) => o?.[x], j) ?? ''); } catch { /* not JSON */ } }
          const ok = st.expect ? res.status === st.expect : res.status < 500;
          r.steps.push({ request, status: res.status, ok, ms: Date.now() - t0 });
          if (!ok) {
            r.ok = false; status = 'incomplete';
            error = `stopped: ${s.name} returned unexpected HTTP ${res.status}`;
          }
          emit({ type: 'step', scenario: s.name, request, status: res.status, ok });
        } catch (e: any) {
          r.steps.push({ request, status: null, ok: false, ms: Date.now() - t0, error: e?.message });
          r.ok = false; status = 'incomplete'; error = `stopped: ${s.name} could not reach the app (${e?.cause?.code ?? e?.message})`;
          emit({ type: 'step', scenario: s.name, request, status: null, ok: false });
          emit({ type: 'error', code: 'stopped', message: error });
          r.window[1] = Date.now();
          break outer;
        }
      }
      r.window[1] = Date.now();
    }
    await new Promise(r => setTimeout(r, 400)); // let async logging and fire-and-forget requests land
    pollLogs();
  } catch (e: any) {
    status = 'failed';
    error = e?.message ?? String(e);
    emit({ type: 'error', code: e?.code ?? 'nostart', message: error!, detail: e?.detail });
  } finally {
    clearInterval(ticker);
    if (child) killTree(child);
    proxy?.close();
  }

  emit({ type: 'phase', phase: 'evaluating' });
  const appEvents: CaptureEvent[] = existsSync(capture)
    ? readFileSync(capture, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as CaptureEvent)
    : [];
  rmSync(capture, { force: true });
  const loaded = new Set(appEvents.flatMap(e => (e.stack ?? []).map(l => l.file)));
  for (const e of logEvents) if (!e.at) { const at = sourceMatch(root, e.line ?? '', loaded); if (at) { e.at = at; e.stack = [at]; } }
  const events = [...appEvents, ...logEvents];
  if (status === 'complete' && policy.app.start && !events.length) {
    status = 'incomplete';
    error = 'silent: the app ran but nothing reached the collector';
    emit({ type: 'error', code: 'silent', message: error });
  }
  const run = buildRun(policy, events, results, { id, startedAt, status, error, skipped: policy.scenarios.filter(s => !scenarios.includes(s)).map(s => s.name) });
  emit({ type: 'phase', phase: 'done' });
  return run;
}

/** Offline scan: HAR exports and log files, evaluated against the same policy and rules as a live run. */
export function scanFiles(policy: Policy, files: string[]): Run {
  const key = runKey(), startedAt = new Date().toISOString();
  const events = files.flatMap(f =>
    /\.har$/i.test(f) ? importHar(f, key)
    : importLog(f, key, relative(policy.root, resolve(f)).replace(/\\/g, '/')));
  const t0 = Math.min(...events.map(e => e.t), Date.now());
  const results: ScenarioResult[] = [{ name: 'import', description: files.map(f => relative(policy.root, resolve(f)).replace(/\\/g, '/')).join(', '), ok: true, steps: [], window: [t0, Date.now()] }];
  return buildRun(policy, events, results, { id: randomBytes(6).toString('hex'), startedAt, status: 'complete', imported: files });
}

interface BuildMeta { id: string; startedAt: string; status: Run['status']; error?: string; skipped?: string[]; imported?: string[] }

function buildRun(policy: Policy, raw: CaptureEvent[], results: ScenarioResult[], m: BuildMeta): Run {
  const root = policy.root;
  const events = [...raw].sort((a, b) => a.t - b.t || a.seq - b.seq).map((e, i) => ({ ...e, seq: i + 1 }));
  const requests = events.filter(e => e.type === 'request');
  const { id, startedAt, status, error } = m;
  const findings = status === 'failed' ? [] : evaluate(events, policy, results);
  const n = nextRunNumber(root);
  const run: Run = {
    version: 1, n, id, startedAt, finishedAt: new Date().toISOString(),
    app: policy.app.name, network: policy.network, policyHash: policy.hash, protect: policy.protect,
    status, error, scenarios: results,
    stats: {
      requests: requests.length,
      external: requests.filter(e => !e.loopback).length,
      sinkholed: requests.filter(e => e.sinkholed).length,
      logs: events.filter(e => e.type === 'log').length,
      hosts: [...new Set(requests.map(e => e.host!).filter(Boolean))].sort(),
    },
    findings,
    coverage: m.imported ? {
      tested: [`Imported: ${results[0].description}`, ...(policy.transactions.shieldedOnly ? ['Wallet RPC sends found in the import'] : [])],
      notTested: ['Anything not in the imported files', ...policy.notTested],
    } : {
      tested: [
        ...results.map(r => `${r.name}${r.ok ? '' : ' (incomplete)'}`),
        'Outbound fetch and http(s) requests from the app process' + (policy.app.proxy ? ', plus traffic through the local proxy' : ''),
        'Console output' + (policy.logs.length ? ' and ' + policy.logs.map(l => l.path).join(', ') : ''),
        ...(policy.transactions.shieldedOnly ? ['Wallet RPC sends (z_sendmany, sendtoaddress, sendmany)'] : []),
      ],
      notTested: [
        ...(m.skipped ?? []).map(s => `${s} (not run)`),
        ...(policy.app.proxy ? ['HTTPS bodies through the proxy (host only; not decrypted)'] : []),
        ...policy.notTested,
      ],
    },
    fingerprint: fingerprint(policy.hash, findings.map(f => f.id)),
  };
  saveRun(root, run);
  return run;
}

/** Is anything already accepting connections where the app should be? A TCP probe, so any server counts. */
function answers(policy: Policy): Promise<boolean> {
  const u = new URL(policy.app.url);
  return new Promise(ok => {
    const sock = connect({ host: u.hostname, port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)) });
    const done = (v: boolean) => { sock.destroy(); ok(v); };
    sock.once('connect', () => done(true)).once('error', () => done(false)).setTimeout(800, () => done(false));
  });
}

function fingerprint(policyHash: string, ids: string[]): string {
  const h = createHash('sha256').update(policyHash + ':' + [...ids].sort().join(',')).digest('hex');
  return h.slice(0, 4) + ' ' + h.slice(4, 8);
}

class StartError extends Error { code = 'nostart'; detail?: string; constructor(m: string, d?: string) { super(m); this.detail = d; } }

async function waitReady(policy: Policy, child: ChildProcess | undefined, err: () => string) {
  const until = Date.now() + policy.app.timeoutMs;
  let exited: number | null = null;
  child?.on('exit', c => { exited = c ?? -1; });
  while (Date.now() < until) {
    if (exited !== null) throw new StartError(`${policy.app.name} exited before it was ready (code ${exited})`, tail(err()));
    try {
      const r = await fetch(new URL(policy.app.ready, policy.app.url), { signal: AbortSignal.timeout(1000) });
      await r.arrayBuffer();
      if (r.status < 500) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new StartError(`${policy.app.name} did not answer ${policy.app.ready} within ${policy.app.timeoutMs / 1000}s`, tail(err()));
}
const tail = (s: string) => s.trim().split(/\r?\n/).slice(-6).join('\n');

function killTree(child: ChildProcess) {
  if (child.exitCode !== null || !child.pid) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM');
  } catch { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
}

/** Log files carry no stack trace. Find the source line that printed it by its literal text before the first masked value,
 *  preferring files the app was seen executing. */
function sourceMatch(root: string, line: string, loaded: Set<string>): CaptureEvent['at'] {
  const before = line.split(/•|…|\[redacted/)[0] ?? '';
  const lit = before.replace(/^\S*\s*(DEBUG|INFO|WARN|WARNING|ERROR|TRACE)\b:?\s*/i, '').replace(/[^\s=:"'`]*$/, '').trimStart();
  if (lit.length < 8) return undefined;
  const files: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 5) return;
    for (const n of readdirSync(d, { withFileTypes: true })) {
      if (n.name.startsWith('.') || n.name === 'node_modules' || n.name === 'dist') continue;
      const p = join(d, n.name);
      if (n.isDirectory()) walk(p, depth + 1);
      else if (['.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx'].includes(extname(n.name))) files.push(relative(root, p).replace(/\\/g, '/'));
    }
  };
  try { walk(root, 0); } catch { return undefined; }
  files.sort((a, b) => Number(loaded.has(b)) - Number(loaded.has(a)));
  for (const f of files) {
    const rows = readFileSync(join(root, f), 'utf8').split(/\r?\n/);
    const i = rows.findIndex(r => r.includes(lit));
    if (i !== -1) return { file: f, line: i + 1, col: rows[i].indexOf(lit) + 1 };
  }
  return undefined;
}

/** A process that just exited (an earlier run, a test) can hold the port for a moment: give it up to 3 seconds to free. */
async function stillBusy(policy: Policy): Promise<boolean> {
  for (let i = 0; i < 12; i++) {
    if (!(await answers(policy))) return false;
    await new Promise(r => setTimeout(r, 250));
  }
  return true;
}

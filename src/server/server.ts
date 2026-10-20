// The local dashboard: the ZcashFlight journey, driven by real runs.
// Binds to 127.0.0.1 only. Every API call needs this process's random token, and the Host header must be
// local, so a web page cannot drive it (no CSRF, no DNS rebinding).

import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname, relative, sep } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { findPolicy, loadPolicy, writeProtect, toClass, type Policy } from '../engine/policy.ts';
import { runPolicy, type Progress } from '../engine/runner.ts';
import { listRuns, getRun, previousRun, compareRuns } from '../engine/store.ts';
import { markdown, html, sarif } from '../engine/report.ts';
import type { Run } from '../engine/types.ts';

const PKG = fileURLToPath(new URL('../..', import.meta.url));
const UI = join(PKG, 'ui');
const SAMPLE = resolve(PKG, 'examples', 'zecshop');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

export interface ServerOptions { dir: string; port: number }

export async function startServer(o: ServerOptions): Promise<string> {
  const token = randomBytes(24).toString('hex');
  let dir = resolve(o.dir);
  let running: { abort: AbortController } | null = null;
  const listeners = new Set<http.ServerResponse>();
  const broadcast = (data: unknown) => { const s = `data: ${JSON.stringify(data)}\n\n`; for (const l of listeners) l.write(s); };

  const policy = (): Policy | null => { const f = findPolicy(dir); return f ? loadPolicy(f) : null; };
  const pretty = (p: string) => { const h = homedir(); return p.startsWith(h) ? '~' + p.slice(h.length).replace(/\\/g, '/') : p.replace(/\\/g, '/'); };
  const summary = (r: Run) => ({ n: r.n, finishedAt: r.finishedAt, status: r.status, findings: r.findings.length, fingerprint: r.fingerprint, requests: r.stats.requests });

  function state() {
    const p = policy();
    const root = p?.root ?? dir;
    const runs = listRuns(root);
    const latest = runs[runs.length - 1] ?? null, previous = (latest && previousRun(root, latest.app, latest.n)) ?? null;
    return {
      project: { name: p?.app.name ?? dir.split(sep).pop(), path: pretty(root), policyFile: p ? relative(root, p.file) : null, sample: resolve(root) === SAMPLE, running: !!running },
      policy: p && {
        protect: p.protect, network: p.network,
        destinations: p.destinations.map(d => ({ host: d.host, purpose: d.purpose, allow: d.allow })),
        scenarios: p.scenarios.map(s => ({ name: s.name, description: s.description, steps: s.steps.length })),
        logs: p.logs.map(l => l.path), notTested: p.notTested, start: p.app.start,
      },
      runs: runs.map(summary),
      latest, previous,
      comparison: latest ? compareRuns(previous ?? undefined, latest) : null,
    };
  }

  async function body(req: http.IncomingMessage): Promise<any> {
    let s = '';
    for await (const c of req) { s += c; if (s.length > 1e5) throw new Error('too large'); }
    return s ? JSON.parse(s) : {};
  }
  const json = (res: http.ServerResponse, code: number, data: unknown) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) { res.writeHead(403); res.end('ZcashFlight only answers on this machine.'); return; }
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');

    if (url.pathname.startsWith('/api/')) {
      const t = String(req.headers['x-zcashflight-token'] ?? url.searchParams.get('token') ?? '');
      const supplied = Buffer.from(t), expected = Buffer.from(token);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(res, 401, { error: 'bad token' });
      try {
        if (url.pathname === '/api/state') return json(res, 200, state());

        if (url.pathname === '/api/events') {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
          res.write(': ok\n\n');
          listeners.add(res);
          req.on('close', () => listeners.delete(res));
          return;
        }

        if (url.pathname === '/api/run' && req.method === 'POST') {
          const p = policy();
          if (!p) return json(res, 404, { error: 'notfound' });
          if (running) return json(res, 409, { error: 'a run is already in progress' });
          const before = previousRun(p.root, p.app.name);
          const abort = new AbortController();
          running = { abort };
          json(res, 202, { started: true, after: before?.n ?? 0 });
          runPolicy(p, { signal: abort.signal, onProgress: (e: Progress) => broadcast(e) })
            .then(run => broadcast({ type: 'run', run, comparison: compareRuns(before, run) }))
            .catch(e => broadcast({ type: 'error', code: 'nostart', message: String(e?.message ?? e) }))
            .finally(() => { running = null; });
          return;
        }

        if (url.pathname === '/api/stop' && req.method === 'POST') { running?.abort.abort(); return json(res, 200, { ok: true }); }

        if (url.pathname === '/api/policy' && req.method === 'POST') {
          const p = policy();
          if (!p) return json(res, 404, { error: 'notfound' });
          const b = await body(req);
          writeProtect(p.file, (b.protect ?? []).map(toClass));
          return json(res, 200, state());
        }

        if (url.pathname === '/api/project' && req.method === 'POST') {
          const b = await body(req);
          const raw = String(b.path ?? '').trim();
          const target = b.sample ? SAMPLE : resolve(raw.replace(/^~(?=$|[\\/])/, homedir()));
          if (!raw && !b.sample) return json(res, 400, { error: 'empty' });
          if (!existsSync(target) || !statSync(target).isDirectory()) return json(res, 404, { error: 'notfound' });
          if (!findPolicy(target)) return json(res, 404, { error: 'nopolicy', path: pretty(target) });
          dir = target;
          return json(res, 200, state());
        }

        if (url.pathname === '/api/sample' && req.method === 'POST') {
          if (resolve(policy()?.root ?? '') !== SAMPLE) return json(res, 403, { error: 'only the bundled ZecShop sample can be patched from here' });
          const b = await body(req);
          const mode = b.action === 'reset' ? 'reset' : 'apply';
          const r = spawnSync(process.execPath, [join(SAMPLE, 'scripts', 'fixes.ts'), mode], { cwd: SAMPLE, encoding: 'utf8' });
          return json(res, r.status === 0 ? 200 : 500, { ok: r.status === 0, output: (r.stdout + r.stderr).trim() });
        }

        const rep = /^\/api\/report\/(\d+)\.(html|md|sarif|json)$/.exec(url.pathname);
        if (rep) {
          const root = policy()?.root ?? dir;
          const run = getRun(root, +rep[1]);
          if (!run) return json(res, 404, { error: 'no such run' });
          const prev = previousRun(root, run.app, run.n);
          const cmp = prev ? compareRuns(prev, run) : undefined;
          const [type, out] = rep[2] === 'html' ? ['text/html; charset=utf-8', html(run, cmp)] : rep[2] === 'md' ? ['text/markdown; charset=utf-8', markdown(run, cmp)] : rep[2] === 'sarif' ? ['application/sarif+json', JSON.stringify(sarif(run), null, 2)] : ['application/json', JSON.stringify(run, null, 2)];
          res.writeHead(200, { 'content-type': type, 'content-disposition': `attachment; filename="zcashflight-run-${run.n}.${rep[2]}"` });
          res.end(out);
          return;
        }
        return json(res, 404, { error: 'not found' });
      } catch (e: any) {
        return json(res, 500, { error: String(e?.message ?? e) });
      }
    }

    // static files
    let path: string;
    try { path = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname); }
    catch { res.writeHead(400); res.end('bad path'); return; }
    const file = resolve(UI, '.' + path);
    if (!file.startsWith(UI + sep) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    let data: Buffer | string = readFileSync(file);
    if (path === '/index.html') data = data.toString('utf8').replace('<!--ZF_LIVE-->', `<script>window.ZF_LIVE=${JSON.stringify({ token })}</script>`);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });

  await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(o.port, '127.0.0.1', () => ok()); });
  return `http://127.0.0.1:${(server.address() as any).port}/`;
}

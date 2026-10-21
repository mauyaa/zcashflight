import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import { once } from 'node:events';
import { inspectRequest, inspectLog, isLoopback } from '../src/capture/inspect.ts';
import { scanBody } from '../src/zcash/detect.ts';
import { synth } from '../src/zcash/synth.ts';
import { loadPolicy } from '../src/engine/policy.ts';
import { STARTUP, evaluate } from '../src/engine/rules.ts';
import { runPolicy, scanFiles } from '../src/engine/runner.ts';
import { compareRuns } from '../src/engine/store.ts';
import { headline } from '../src/engine/report.ts';

const exec = promisify(execFile);
const request = (url: string) => inspectRequest({ method: 'GET', url, body: '', headers: {}, via: 'fetch' }, 'test');

test('duplicate query and form fields retain every protected value', () => {
  const seed = synth.seedPhrase(), addr = synth.saplingAddress();
  const q = new URLSearchParams([['seed', seed], ['seed', 'public'], ['to', addr], ['to', 'none']]);
  const e = request('https://example.invalid/?' + q);
  assert.equal(e.hits.length, 2);
  assert.ok(!decodeURIComponent(e.url!).includes(seed));
  assert.ok(!e.url!.includes(addr));
  assert.equal(scanBody(q.toString(), 'application/x-www-form-urlencoded').length, 2);
});

test('URL encoding is normalised before redaction and credentials are removed', () => {
  const addr = synth.saplingAddress();
  const encoded = [...addr].map(c => '%' + c.charCodeAt(0).toString(16)).join('');
  const e = request(`https://username:password@example.invalid/${encoded}?to=${encoded}&memo=private+words`);
  assert.equal(e.hits.filter(h => h.cls === 'address').length, 2);
  const url = decodeURIComponent(e.url!);
  for (const raw of [addr, 'username', 'password', 'private words', 'private+words']) assert.ok(!url.includes(raw));
  assert.doesNotThrow(() => request('https://example.invalid/%ZZ'));
});

test('structured logs redact JSON escapes and noncanonical numeric spellings', () => {
  const seed = synth.seedPhrase();
  const raw = JSON.stringify({ memo: 'private "quoted"\nwords', seed, amount: 0.00000001 }).replace(/ /g, '\\u0020').replace('1e-8', '0.00000001');
  const e = inspectLog('console.log', raw, 'test')!;
  const data = JSON.parse(e.line!);
  assert.equal(data.seed, '[redacted seed phrase]');
  assert.equal(data.amount, '••••');
  assert.ok(!data.memo.includes('private'));
  assert.ok(inspectLog('console.log', JSON.stringify([{ seed }]), 'test')!.hits.some(h => h.cls === 'seed-phrase'));
});

test('loopback classification excludes lookalike DNS names and handles IPv6', () => {
  for (const host of ['127.0.0.1', '127.2.3.4:80', 'localhost:3000', '[::1]:80', '::1']) assert.equal(isLoopback(host), true, host);
  for (const host of ['127.evil.invalid', '127.0.0.1.evil.invalid', 'anything.localhost', '[::2]:80']) assert.equal(isLoopback(host), false, host);
});

test('identifiers used as field names are masked in stored metadata', () => {
  const addr = synth.saplingAddress();
  const e = inspectRequest({ method: 'POST', url: 'https://example.invalid/', headers: {}, body: JSON.stringify({ [addr]: { amount: 2 } }), via: 'fetch' }, 'test');
  assert.ok(e.hits.some(h => h.cls === 'address'));
  assert.ok(!JSON.stringify(e).includes(addr));
});

test('NDJSON imports are inspected instead of trusted as pre-masked events', t => {
  const dir = mkdtempSync(join(tmpdir(), 'zf-import-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const seed = synth.seedPhrase(), file = join(dir, 'application.ndjson');
  writeFileSync(file, JSON.stringify({ seed }) + '\n');
  const run = scanFiles(loadPolicy(join(dir, 'zcashflight.yml'), ''), [file]);
  assert.equal(run.findings[0].severity, 'critical');
  assert.ok(!JSON.stringify(run).includes(seed));
});

test('source literals are not persisted and log policy cannot exempt secrets', t => {
  const dir = mkdtempSync(join(tmpdir(), 'zf-source-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const seed = synth.seedPhrase();
  writeFileSync(join(dir, 'app.ts'), `console.log('${seed}');`);
  const p = loadPolicy(join(dir, 'zcashflight.yml'), 'logs:\n  - path: console.log\n    allow: [seed phrases]\n');
  const event = inspectLog('console.log', seed, 'test', [{ file: 'app.ts', line: 1, col: 1 }])!;
  const findings = evaluate([event], p, []);
  assert.equal(findings[0].severity, 'critical');
  assert.equal(findings[0].at?.file, 'app.ts');
  assert.ok(!JSON.stringify(findings).includes(seed));
  assert.equal(findings[0].snippet, undefined);
});

test('traffic before the first scenario is blamed on app startup, not the first scenario', () => {
  const p = loadPolicy(join(mkdtempSync(join(tmpdir(), 'zf-startup-')), 'zcashflight.yml'), 'scenarios:\n  - name: checkout\n    steps:\n      - request: POST /api/checkout\n');
  const e = { ...request('https://registry.example.org/-/version'), scenario: STARTUP, t: 0 };
  const findings = evaluate([e], p, [{ name: 'checkout', ok: true, steps: [], window: [0, 1] }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].title, 'App startup activity revealed to a third party');
});

test('sinkhole covers immediate HTTP requests, hostname overrides and fetch redirects', { timeout: 15000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'zf-hook-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const script = join(dir, 'app.mjs'), capture = join(dir, 'capture.ndjson');
  writeFileSync(script, `
    import http from 'node:http';
    import assert from 'node:assert/strict';
    const status = await new Promise((resolve,reject) => {
      http.get('http://127.0.0.1:9/', {hostname:'external.invalid'}, r => {r.resume();resolve(r.statusCode)}).on('error',reject);
    });
    assert.equal(status,202);
    const bytes = new TextEncoder().encode(${JSON.stringify(synth.saplingAddress())});
    const response = await fetch('http://external.invalid/', {method:'POST', body:new DataView(bytes.buffer)});
    assert.equal(response.status,202);
    const s=http.createServer((q,r)=>{r.writeHead(302,{location:'http://external.invalid/'});r.end()});
    await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
    try { await assert.rejects(fetch('http://127.0.0.1:'+s.address().port), /blocked an automatic redirect/); }
    finally { await new Promise(resolve=>s.close(resolve)); }
  `);
  await exec(process.execPath, ['--import', new URL('../src/capture/register.ts', import.meta.url).href, script], {
    timeout: 10000, env: { ...process.env, ZCASHFLIGHT_OUT: capture, ZCASHFLIGHT_KEY: 'test', ZCASHFLIGHT_ROOT: dir, ZCASHFLIGHT_SINKHOLE: '1' },
  });
  const events = readFileSync(capture, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.equal(events[0].host, 'external.invalid:9');
  assert.equal(events[0].sinkholed, true);
  assert.ok(events[1].hits.some((h: any) => h.cls === 'address'));
});

test('failed HTTP expectations and empty selections never yield a clean comparison', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'zf-run-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const server = http.createServer((q, r) => { r.statusCode = q.url === '/health' ? 200 : 500; r.end(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const p = loadPolicy(join(dir, 'zcashflight.yml'), '');
  p.app.url = `http://127.0.0.1:${(server.address() as any).port}`;
  p.app.ready = '/health';
  p.scenarios = [{ name: 'checkout', steps: [{ method: 'GET', path: '/checkout', expect: 200 }] }];
  const run = await runPolicy(p);
  assert.equal(run.status, 'incomplete');
  assert.equal(compareRuns(undefined, run).verdict, 'incomplete');
  assert.match(headline(run), /did not complete/);
  const absent = await runPolicy(p, { scenario: 'typo' });
  assert.equal(absent.status, 'failed');
  assert.equal(compareRuns(run, absent).closed.length, 0);
});

test('dashboard rejects malformed tokens and paths without crashing or reading siblings', { timeout: 15000 }, async t => {
  const sibling = mkdtempSync(fileURLToPath(new URL('../ui-sibling-', import.meta.url)));
  writeFileSync(join(sibling, 'secret.txt'), 'must stay outside the static root');
  t.after(() => rmSync(sibling, { recursive: true, force: true }));
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import {startServer} from ${JSON.stringify(new URL('../src/server/server.ts', import.meta.url).href)}; console.log(await startServer({dir:process.cwd(),port:0}));`], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { const done = once(child, 'exit'); child.kill(); await done; });
  const [chunk] = await once(child.stdout!, 'data');
  const base = String(chunk).trim();
  assert.equal((await fetch(base + 'api/state?token=' + encodeURIComponent('é'.repeat(48)))).status, 401);
  assert.equal((await fetch(base + '%ZZ')).status, 400);
  assert.equal((await fetch(base + '..%2f' + basename(sibling) + '%2fsecret.txt')).status, 404);
  assert.equal((await fetch(base)).status, 200);
});

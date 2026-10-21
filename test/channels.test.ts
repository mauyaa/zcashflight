// Leak channels, end to end and unit by unit.
//   - test/fixtures/channels/app.ts sends one synthetic address (or txid) through each channel; every one must be found.
//   - Bodies ZcashFlight cannot read must be reported as uninspected, and fail the gate only under strict: true.
//   - Nothing raw may reach .zcashflight/: not the address, not the txid, not a reversible base64 form of either.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { loadPolicy } from '../src/engine/policy.ts';
import { runPolicy } from '../src/engine/runner.ts';
import { main } from '../src/cli/main.ts';
import { bytesToText, readFetchBody, MAX_BODY } from '../src/capture/body.ts';
import { scanBody, scanText } from '../src/zcash/detect.ts';
import { maskString } from '../src/engine/mask.ts';
import { synth } from '../src/zcash/synth.ts';
import { sarif, markdown } from '../src/engine/report.ts';

const DIR = join(import.meta.dirname, 'fixtures', 'channels');
const ADDR = synth.unifiedAddress('channels'), TXID = synth.txid('channels');
const EV64 = Buffer.from(JSON.stringify({ event: 'checkout', address: ADDR })).toString('base64');

function storedText(dir: string): string {
  const out: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : out.push(readFileSync(p, 'latin1')); } };
  walk(dir);
  return out.join('\n');
}

test('every reference channel leaks are found, with masked evidence and nothing raw stored', { timeout: 120000 }, async () => {
  rmSync(join(DIR, '.zcashflight'), { recursive: true, force: true });
  const run = await runPolicy(loadPolicy(join(DIR, 'zcashflight.yml')));
  assert.equal(run.status, 'complete');
  const byScenario = new Map(run.findings.map(f => [f.scenario, f]));
  const expect: Record<string, [string, string]> = {
    'control-json': ['A', 'body.address'],
    'base64-body': ['A', 'body.data[base64].address'],
    'gzip-body': ['A', 'body[gzip].address'],
    'formdata': ['A', 'body[form-data].address'],
    'blob': ['A', 'body.address'],
    'batch-array': ['A', 'body.batch[5].address'],
    'query-string': ['A', 'url.query.addr'],
    'stdout-write': ['B', 'log.txid'],
    'console-log': ['B', 'log'],
    'stream-body': ['A', 'body.address'],
  };
  for (const [scenario, [rule, path]] of Object.entries(expect)) {
    const f = byScenario.get(scenario);
    assert.ok(f, `${scenario}: no finding`);
    assert.equal(f.rule, rule, scenario);
    assert.ok(f.evidence.some(e => e.path === path), `${scenario}: evidence ${f.evidence.map(e => e.path)} lacks ${path}`);
  }
  assert.equal(run.findings.length, Object.keys(expect).length, 'one finding per channel, no duplicates');
  assert.equal(run.stats.logs, 2, 'console.log is counted once, not again through process.stdout');
  assert.deepEqual(run.coverage.uninspected, [], 'every body in these routes was readable');
  assert.ok(run.coverage.tested.some(t => /fetch \(\d+\).*node:http.*console \(1\).*process\.stdout \/ stderr \(1\)/.test(t)), run.coverage.tested.join(' | '));
  const stored = storedText(join(DIR, '.zcashflight'));
  for (const raw of [ADDR, TXID, EV64, EV64.slice(0, 40), encodeURIComponent(ADDR)]) assert.ok(!stored.includes(raw), `raw value stored: ${raw.slice(0, 12)}…`);
});

test('unreadable bodies are reported as uninspected; strict: true fails the gate, the default only warns', { timeout: 120000 }, async () => {
  const run = await runPolicy(loadPolicy(join(DIR, 'zcashflight.uninspected.yml')));
  assert.equal(run.status, 'complete');
  assert.equal(run.findings.length, 0);
  const u = (run.coverage.uninspected ?? []).map(x => `${x.what} | ${x.reason} | ${x.destination} | ${x.scenarios.join(',')}`).sort();
  assert.deepEqual(u, [
    'gzip-encoded request body | decompresses to more than 5.0 MB | analytics.example.com | gzip-bomb',
    'request body (Blob) | over 5.0 MB | analytics.example.com | oversized-blob',
    'request body (async iterable) | a body type ZcashFlight cannot read | analytics.example.com | async-iterable-body',
    'request body | binary (64 bytes); only text-like identifiers inside were checked | analytics.example.com | binary-body',
  ]);
  assert.ok(run.coverage.notTested.some(n => n.startsWith('1 request body (async iterable) to analytics.example.com')));
  // coverage gaps are SARIF tool notifications, never results, and have their own section in reports
  const sr = (sarif(run) as any).runs[0];
  assert.equal(sr.results.length, 0);
  assert.equal(sr.invocations[0].toolExecutionNotifications.length, 4);
  assert.match(markdown(run), /\*\*Not inspected in this run\*\* \(coverage gaps, not findings\)/);
  const quiet = { log: console.log, error: console.error };
  console.log = console.error = () => {};
  try {
    assert.equal(await main(['run', '--dir', DIR, '--policy', join(DIR, 'zcashflight.uninspected.yml'), '--ci']), 0, 'warning only by default');
    assert.equal(await main(['run', '--dir', DIR, '--policy', join(DIR, 'zcashflight.strict.yml'), '--ci']), 1, 'strict: uninspected traffic fails CI');
  } finally { Object.assign(console, quiet); }
});

test('request bodies: encodings, caps and malformed input', async () => {
  const json = JSON.stringify({ address: ADDR });
  for (const [enc, data] of [['gzip', gzipSync(json)], ['deflate', deflateSync(json)], ['br', brotliCompressSync(json)]] as const) {
    const t = bytesToText(data, { 'content-encoding': enc });
    assert.equal(t.text, json, enc); assert.equal(t.decoded, enc); assert.deepEqual(t.uninspected, []);
  }
  assert.equal(bytesToText(gzipSync(json)).decoded, 'gzip', 'gzip recognised by its magic bytes without a header');
  assert.equal(bytesToText(Buffer.from('x^ plain text that merely starts like zlib')).text.startsWith('x^'), true, 'text that only looks like zlib is read as text');
  assert.match(bytesToText(Buffer.from('not gzip'), { 'content-encoding': 'gzip' }).uninspected[0].reason, /malformed gzip/);
  assert.match(bytesToText(gzipSync(json).subarray(0, 12), { 'content-encoding': 'gzip' }).uninspected[0].reason, /malformed gzip/, 'truncated');
  assert.match(bytesToText(Buffer.from(json), { 'content-encoding': 'zstd' }).uninspected[0].reason, /unsupported content-encoding/);
  assert.match(bytesToText(gzipSync(Buffer.alloc(MAX_BODY + 1, 32)), { 'content-encoding': 'gzip' }).uninspected[0].reason, /decompresses to more than/, 'decompression bomb');
  assert.match(bytesToText(Buffer.from([0xff, 0xfe, 0x00, 0x81])).uninspected[0].reason, /binary/);
  assert.match(bytesToText(Buffer.from(json), {}, true).uninspected[0].reason, /only the first/, 'truncated capture is disclosed');
});

test('fetch bodies: FormData, Blob and streams are read without consuming what the app sends', async () => {
  const f = new FormData();
  f.append('address', ADDR);
  f.append('note', new Blob(['memo: rent'], { type: 'text/plain' }), 'n.txt');
  f.append('photo', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), 'p.png');
  const fd = await readFetchBody(f, {}, true);
  assert.deepEqual(JSON.parse(fd.body.text), { address: ADDR, note: 'memo: rent' });
  assert.deepEqual(fd.body.uninspected, [{ what: 'FormData file "photo" (image/png)', reason: 'binary file' }]);
  assert.equal([...f.keys()].length, 3, 'the FormData is untouched');

  const blob = new Blob([JSON.stringify({ address: ADDR })], { type: 'application/json' });
  assert.equal((await readFetchBody(blob, {}, true)).body.text, await blob.text(), 'a Blob stays readable after inspection');

  // a stream that is really sent: fetch gets one tee branch with the identical bytes
  const src = new Blob(['{"address":"' + ADDR + '"}']).stream();
  const r = await readFetchBody(src, {}, false);
  assert.ok(r.replace && r.pending);
  const [sent, seen] = await Promise.all([new Response(r.replace).text(), r.pending]);
  assert.equal(sent, '{"address":"' + ADDR + '"}', 'the original bytes are still sent');
  assert.equal(seen.text, sent);

  const locked = new Blob(['x']).stream(); locked.getReader();
  assert.match((await readFetchBody(locked, {}, false)).body.uninspected[0].reason, /locked/);
});

test('base64 carriers and txid context', () => {
  // Mixpanel style: data=<base64 JSON>, including the "+" that form decoding turns into a space
  const body = 'data=' + EV64;
  const hits = scanBody(body, 'text/plain');
  assert.deepEqual(hits.map(h => [h.path, h.cls, h.encoding]), [['body.data[base64].address', 'address', 'base64']]);
  const masked = maskString(body, hits);
  assert.ok(!masked.includes(ADDR) && !masked.includes(EV64) && /\[base64 carrying utest1/.test(masked), masked);
  const url64 = Buffer.from(JSON.stringify({ to: ADDR })).toString('base64url');
  assert.equal(scanBody(JSON.stringify({ payload: url64 }), 'application/json')[0]?.path, 'body.payload[base64].to');
  // look-alikes that must stay silent
  for (const s of ['SGVsbG8gd29ybGQsIHRoaXMgaXMgYmFzZTY0', 'dGhpcyBpcyBub3QgYSB6Y2FzaCB2YWx1ZSBhdCBhbGw=', 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='])
    assert.deepEqual(scanText(s), [], s);

  for (const line of [`paid txid ${TXID}`, `Transaction ID ${TXID}`, `broadcast ${TXID}`, `broadcast ok txid=${TXID}`, `tx_hash: "${TXID}"`])
    assert.equal(scanText(line).filter(h => h.cls === 'txid').length, 1, line);
  for (const line of [`sha256sum ${TXID}  release.tgz`, `commit ${TXID.slice(0, 40)}`, `block hash ${TXID}`, `cache key ${TXID}`, `${TXID}`])
    assert.equal(scanText(line).filter(h => h.cls === 'txid').length, 0, line);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bech32Decode, base58CheckDecode } from '../src/zcash/encoding.ts';
import { classifyToken } from '../src/zcash/identifiers.ts';
import { scanBody, scanText } from '../src/zcash/detect.ts';
import { synth } from '../src/zcash/synth.ts';
import { maskHit, maskString } from '../src/engine/mask.ts';
import { parseYaml } from '../src/engine/yaml.ts';
import { loadPolicy, writeProtect } from '../src/engine/policy.ts';
import { parseRpc, locate } from '../src/capture/inspect.ts';
import { CASES, runCase } from './cases.ts';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('bech32 and bech32m reference vectors (BIP-173, BIP-350)', () => {
  assert.equal(bech32Decode('A12UEL5L')?.variant, 'bech32');
  assert.equal(bech32Decode('a12uel5l')?.variant, 'bech32');
  assert.equal(bech32Decode('A1LQFN3A')?.variant, 'bech32m');
  assert.equal(bech32Decode('a12uel5m'), null);
  assert.equal(bech32Decode('A12uEL5L'), null); // mixed case
});

test('real mainnet transparent addresses validate; corrupted ones do not', () => {
  assert.equal(classifyToken('t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs')?.kind, 'transparent-p2pkh');
  assert.equal(classifyToken('t3Vz22vK5z2LcKEdg16Yv4FFneEL1zg9ojd')?.kind, 'transparent-p2sh');
  assert.equal(classifyToken('t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbt'), null);
  assert.equal(base58CheckDecode('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')?.length, 21); // bitcoin: valid encoding, not Zcash
  assert.equal(classifyToken('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'), null);
});

test('every synthetic identifier is recognised with its kind and network', () => {
  const want: [string, string, string][] = [
    [synth.unifiedAddress(), 'unified-address', 'testnet'], [synth.unifiedAddress('m', 'main'), 'unified-address', 'mainnet'],
    [synth.saplingAddress(), 'sapling-address', 'testnet'], [synth.texAddress(), 'tex-address', 'testnet'],
    [synth.transparentAddress(), 'transparent-p2pkh', 'testnet'], [synth.unifiedViewingKey(), 'unified-full-viewing-key', 'testnet'],
    [synth.saplingSpendingKey(), 'sapling-extended-spending-key', 'testnet'], [synth.transparentPrivateKey(), 'transparent-private-key', 'testnet'],
  ];
  for (const [v, kind, net] of want) { const id = classifyToken(v); assert.equal(id?.kind, kind, v); assert.equal(id?.network, net); assert.equal(id?.proof, 'checksum'); }
});

test('detectors use field names for values without checksums', () => {
  const hits = scanBody(JSON.stringify({ txid: synth.txid(), amount: 1.5, memo: 'hello', notes: 'x' }), 'application/json');
  assert.deepEqual(hits.map(h => h.cls).sort(), ['amount', 'memo', 'txid']);
  assert.equal(scanText('digest ' + synth.txid()).length, 0, 'bare hex is not a txid');
  assert.equal(scanText(synth.seedPhrase('x', 12))[0]?.cls, 'seed-phrase');
  assert.equal(scanText('to-' + synth.unifiedAddress())[0]?.kind, 'unified-address');
});

test('masking never keeps a raw value, and redacts secrets entirely', () => {
  const ua = synth.unifiedAddress(), seed = synth.seedPhrase();
  const [a] = scanText(ua), [s] = scanText(seed);
  assert.match(maskHit(a, 'k').masked, /^utest1..….{4}$/);
  assert.equal(maskHit(s, 'k').masked, '[redacted seed phrase]');
  assert.ok(!maskString(`to=${encodeURIComponent(ua)}&x=${ua}`, [a]).includes(ua.slice(10, 40)));
  assert.notEqual(maskHit(a, 'k1').ref, maskHit(a, 'k2').ref, 'refs are unlinkable across runs');
  const amt = { cls: 'amount' as const, kind: 'amount', proof: 'context' as const, value: '0.1', path: 'body.amount' };
  assert.equal(maskString('POST http://127.0.0.1:18232/ amount=0.1 v10.1', [amt]), 'POST http://127.0.0.1:18232/ amount=•••• v10.1', 'numbers are masked only where they stand alone');
});

test('code locations resolve on POSIX and Windows stack frames', () => {
  const skip = /zcashflight[\\/]src/;
  const posix = 'Error\n    at track (file:///tmp/shop/lib/analytics.ts:6:3)\n    at file:///tmp/shop/server.ts:56:5';
  assert.deepEqual(locate(posix, '/tmp/shop', skip).map(l => `${l.file}:${l.line}`), ['lib/analytics.ts:6', 'server.ts:56']);
  const win = 'Error\n    at track (file:///C:/shop/lib/analytics.ts:6:3)';
  assert.equal(locate(win, 'C:\\shop', skip)[0]?.file, 'lib/analytics.ts');
  const plain = 'Error\n    at track (/tmp/shop/lib/a.ts:1:1)';
  assert.equal(locate(plain, '/tmp/shop', skip)[0]?.file, 'lib/a.ts');
});

test('wallet RPC parsing knows which pools a send touches', () => {
  const rpc = parseRpc(JSON.stringify({ method: 'z_sendmany', params: ['ANY', [{ address: synth.transparentAddress(), amount: 1 }], 1, null, 'AllowRevealedRecipients'] }));
  assert.deepEqual(rpc?.toPools, ['transparent']);
  assert.equal(rpc?.privacyPolicy, 'AllowRevealedRecipients');
  assert.equal(parseRpc('{"method":"getinfo"}'), undefined);
});

test('yaml subset: nested maps, lists of maps, flow collections, comments', () => {
  assert.deepEqual(parseYaml('a: 1 # c\nb:\n  - x: [1, "two"]\n    y: {k: v}\n  - plain\nc: \'it\'\'s\''), { a: 1, b: [{ x: [1, 'two'], y: { k: 'v' } }, 'plain'], c: "it's" });
});

test('policy: keys and seeds stay protected, protect: rewrites keep the rest of the file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zf-')), f = join(dir, 'zcashflight.yml');
  writeFileSync(f, '# keep me\nprotect:\n  - addresses\n# and me\ndestinations: []\n');
  const p = loadPolicy(f);
  assert.ok(p.protect.includes('seed-phrase') && p.protect.includes('spending-key'));
  writeProtect(f, ['address', 'memo']);
  const text = readFileSync(f, 'utf8');
  assert.match(text, /# keep me/); assert.match(text, /# and me/); assert.match(text, /- memos/);
  assert.deepEqual(loadPolicy(f).protect.slice(0, 2), ['address', 'memo']);
});

for (const c of CASES) test(`validation: ${c.name}`, () => {
  const o = runCase(c);
  assert.ok(o.pass, `expected ${c.expect ? c.expect.rule : 'no findings'}, got ${o.findings.map(f => f.rule + '/' + f.severity).join(',') || 'none'}`);
  assert.ok(!o.leakedRaw, 'a raw value reached stored data');
});

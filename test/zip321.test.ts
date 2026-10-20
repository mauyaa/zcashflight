// ZIP 321 payment request parsing and detection. Vectors marked "spec" are copied from
// https://zips.z.cash/zip-0321 (Examples); the rest exercise the MUST rules one by one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePaymentRequest, findPaymentRequests } from '../src/zcash/zip321.ts';
import { scanBody, scanUrl, scanText } from '../src/zcash/detect.ts';
import { maskString } from '../src/engine/mask.ts';
import { synth } from '../src/zcash/synth.ts';

const SAPLING = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const TADDR = 'tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU';
const UA = synth.unifiedAddress('zip321', 'test');

test('spec: valid single-payment request with memo and message', () => {
  const p = parsePaymentRequest(`zcash:${SAPLING}?amount=1&memo=VGhpcyBpcyBhIHNpbXBsZSBtZW1vLg&message=Thank%20you%20for%20your%20purchase`);
  assert.ok(p.ok);
  assert.equal(p.payments.length, 1);
  assert.deepEqual([p.payments[0].amount, p.payments[0].id.kind, p.payments[0].message], ['1', 'sapling-address', 'Thank you for your purchase']);
  assert.equal(p.payments[0].memoBytes, 22);
});

test('spec: valid two-payment request (transparent + Sapling with a Unicode memo)', () => {
  const p = parsePaymentRequest(`zcash:?address=${TADDR}&amount=123.456&address.1=${SAPLING}&amount.1=0.789&memo.1=VGhpcyBpcyBhIHVuaWNvZGUgbWVtbyDinKjwn6aE8J-PhvCfjok`);
  assert.ok(p.ok);
  assert.deepEqual(p.payments.map(x => [x.index, x.id.pool, x.amount, !!x.memo]), [[0, 'transparent', '123.456', false], [1, 'shielded', '0.789', true]]);
});

test('spec: invalid requests are rejected', () => {
  const bad = [
    `zcash:?amount=3491405.05201255&address.1=${SAPLING}&amount.1=5740296.87793245`,          // no address at the empty index
    `zcash:?address=${TADDR}&amount=1&amount.1=2&address.2=${SAPLING}`,                       // missing address.1
    `zcash:?address.0=${SAPLING}&amount.0=2`,                                                   // leading zero in paramindex
    `zcash:?amount=1.234&amount=2.345&address=${TADDR}`,                                        // duplicate amount
    `zcash:?amount.1=1.234&amount.1=2.345&address.1=${TADDR}`,                                  // duplicate amount.1
    `zcash:${TADDR}?amount=1%30`,                                                               // percent-encoding outside qchar
    `zcash:${TADDR}?%61mount=1`,
    `zcash:%74mEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU?amount=1`,
    `zcash://${TADDR}?amount=1`,                                                                // no authority component
    `zcash:?address=${SAPLING}&amount=5&req-asset=not@valid!chars`,
  ];
  for (const uri of bad) assert.equal(parsePaymentRequest(uri).ok, false, uri);
});

test('amount, memo and required-parameter rules', () => {
  const ok = (u: string) => parsePaymentRequest(u).ok;
  assert.ok(ok(`zcash:${UA}?amount=050`) && ok(`zcash:${UA}?amount=00.500`) && ok(`zcash:${UA}?amount=0.12345678`));
  for (const a of ['50,000.00', '50,00', '50.', '.5', '0.123456789', '21000000.00000001', '-1', '1e3']) assert.equal(ok(`zcash:${UA}?amount=${a}`), false, a);
  assert.ok(ok(`zcash:${UA}?amount=21000000`));
  assert.equal(ok(`zcash:${TADDR}?amount=1&memo=SGk`), false, 'a memo to a transparent address invalidates the URI');
  assert.equal(ok(`zcash:${UA}?memo=SGk+`), false, 'base64 + is not base64url');
  assert.equal(ok(`zcash:${UA}?memo=SGk=`), false, 'padding is not allowed');
  assert.equal(ok(`zcash:${UA}?memo=${'A'.repeat(683)}`), true, '683 base64url chars decode to exactly 512 bytes');
  assert.equal(ok(`zcash:${UA}?memo=${'A'.repeat(684)}`), false, '684 chars decode to 513 bytes');
  assert.equal(ok(`zcash:${UA}?memo=${'A'.repeat(688)}`), false, 'more than 512 decoded bytes');
  assert.equal(ok(`zcash:${UA}?req-future=1`), false, 'unknown req- parameters make the URI invalid');
  assert.ok(ok(`zcash:${UA}?future=1&label=Caf%C3%A9`), 'unknown optional parameters are ignored');
  assert.equal(ok(`zcash:${UA}?amount=1&req-asset=AAAA`), false, 'amount and req-asset together');
  assert.equal(ok('zcash:notanaddress1234567890?amount=1'), false, 'addresses must have a valid encoding');
  assert.equal(ok('zcash:'), false);
});

test('a leaked payment request is reported field by field and masked', () => {
  const memo = Buffer.from('Order 4471 · paid by Amina').toString('base64url');
  const uri = `zcash:${UA}?amount=0.25&memo=${memo}&message=ZecShop%20order%204471`;
  const hits = scanBody(JSON.stringify({ event: 'checkout', props: { payment_request: uri } }), 'application/json');
  assert.deepEqual(hits.map(h => `${h.path}:${h.cls}:${h.proof}`).sort(), [
    'body.props.payment_request[zip321].address:address:checksum',
    'body.props.payment_request[zip321].amount:amount:zip321',
    'body.props.payment_request[zip321].memo:memo:zip321',
  ]);
  const masked = maskString(uri, hits);
  for (const raw of [UA, memo, '0.25']) assert.ok(!masked.includes(raw), raw);
  // in a URL query, percent-encoded as a whole
  const u = scanUrl(`https://analytics.example.com/c?u=${encodeURIComponent(uri)}`);
  assert.ok(u.some(h => h.cls === 'memo' && h.path === 'url.query.u[zip321].memo'));
  // in prose or logs, followed by punctuation
  assert.equal(findPaymentRequests(`pay here: ${uri}.`).length, 1);
  assert.ok(scanText(`QR shown: ${uri}`).some(h => h.cls === 'amount' && h.proof === 'zip321'));
});

test('an invalid request is not credited as ZIP 321, but its address is still found', () => {
  const hits = scanText(`zcash:${TADDR}?amount=1&memo=SGk`);
  assert.ok(hits.some(h => h.cls === 'address' && h.path === 'text'));
  assert.ok(!hits.some(h => h.proof === 'zip321'));
});

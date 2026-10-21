// The validation suite: seeded exposures that must be found, and look-alikes that must not be.
// Each case is raw observations fed through the same inspect → mask → rules path as a live run.

import { inspectLog, inspectRequest } from '../src/capture/inspect.ts';
import { bytesToText, readFetchBody } from '../src/capture/body.ts';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { loadPolicy } from '../src/engine/policy.ts';
import { evaluate } from '../src/engine/rules.ts';
import { synth } from '../src/zcash/synth.ts';
import type { CaptureEvent, Finding, RuleId, Severity } from '../src/engine/types.ts';
import type { DataClass } from '../src/zcash/identifiers.ts';

const KEY = 'validation-suite';
const ua = synth.unifiedAddress('v-ua'), zs = synth.saplingAddress('v-zs'), t = synth.transparentAddress('v-t'), tex = synth.texAddress('v-tex');
const txid = synth.txid('v-tx'), seed = synth.seedPhrase('v-seed'), extsk = synth.saplingSpendingKey('v-sk'), ufvk = synth.unifiedViewingKey('v-vk'), wif = synth.transparentPrivateKey('v-wif');

export const POLICY = loadPolicy('virtual/zcashflight.yml', `
app: { name: validation }
destinations:
  - host: 127.0.0.1:18232
    allow: [addresses, amounts, memos, transaction IDs]
  - host: analytics.example.com
    allow: []
logs: [app.log]
`);
// A shop that has decided transparent payouts are acceptable: a transparent send is policy, not a leak.
const POLICY_TRANSPARENT_OK = loadPolicy('virtual/zcashflight.yml', `
app: { name: validation }
destinations:
  - host: 127.0.0.1:18232
    allow: [addresses, amounts, memos, transaction IDs]
transactions:
  shielded_only: false
`);
// mainnet encodings (synthetic: valid checksums, random payloads, no keys exist for them)
const uaM = synth.unifiedAddress('v-ua-m', 'main'), zsM = synth.saplingAddress('v-zs-m', 'main'), tM = synth.transparentAddress('v-t-m', 'main');
const texM = synth.texAddress('v-tex-m', 'main'), ufvkM = synth.unifiedViewingKey('v-vk-m', 'main'), extskM = synth.saplingSpendingKey('v-sk-m', 'main');
const seed24 = synth.seedPhrase('v-seed-24', 24);
const memo = Buffer.from('Order 9001 for Dana').toString('base64url');
const zip321 = `zcash:${zs}?amount=0.42&memo=${memo}&message=Order%209001`;

const req = (method: string, url: string, body: unknown = '', headers: Record<string, string> = {}) =>
  inspectRequest({ method, url, headers: { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body), via: 'fetch' }, KEY);
const log = (line: string, src = 'app.log') => inspectLog(src, line, KEY)!;
const rpc = (method: string, params: unknown[]) => req('POST', 'http://127.0.0.1:18232/', { jsonrpc: '2.0', id: 1, method, params });
// Bodies that need decoding go through the collector's own reader, exactly as in a live run
const reqBytes = (url: string, body: Buffer, headers: Record<string, string> = {}) => {
  const b = bytesToText(body, headers);
  return inspectRequest({ method: 'POST', url, headers, body: b.text, decoded: b.decoded, uninspected: b.uninspected, via: 'http' }, KEY);
};
const reqFetch = async (url: string, body: unknown, headers: Record<string, string> = {}) => {
  const { body: b } = await readFetchBody(body, headers, true);
  return inspectRequest({ method: 'POST', url, headers, body: b.text, contentType: b.contentType, decoded: b.decoded, uninspected: b.uninspected, via: 'fetch' }, KEY);
};
const A = 'https://analytics.example.com/track';
const ev = (extra: Record<string, unknown>) => JSON.stringify({ event: 'checkout', ...extra });
const form = (entries: [string, string | Blob][]) => { const f = new FormData(); for (const [k, v] of entries) f.append(k, v); return f; };
const memoMulti = Buffer.from('Gift for Sam').toString('base64url');
const zip321Multi = `zcash:?address=${ua}&amount=1.5&address.1=${zs}&amount.1=0.25&memo.1=${memoMulti}`;

export interface Case { name: string; events: CaptureEvent[]; expect: { rule: RuleId; severity?: Severity; classes?: DataClass[] } | null; raw: string[]; policy?: typeof POLICY }

export const CASES: Case[] = [
  { name: 'Unified address and amount in an analytics event', events: [req('POST', 'https://analytics.example.com/track', { event: 'pay', props: { to: ua, amount: 0.5 } })], expect: { rule: 'A', severity: 'high' }, raw: [ua] },
  { name: 'Sapling address in a third-party URL query', events: [req('GET', `https://api.thirdparty.io/lookup?addr=${zs}`)], expect: { rule: 'A' }, raw: [zs] },
  { name: 'Transparent address in a request header', events: [req('GET', 'https://cdn.example.net/x.js', '', { 'x-wallet': t })], expect: { rule: 'A' }, raw: [t] },
  { name: 'Amount with ZEC unit in a form body', events: [inspectRequest({ method: 'POST', url: 'https://forms.example.org/submit', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'note=paid+1.25+ZEC&ok=1', via: 'fetch' }, KEY)], expect: { rule: 'A' }, raw: ['1.25 ZEC'] },
  { name: 'Memo in an error report', events: [req('POST', 'https://errors.example.io/store', { message: 'timeout', extra: { memo: 'rent for march, flat 4' } })], expect: { rule: 'A' }, raw: ['rent for march'] },
  { name: 'Transaction ID in a log line', events: [log(`2026-10-18 INFO broadcast txid=${txid}`)], expect: { rule: 'B', severity: 'high' }, raw: [txid] },
  { name: 'Seed phrase printed by console.error', events: [log(`restore failed for ${seed}`, 'console.error')], expect: { rule: 'B', severity: 'critical' }, raw: [seed.split(' ').slice(0, 3).join(' ')] },
  { name: 'Sapling spending key in a request', events: [req('POST', 'https://backup.example.com/save', { key: extsk })], expect: { rule: 'A', severity: 'critical' }, raw: [extsk] },
  { name: 'Unified viewing key sent to analytics', events: [req('POST', 'https://analytics.example.com/track', { event: 'import', ufvk })], expect: { rule: 'A', severity: 'high' }, raw: [ufvk] },
  { name: 'Transparent private key (WIF) in a log', events: [log(`imported key ${wif}`)], expect: { rule: 'B', severity: 'critical' }, raw: [wif] },
  { name: 'z_sendmany to a transparent address', events: [rpc('z_sendmany', ['ANY_UA', [{ address: t, amount: 1 }], 1, null, 'AllowRevealedRecipients'])], expect: { rule: 'C' }, raw: [t] },
  { name: 'z_sendmany with a revealing privacy policy', events: [rpc('z_sendmany', ['ANY_UA', [{ address: ua, amount: 1 }], 1, null, 'AllowRevealedSenders'])], expect: { rule: 'C' }, raw: [ua] },
  { name: 'sendtoaddress from the transparent pool', events: [rpc('sendtoaddress', [t, 1])], expect: { rule: 'C' }, raw: [t] },
  { name: 'Payment to a TEX address', events: [rpc('z_sendmany', ['ANY_UA', [{ address: tex, amount: 1 }], 1, null, 'FullPrivacy'])], expect: { rule: 'C' }, raw: [tex] },
  { name: 'Unapproved price API on the payment path', events: [req('GET', 'https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd')], expect: { rule: 'D' }, raw: [] },
  { name: 'Structured JSON log with an amount field', events: [log(JSON.stringify({ level: 'info', msg: 'settled', amount_zats: 125000000 }))], expect: { rule: 'B' }, raw: ['125000000'] },
  { name: 'ZIP 321 payment request in an analytics event', events: [req('POST', 'https://analytics.example.com/track', { event: 'qr_shown', props: { uri: zip321 } })], expect: { rule: 'A', severity: 'high' }, raw: [zs, memo] },
  { name: 'ZIP 321 payment request written to a log', events: [log(`checkout ready ${zip321}`)], expect: { rule: 'B', severity: 'high' }, raw: [zs, memo] },
  { name: 'Percent-encoded address in a URL', events: [req('GET', `https://track.example.com/p?u=${encodeURIComponent(ua)}`)], expect: { rule: 'A' }, raw: [ua] },
  // channels that need decoding (Task 2: these were missed or uninspected before)
  { name: 'Base64 JSON body, Mixpanel style (data=<base64>)', events: [req('POST', A, 'data=' + Buffer.from(ev({ address: ua })).toString('base64'))], expect: { rule: 'A', classes: ['address'] }, raw: [ua, Buffer.from(ev({ address: ua })).toString('base64')] },
  { name: 'Base64 value in a URL query', events: [req('GET', `${A}?d=` + encodeURIComponent(Buffer.from(ev({ to: zs })).toString('base64')))], expect: { rule: 'A' }, raw: [zs, Buffer.from(ev({ to: zs })).toString('base64')] },
  { name: 'Base64url payload inside a JSON log line', events: [log(JSON.stringify({ level: 30, payload: Buffer.from(ev({ txid })).toString('base64url') }))], expect: { rule: 'B', classes: ['txid'] }, raw: [txid, Buffer.from(ev({ txid })).toString('base64url')] },
  { name: 'Gzip body (content-encoding: gzip)', events: [reqBytes(A, gzipSync(ev({ address: ua })), { 'content-encoding': 'gzip', 'content-type': 'application/json' })], expect: { rule: 'A' }, raw: [ua] },
  { name: 'Gzip body without a content-encoding header', events: [reqBytes(A, gzipSync(ev({ address: zs })), { 'content-type': 'application/json' })], expect: { rule: 'A' }, raw: [zs] },
  { name: 'Deflate body', events: [reqBytes(A, deflateSync(ev({ memo: 'rent for march' })), { 'content-encoding': 'deflate', 'content-type': 'application/json' })], expect: { rule: 'A', classes: ['memo'] }, raw: ['rent for march'] },
  { name: 'Brotli body', events: [reqBytes(A, brotliCompressSync(ev({ refund_to: t })), { 'content-encoding': 'br', 'content-type': 'application/json' })], expect: { rule: 'A' }, raw: [t] },
  { name: 'FormData field', events: [await reqFetch(A, form([['event', 'checkout'], ['address', ua]]))], expect: { rule: 'A' }, raw: [ua] },
  { name: 'FormData text file with a memo', events: [await reqFetch(A, form([['note', new Blob([JSON.stringify({ memo: 'flat 4 deposit' })], { type: 'application/json' })]]))], expect: { rule: 'A', classes: ['memo'] }, raw: ['flat 4 deposit'] },
  { name: 'Blob body', events: [await reqFetch(A, new Blob([ev({ address: zs })], { type: 'application/json' }))], expect: { rule: 'A' }, raw: [zs] },
  { name: 'ReadableStream body', events: [await reqFetch(A, new Blob([ev({ address: t })]).stream())], expect: { rule: 'A' }, raw: [t] },
  { name: 'Address deep in a batch array', events: [req('POST', A, { batch: [...[1, 2, 3, 4, 5].map(i => ({ event: 'view' + i }) as Record<string, string>), { event: 'pay', address: ua }] })], expect: { rule: 'A' }, raw: [ua] },
  { name: 'pino-style JSON line on stdout', events: [log(JSON.stringify({ level: 30, msg: 'paid', txid }), 'process.stdout')], expect: { rule: 'B', classes: ['txid'] }, raw: [txid] },
  { name: 'console.log("paid txid", <hex>)', events: [log(`paid txid ${txid}`, 'console.log')], expect: { rule: 'B', classes: ['txid'] }, raw: [txid] },
  { name: '"Transaction ID <hex>" in a log', events: [log(`Transaction ID ${txid} confirmed`)], expect: { rule: 'B', classes: ['txid'] }, raw: [txid] },
  { name: '"broadcast <hex>" in a log', events: [log(`broadcast ${txid}`)], expect: { rule: 'B', classes: ['txid'] }, raw: [txid] },
  // ZIP 321 and memos
  { name: 'Multi-payment ZIP 321 request (address.1, amount.1, memo.1)', events: [req('POST', A, { event: 'qr', uri: zip321Multi })], expect: { rule: 'A', classes: ['address', 'amount', 'memo'] }, raw: [ua, zs, memoMulti] },
  { name: 'ZIP 321 request percent-encoded in a URL query', events: [req('GET', `${A}?pay=` + encodeURIComponent(zip321))], expect: { rule: 'A', classes: ['address', 'amount', 'memo'] }, raw: [zs, memo] },
  { name: 'Plain-text memo in a log ("memo: …")', events: [log('order 9001 memo: Rent for March, flat 4')], expect: { rule: 'B', classes: ['memo'] }, raw: ['Rent for March'] },
  { name: 'Memo inside Sentry breadcrumbs', events: [req('POST', 'https://errors.example.io/store', { message: 'timeout', breadcrumbs: [{ message: 'checkout' }, { data: { memo: 'birthday gift' } }] })], expect: { rule: 'A', classes: ['memo'] }, raw: ['birthday gift'] },
  { name: 'Memo in a form-encoded body', events: [inspectRequest({ method: 'POST', url: 'https://crm.example.org/notes', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'memo=thanks+for+the+coffee&id=7', via: 'fetch' }, KEY)], expect: { rule: 'A', classes: ['memo'] }, raw: ['thanks for the coffee'] },
  // amounts
  { name: 'Amount with no telling field name, beside an address', events: [req('POST', A, { to: ua, v: 0.42 })], expect: { rule: 'A', classes: ['address', 'amount'] }, raw: [ua] },
  { name: 'Amount in zats in a URL query', events: [req('GET', `${A}?amount_zats=4200000`)], expect: { rule: 'A', classes: ['amount'] }, raw: [] },
  { name: 'Amount as "0.5 TAZ" in a log', events: [log('received 0.5 TAZ for order 12')], expect: { rule: 'B', classes: ['amount'] }, raw: [] },
  // other payloads
  { name: 'Address in GraphQL variables', events: [req('POST', 'https://api.thirdparty.io/graphql', { query: 'mutation P($to: String!) { pay(to: $to) }', variables: { to: zs } })], expect: { rule: 'A' }, raw: [zs] },
  { name: 'Unified viewing key in a URL query', events: [req('GET', `https://api.thirdparty.io/import?key=${ufvk}`)], expect: { rule: 'A', severity: 'high', classes: ['viewing-key'] }, raw: [ufvk] },
  { name: '24-word seed phrase in an error report', events: [req('POST', 'https://errors.example.io/store', { message: 'restore failed', extra: { input: seed24 } })], expect: { rule: 'A', severity: 'critical', classes: ['seed-phrase'] }, raw: [seed24.split(' ').slice(0, 4).join(' ')] },
  { name: 'Transaction ID in a JSON field (transaction_hash)', events: [req('POST', A, { event: 'paid', transaction_hash: txid })], expect: { rule: 'A', classes: ['txid'] }, raw: [txid] },
  { name: 'z_sendmany with AllowRevealedAmounts', events: [rpc('z_sendmany', ['ANY_UA', [{ address: ua, amount: 1 }], 1, null, 'AllowRevealedAmounts'])], expect: { rule: 'C' }, raw: [ua] },
  // mainnet encodings (synthetic values; see the README for why the live proofs use regtest)
  { name: 'Mainnet unified address (u1…) to analytics', events: [req('POST', A, { event: 'pay', to: uaM })], expect: { rule: 'A', classes: ['address'] }, raw: [uaM] },
  { name: 'Mainnet Sapling address (zs1…) in a log', events: [log(`payout to ${zsM} queued`)], expect: { rule: 'B', classes: ['address'] }, raw: [zsM] },
  { name: 'Mainnet transparent address (t1…) in a header', events: [req('GET', 'https://cdn.example.net/x.js', '', { 'x-wallet': tM })], expect: { rule: 'A' }, raw: [tM] },
  { name: 'Payment to a mainnet TEX address (tex1…)', events: [rpc('z_sendmany', ['ANY_UA', [{ address: texM, amount: 1 }], 1, null, 'FullPrivacy'])], expect: { rule: 'C' }, raw: [texM] },
  { name: 'Mainnet unified viewing key (uview1…) in a log', events: [log(`imported ${ufvkM}`)], expect: { rule: 'B', severity: 'high', classes: ['viewing-key'] }, raw: [ufvkM] },
  { name: 'Mainnet Sapling spending key in a request', events: [req('POST', 'https://backup.example.com/save', { k: extskM })], expect: { rule: 'A', severity: 'critical', classes: ['spending-key'] }, raw: [extskM] },
  // must stay silent
  { name: 'Approved wallet RPC receiving address, amount and memo', events: [rpc('z_sendmany', ['ANY_UA', [{ address: ua, amount: 1, memo: '6869' }], 1, null, 'FullPrivacy'])], expect: null, raw: [] },
  { name: 'A sha256 hash in a log, no transaction context', events: [log('cache key 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 stored')], expect: null, raw: [] },
  { name: 'UUIDs, base58 noise and a one-character-corrupted address', events: [log(`req 3f1c2a9e-4b7d-4c1e-9a55-0c2d8e7f6b1a user 5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTK to ${ua.slice(0, -1)}${ua.endsWith('q') ? 'p' : 'q'}`)], expect: null, raw: [] },
  { name: 'Ordinary English prose', events: [log('Thank you for your order. We will ship it soon and send you an email when it leaves the warehouse.')], expect: null, raw: [] },
  { name: 'ZIP 321 payment request sent to the approved wallet RPC', events: [req('POST', 'http://127.0.0.1:18232/', { jsonrpc: '2.0', id: 1, method: 'pay', params: [zip321] })], expect: null, raw: [] },
  { name: 'Shielding transparent coinbase into a unified address', events: [rpc('z_shieldcoinbase', [t, ua, null, 50])], expect: null, raw: [] },
  { name: 'Transparent payout when the policy permits transparent payments', events: [rpc('z_sendmany', ['ANY_UA', [{ address: t, amount: 1 }], 1, null, 'AllowRevealedRecipients'])], expect: null, raw: [], policy: POLICY_TRANSPARENT_OK },
  { name: 'A SHA-256 file hash next to "sha256sum"', events: [log(`sha256sum ${txid}  release-1.2.3.tgz`)], expect: null, raw: [] },
  { name: 'A Git commit SHA next to "commit"', events: [log(`deployed commit ${txid.slice(0, 40)}`)], expect: null, raw: [] },
  { name: 'A block hash next to "block hash"', events: [log(`new block hash ${txid} at height 2000`)], expect: null, raw: [] },
  { name: 'Base64 of an ordinary analytics event', events: [req('POST', A, 'data=' + Buffer.from(ev({ page: '/shop' })).toString('base64'))], expect: null, raw: [] },
  { name: 'A base64 PNG data URI', events: [req('POST', A, { img: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' })], expect: null, raw: [] },
  { name: 'A JWT in a body field', events: [req('POST', A, { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U' })], expect: null, raw: [] },
  { name: 'Gzip body with an event name only', events: [reqBytes(A, gzipSync(ev({})), { 'content-encoding': 'gzip', 'content-type': 'application/json' })], expect: null, raw: [] },
  { name: 'FormData with an event name only', events: [await reqFetch(A, form([['event', 'view']]))], expect: null, raw: [] },
  { name: 'Bitcoin legacy and bech32 addresses', events: [log('btc 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa and bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')], expect: null, raw: [] },
  { name: 'An Ethereum address', events: [req('POST', A, { from: '0x52908400098527886E0F7030069857D2E4169EE7' })], expect: null, raw: [] },
  { name: 'A fiat order total with its currency', events: [req('POST', A, { event: 'purchase', total: 12.5, currency: 'USD' })], expect: null, raw: [] },
  { name: 'A lone decimal with no address beside it', events: [req('POST', A, { event: 'rating', score: 4.5 })], expect: null, raw: [] },
  { name: 'An address beside an integer id', events: [rpc('z_getaddressforaccount', [0, ['orchard']]), req('POST', 'http://127.0.0.1:18232/', { to: ua, id: 42 })], expect: null, raw: [] },
  { name: '"memo" in ordinary prose', events: [log('the memo field is optional for transparent sends')], expect: null, raw: [] },
  { name: '"zcash:" in prose, not a payment request', events: [log('pay with zcash: it is private by default')], expect: null, raw: [] },
  { name: 'A ZIP 321 request with an invalid address', events: [req('POST', A, { uri: 'zcash:notavalidaddress1234567890?amount=1' })], expect: null, raw: [] },
  { name: 'Version numbers and a loopback address', events: [log('listening on 127.0.0.1:4600, node v22.18.0, app 1.25.3')], expect: null, raw: [] },
  { name: 'A one-character-corrupted mainnet Sapling address', events: [log(`to ${zsM.slice(0, -1)}${zsM.endsWith('q') ? 'p' : 'q'}`)], expect: null, raw: [] },
  { name: 'Approved analytics with an event name only', events: [req('POST', 'https://analytics.example.com/track', { event: 'checkout' })], expect: null, raw: [] },
];

export interface Outcome { c: Case; findings: Finding[]; pass: boolean; leakedRaw: boolean }

export function runCase(c: Case): Outcome {
  const findings = evaluate(c.events, c.policy ?? POLICY, [{ name: 'validation', ok: true, steps: [], window: [0, Date.now()] }]);
  const pass = c.expect
    ? findings.some(f => f.rule === c.expect!.rule && (!c.expect!.severity || f.severity === c.expect!.severity)) &&
      (c.expect.classes ?? []).every(k => findings.some(f => f.classes.includes(k)))
    : findings.length === 0;
  const stored = JSON.stringify(c.events) + JSON.stringify(findings);
  return { c, findings, pass, leakedRaw: c.raw.some(r => r && stored.includes(r)) };
}

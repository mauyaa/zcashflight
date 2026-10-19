// The validation suite: seeded exposures that must be found, and look-alikes that must not be.
// Each case is raw observations fed through the same inspect → mask → rules path as a live run.

import { inspectLog, inspectRequest } from '../src/capture/inspect.ts';
import { loadPolicy } from '../src/engine/policy.ts';
import { evaluate } from '../src/engine/rules.ts';
import { synth } from '../src/zcash/synth.ts';
import type { CaptureEvent, Finding, RuleId, Severity } from '../src/engine/types.ts';

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

const req = (method: string, url: string, body: unknown = '', headers: Record<string, string> = {}) =>
  inspectRequest({ method, url, headers: { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body), via: 'fetch' }, KEY);
const log = (line: string, src = 'app.log') => inspectLog(src, line, KEY)!;
const rpc = (method: string, params: unknown[]) => req('POST', 'http://127.0.0.1:18232/', { jsonrpc: '2.0', id: 1, method, params });

export interface Case { name: string; events: CaptureEvent[]; expect: { rule: RuleId; severity?: Severity } | null; raw: string[] }

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
  { name: 'Payment to a TEX address', events: [rpc('z_sendmany', ['ANY_UA', [{ address: tex, amount: 1 }], 1, null, 'FullPrivacy'])], expect: { rule: 'C' }, raw: [tex] },
  { name: 'Unapproved price API on the payment path', events: [req('GET', 'https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd')], expect: { rule: 'D' }, raw: [] },
  { name: 'Structured JSON log with an amount field', events: [log(JSON.stringify({ level: 'info', msg: 'settled', amount_zats: 125000000 }))], expect: { rule: 'B' }, raw: ['125000000'] },
  { name: 'Percent-encoded address in a URL', events: [req('GET', `https://track.example.com/p?u=${encodeURIComponent(ua)}`)], expect: { rule: 'A' }, raw: [ua] },
  // must stay silent
  { name: 'Approved wallet RPC receiving address, amount and memo', events: [rpc('z_sendmany', ['ANY_UA', [{ address: ua, amount: 1, memo: '6869' }], 1, null, 'FullPrivacy'])], expect: null, raw: [] },
  { name: 'A sha256 hash in a log, no transaction context', events: [log('cache key 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 stored')], expect: null, raw: [] },
  { name: 'UUIDs, base58 noise and a one-character-corrupted address', events: [log(`req 3f1c2a9e-4b7d-4c1e-9a55-0c2d8e7f6b1a user 5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTK to ${ua.slice(0, -1)}${ua.endsWith('q') ? 'p' : 'q'}`)], expect: null, raw: [] },
  { name: 'Ordinary English prose', events: [log('Thank you for your order. We will ship it soon and send you an email when it leaves the warehouse.')], expect: null, raw: [] },
  { name: 'Approved analytics with an event name only', events: [req('POST', 'https://analytics.example.com/track', { event: 'checkout' })], expect: null, raw: [] },
];

export interface Outcome { c: Case; findings: Finding[]; pass: boolean; leakedRaw: boolean }

export function runCase(c: Case): Outcome {
  const findings = evaluate(c.events, POLICY, [{ name: 'validation', ok: true, steps: [], window: [0, Date.now()] }]);
  const pass = c.expect ? findings.some(f => f.rule === c.expect!.rule && (!c.expect!.severity || f.severity === c.expect!.severity)) : findings.length === 0;
  const stored = JSON.stringify(c.events) + JSON.stringify(findings);
  return { c, findings, pass, leakedRaw: c.raw.some(r => r && stored.includes(r)) };
}

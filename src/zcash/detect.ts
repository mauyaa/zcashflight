// Finds sensitive Zcash data inside text and structured payloads.
// Every hit says how it was proven: a checksum, the BIP-39 wordlist, a valid ZIP 321 payment request, or the field it sat in.

import { classifyToken, type DataClass, type Identifier } from './identifiers.ts';
import { BIP39_ENGLISH } from './bip39-english.ts';
import { findPaymentRequests } from './zip321.ts';

export interface Hit extends Identifier {
  value: string;   // raw value; callers mask it before it is stored anywhere
  path: string;    // where it was found: 'body.recipient', 'url.query.to', 'text'
}

const WORDS = new Set(BIP39_ENGLISH);
const TOKEN = /[A-Za-z0-9-]{26,}/g;
const TXID_CTX = /(?:tx_?id|txid|tx_?hash|transaction(?:_?id)?)["'\s]*[=:]\s*["']?([0-9a-f]{64})\b/gi;
const AMOUNT_TXT = /\b(\d+(?:\.\d{1,8})?)\s?(ZEC|TAZ|zats?|zatoshis?)\b/g;
const MEMO_TXT = /\bmemo["'\s]*[=:]\s*("([^"]*)"|'([^']*)'|(\S+))/gi;

const KEY_TXID = /^(tx_?id|txid|tx_?hash|transaction_?(id|hash)|tx)$/i;
const KEY_AMOUNT = /^(amount|amt|value|zats?|zatoshis?|zec|total|price|balance|amount_?zec|amount_?zats?)$/i;
const KEY_MEMO = /^(memo|memo_?text|note|message_?memo)$/i;
const KEY_SEED = /^(seed|seed_?phrase|mnemonic|recovery_?phrase|backup_?phrase)$/i;
const HEX64 = /^[0-9a-f]{64}$/i;

export function scanText(text: string, path = 'text'): Hit[] {
  const hits: Hit[] = [];
  for (const m of text.matchAll(TOKEN)) {
    // Sapling key HRPs contain '-', so a token may also be glued to a word before it ('to-utest1…')
    let tok = m[0], id = classifyToken(tok);
    for (let i = tok.indexOf('-'); !id && i !== -1; i = m[0].indexOf('-', i + 1)) id = classifyToken(tok = m[0].slice(i + 1));
    if (id) hits.push({ ...id, value: tok, path });
  }
  // ZIP 321 payment requests: one string that names the recipient, the amount and the memo
  const requests = findPaymentRequests(text);
  const inRequest = (i: number) => requests.some(r => i >= r.at && i < r.at + r.uri.length);
  for (const r of requests) for (const p of r.payments) {
    const base = `${path}[zip321${p.index ? '.' + p.index : ''}]`;
    for (const h of hits) if (h.cls === 'address' && h.value === p.address && h.path === path) h.path = `${base}.address`;
    if (p.amount !== undefined) hits.push({ cls: 'amount', kind: 'zip321-amount', proof: 'zip321', value: p.amount, path: `${base}.amount` });
    if (p.memo) hits.push({ cls: 'memo', kind: 'zip321-memo', proof: 'zip321', value: p.memo, path: `${base}.memo` });
  }
  for (const m of text.matchAll(TXID_CTX)) hits.push({ cls: 'txid', kind: 'txid', proof: 'context', value: m[1], path });
  for (const m of text.matchAll(AMOUNT_TXT)) hits.push({ cls: 'amount', kind: 'amount', proof: 'context', value: m[0], path });
  for (const m of text.matchAll(MEMO_TXT)) {
    if (inRequest(m.index!)) continue;                 // already reported field by field above
    const v = m[2] ?? m[3] ?? m[4] ?? '';
    if (v && v !== 'null' && v !== 'undefined') hits.push({ cls: 'memo', kind: 'memo', proof: 'context', value: v, path });
  }
  hits.push(...seedPhrases(text, path));
  return hits;
}

function seedPhrases(text: string, path: string): Hit[] {
  const hits: Hit[] = [];
  const words = [...text.matchAll(/[a-z]+/g)];
  let run: RegExpMatchArray[] = [];
  const flush = () => {
    if (run.length >= 12) {
      const start = run[0].index!, end = run[run.length - 1].index! + run[run.length - 1][0].length;
      hits.push({ cls: 'seed-phrase', kind: `bip39-${run.length}-words`, proof: 'wordlist', value: text.slice(start, end), path });
    }
    run = [];
  };
  for (const w of words) {
    const prev = run[run.length - 1];
    const gap = prev ? text.slice(prev.index! + prev[0].length, w.index) : ' ';
    if (WORDS.has(w[0]) && /^[\s,]{1,3}$/.test(gap)) run.push(w);
    else { flush(); if (WORDS.has(w[0])) run.push(w); }
  }
  flush();
  return hits;
}

/** Walk a JSON-like value. Field names give context for values that have no checksum (amounts, memos, txids). */
export function scanValue(v: unknown, path: string, out: Hit[] = []): Hit[] {
  const key = path.split('.').pop() ?? '';
  if (v == null) return out;
  if (typeof v === 'number' || typeof v === 'bigint') {
    if (KEY_AMOUNT.test(key)) out.push({ cls: 'amount', kind: 'amount', proof: 'context', value: String(v), path });
    return out;
  }
  if (typeof v === 'string') {
    const before = out.length;
    out.push(...scanText(v, path));
    const found = (c: DataClass) => out.slice(before).some(h => h.cls === c);
    if (KEY_TXID.test(key) && HEX64.test(v) && !found('txid')) out.push({ cls: 'txid', kind: 'txid', proof: 'context', value: v, path });
    if (KEY_AMOUNT.test(key) && /^\d+(\.\d+)?(\s?(ZEC|TAZ|zats?))?$/i.test(v.trim()) && !found('amount')) out.push({ cls: 'amount', kind: 'amount', proof: 'context', value: v, path });
    if (KEY_MEMO.test(key) && v.trim() && !found('memo')) out.push({ cls: 'memo', kind: 'memo', proof: 'context', value: v, path });
    if (KEY_SEED.test(key) && v.trim().split(/\s+/).length >= 12 && !found('seed-phrase')) out.push({ cls: 'seed-phrase', kind: 'seed-field', proof: 'context', value: v, path });
    return out;
  }
  if (Array.isArray(v)) { v.forEach((x, i) => scanValue(x, `${path}[${i}]`, out)); return out; }
  if (typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      out.push(...scanText(k, `${path}.[field name]`));
      scanValue(x, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

/** Scan a body whose shape we do not know yet: JSON, form-encoded, or plain text. */
export function scanBody(body: string, contentType = '', path = 'body'): Hit[] {
  const t = body.trim();
  if (!t) return [];
  if (/json/.test(contentType) || /^[[{]/.test(t)) {
    try { return scanValue(JSON.parse(t), path); } catch { /* not JSON after all */ }
  }
  if (/x-www-form-urlencoded/.test(contentType) || /^[\w.%-]+=[^&\s]*(&[\w.%-]+=[^&\s]*)*$/.test(t)) {
    return [...new URLSearchParams(t)].flatMap(([k, v]) => scanValue(v, `${path}.${k}`));
  }
  return scanText(body, path);
}

export function scanUrl(url: string): Hit[] {
  let u: URL;
  try { u = new URL(url); } catch { return scanText(url, 'url'); }
  let pathname = u.pathname;
  try { pathname = decodeURIComponent(pathname); } catch { /* malformed escapes must not break capture */ }
  let fragment = u.hash;
  try { fragment = decodeURIComponent(fragment); } catch { /* preserve malformed text */ }
  return [...scanText(pathname, 'url.path'), ...[...u.searchParams].flatMap(([k, v]) => [...scanText(k, 'url.query.[field name]'), ...scanValue(v, `url.query.${k}`)]), ...scanText(fragment, 'url.fragment')];
}

/** De-duplicate hits that point at the same value in the same place. */
export function uniqueHits(hits: Hit[]): Hit[] {
  const seen = new Set<string>();
  return hits.filter(h => {
    const k = h.cls + '|' + h.path + '|' + h.value;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

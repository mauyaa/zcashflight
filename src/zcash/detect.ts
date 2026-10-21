// Finds sensitive Zcash data inside text and structured payloads.
// Every hit says how it was proven: a checksum, the BIP-39 wordlist, a valid ZIP 321 payment request, or the field it sat in.

import { classifyToken, type DataClass, type Identifier } from './identifiers.ts';
import { BIP39_ENGLISH } from './bip39-english.ts';
import { findPaymentRequests } from './zip321.ts';

export interface Hit extends Identifier {
  value: string;   // raw value; callers mask it before it is stored anywhere
  path: string;    // where it was found: 'body.recipient', 'url.query.to', 'text'
  encoding?: 'base64';  // found only after decoding the value that carried it
  carrier?: string;     // that encoded value: reversible, so it is masked as a whole wherever it appears
}

const WORDS = new Set(BIP39_ENGLISH);
const TOKEN = /[A-Za-z0-9-]{26,}/g;
// A 64-hex value counts as a txid only near a txid keyword: right after it, or after at most two short words
// ('paid txid <hex>', 'Transaction ID <hex>', 'broadcast ok txid=<hex>'). Bare hashes are everywhere: no keyword, no txid.
const TXID_CTX = /\b(?:tx[ _-]?id|tx[ _-]?hash|transaction(?:[ _-]?(?:id|hash))?|broadcast(?:ed|ing)?)\b(?:[\s"'`:=#,()[\]{}<>-]{1,6}(?:[a-z]{1,10}[\s"'`:=#,()[\]{}<>-]{1,6}){0,2})([0-9a-f]{64})\b/gi;
const AMOUNT_TXT = /\b(\d+(?:\.\d{1,8})?)\s?(ZEC|TAZ|zats?|zatoshis?)\b/g;
const MEMO_TXT = /\bmemo["'\s]*[=:]\s*("([^"]*)"|'([^']*)'|(\S+))/gi;

const KEY_TXID = /^(tx_?id|txid|tx_?hash|transaction_?(id|hash)|tx)$/i;
const KEY_AMOUNT = /^(amount|amt|value|zats?|zatoshis?|zec|total|price|balance|amount_?zec|amount_?zats?)$/i;
const KEY_MEMO = /^(memo|memo_?text|note|message_?memo)$/i;
const KEY_SEED = /^(seed|seed_?phrase|mnemonic|recovery_?phrase|backup_?phrase)$/i;
const HEX64 = /^[0-9a-f]{64}$/i;

// Base64 / base64url values (Mixpanel-style `data=<base64 JSON>`). Decoded only when the alphabet and padding are
// strict, the size is bounded and the result is printable UTF-8 text; scanned in memory, never stored.
const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const B64_TOKEN = /[A-Za-z0-9+/_-]{24,}={0,2}/g;
const MAX_ENCODED = 256 * 1024;
let decodeDepth = 0;
const utf8 = new TextDecoder('utf-8', { fatal: true });

export function decodeBase64Text(value: string): string | null {
  let s = value.trim();
  if (s.length < 16 || s.length > MAX_ENCODED) return null;
  if (s.includes(' ') && /^[A-Za-z0-9+/= ]+$/.test(s)) s = s.replace(/ /g, '+');   // '+' became ' ' in form decoding
  let buf: Buffer;
  if (B64.test(s)) buf = Buffer.from(s, 'base64');
  else if (B64URL.test(s) && s.length % 4 !== 1) buf = Buffer.from(s, 'base64url');
  else return null;
  let text: string;
  try { text = utf8.decode(buf); } catch { return null; }
  const chars = [...text];
  const printable = chars.filter(c => c >= ' ' || c === '\n' || c === '\r' || c === '\t').length;
  if (!chars.length || printable / chars.length < 0.95 || !/[A-Za-z]{2}/.test(text)) return null;
  return text;
}

/** Scan what an encoded value decodes to. Every hit inside keeps the encoded value, so that is masked too. */
function scanDecoded(value: string, path: string): Hit[] {
  if (decodeDepth >= 2) return [];
  const text = decodeBase64Text(value);
  if (!text) return [];
  decodeDepth++;
  try {
    return scanBody(text, '', `${path}[base64]`).map(h => ({ ...h, encoding: 'base64' as const, carrier: h.carrier ?? value }));
  } finally { decodeDepth--; }
}

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
  // base64 blobs inside free text (log lines), at most a few per text
  if (decodeDepth === 0) {
    let n = 0;
    for (const m of text.matchAll(B64_TOKEN)) {
      if (n++ >= 8) break;
      if (hits.some(h => m[0].includes(h.value) || h.value.includes(m[0]))) continue;
      hits.push(...scanDecoded(m[0], path));
    }
  }
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
    if (out.length === before && decodeDepth === 0) out.push(...scanDecoded(v, path));
    return out;
  }
  if (Array.isArray(v)) { v.forEach((x, i) => scanValue(x, `${path}[${i}]`, out)); return out; }
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>, start = out.length;
    const child = (k: string) => path ? `${path}.${k}` : k;
    for (const [k, x] of Object.entries(obj)) {
      out.push(...scanText(k, `${path}.[field name]`));
      scanValue(x, child(k), out);
    }
    // A sibling currency that is not ZEC makes "price" / "total" a fiat amount, not a Zcash one
    const cur = obj.currency ?? obj.currency_code ?? obj.currencyCode ?? obj.ccy;
    if (typeof cur === 'string' && !/^(zec|taz|zats?|zatoshis?)$/i.test(cur.trim())) {
      for (let i = out.length - 1; i >= start; i--) if (out[i].cls === 'amount' && out[i].kind === 'amount' && Object.keys(obj).some(k => out[i].path === child(k))) out.splice(i, 1);
    }
    // A decimal beside a checksum-verified address in the same object is that payment's amount, whatever the
    // field is called ({ to: <address>, v: 0.42 }). Integers are left alone: they are ids and counts far more often.
    if (Object.keys(obj).some(k => out.slice(start).some(h => h.cls === 'address' && h.proof === 'checksum' && h.path === child(k)))) {
      for (const [k, x] of Object.entries(obj)) {
        const s = typeof x === 'number' ? String(x) : typeof x === 'string' ? x.trim() : '';
        if (!/^\d{1,8}\.\d{1,8}$/.test(s) || !(Number(s) > 0 && Number(s) <= 21_000_000)) continue;
        if (out.slice(start).some(h => h.path === child(k))) continue;
        out.push({ cls: 'amount', kind: 'amount-beside-address', proof: 'context', value: s, path: child(k) });
      }
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
